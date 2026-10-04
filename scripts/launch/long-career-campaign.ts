/**
 * Long-career campaign (L28 / E4).
 *
 * Drives the REAL application coordinator — `useGameStore` actions
 * (initializeNewGame, advanceToWeekEnd → advanceWeek, simulateInstantMatch,
 * transferPlayer, renewContract, signSponsor, resolveEventChoice,
 * declineJobOffer, saveGame/loadGame) — over the full snapshot world for
 * N seeds × M seasons. The managed club follows a small deterministic policy
 * that only uses actions a player could take in the UI. Nothing is injected:
 * no cash, players or outcomes are scripted.
 *
 *   npm run campaign:long -- --seeds=30 --seasons=10 --parallel=3
 *   npm run campaign:long -- --worker --seed=1 --seasons=1     (one career)
 *   npm run campaign:long -- --aggregate                       (rebuild summary)
 *
 * Per-seed results, failing-seed last-good saves and reports go to
 * tmp/long-career/<label>/ (gitignored). The aggregate summary goes to
 * docs/launch-readiness/evidence/long-career-<date>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import type { GameSave, PlayerSaveData, TournamentSaveData } from '../../engine/save-types'
import { distribution, nonfinitePaths, balanceIssues } from './balance-metrics'

const root = process.cwd()
const argv = process.argv.slice(2)
const arg = (key: string, fallback: string) => argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const flag = (key: string) => argv.includes(`--${key}`)
const today = new Date().toISOString().slice(0, 10)
const label = arg('label', `run-${today}`)
/**
 * Managed-club policy: `competent` (default, as documented in the summary),
 * `passive` (competent but never presses Register: exercises automatic entry),
 * `spendthrift` (bad policy: no sponsors, signs the best free agents up to
 * seven regardless of wages; exercises reachable bankruptcy).
 */
const POLICIES = ['competent', 'passive', 'spendthrift'] as const
type PolicyName = typeof POLICIES[number]
const policyName = arg('policy', 'competent') as PolicyName
if (!POLICIES.includes(policyName)) throw Error(`Unknown --policy=${policyName}`)
const outDir = path.join(root, 'tmp', 'long-career', label)
const TIERS = ['top', 'mid', 'low'] as const
type Tier = typeof TIERS[number]

// ---------------------------------------------------------------- invariants
/** Tunable bounds. Values are deliberately loose: they flag impossible state, not balance taste. */
export const BOUNDS = {
    maxAbsBudget: 5_000_000_000,
    /** AI club cash below this is an unrecoverable spiral rather than a bad season. */
    aiSpiralBudget: -20_000_000,
    /** Consecutive weeks an AI club may sit below five senior players. */
    aiShortRosterWeeks: 6,
    /** New inbox events created in one week (all teams' items that reach the player's log). */
    maxInboxPerWeek: 60,
    /** Weeks past a tournament's endWeek before an unfinished bracket is a stall. */
    tournamentStallWeeks: 3,
    /** Active-player pool must stay within these ratios of its opening size. */
    supplyMinRatio: 0.6,
    supplyMaxRatio: 2.5,
}

export interface Failure { kind: string; week: number; detail: string }

type Ledger = GameSave['financeLedger'][number]
const signed = (e: Ledger) => e.type === 'INCOME' ? e.amount : -e.amount

/** Structural invariants over a committed save. Pure; exported for regression tests. */
export function structuralFailures(save: GameSave): Failure[] {
    const week = save.currentWeek
    const out: Failure[] = []
    const push = (kind: string, detail: string) => out.push({ kind, week, detail })
    for (const issue of balanceIssues(save)) push(`state:${issue.split(':')[0]}`, issue)
    for (const p of nonfinitePaths(save).slice(0, 20)) push('nonfinite', p)
    // Roster/contract ownership of retired players or unknown ids.
    const players = new Map(save.players.map(p => [p.id, p]))
    for (const c of save.contracts) {
        const p = players.get(c.playerId)
        if (!p) push('contract-unknown-player', c.playerId)
        else if (p.isRetired && c.endWeek > week) push('retired-under-contract', `${c.playerId}@${c.teamId}`)
    }
    for (const t of save.teams) {
        if (!Number.isFinite(t.budget) || Math.abs(t.budget) > BOUNDS.maxAbsBudget) push('impossible-budget', `${t.id}:${t.budget}`)
        if (t.id !== save.playerTeamId && t.budget < BOUNDS.aiSpiralBudget) push('ai-finance-spiral', `${t.id}:${Math.round(t.budget)}`)
        if (new Set(t.rosterIds).size !== t.rosterIds.length) push('duplicate-roster-entry', t.id)
    }
    // Calendar: nothing from a past week may still be waiting to be played,
    // and tournament instances must carry the season their start week is in.
    const stale = save.scheduledMatches.filter(m => m.week < week)
    if (stale.length) push('stale-scheduled-match', `${stale.length} e.g. ${stale[0].id}@w${stale[0].week}`)
    for (const t of save.tournaments) {
        const season = Math.floor((t.startWeek - 1) / 52) + 1
        if (t.seasonNumber !== undefined && t.seasonNumber !== season) push('tournament-season-mismatch', `${t.id} season=${t.seasonNumber} start=${t.startWeek}`)
    }
    out.push(...tournamentFailures(save))
    return out
}

export function tournamentFailures(save: GameSave): Failure[] {
    const week = save.currentWeek
    const out: Failure[] = []
    const push = (kind: string, detail: string) => out.push({ kind, week, detail })
    const prizeKeys = new Map<string, number>()
    for (const e of save.financeLedger) {
        if (e.category !== 'PRIZE' || !e.id.startsWith('prize_')) continue
        // prize_<tournamentId>_<teamId>_p<position>; strip the position so a
        // team paid at two placements of one event is caught.
        const key = e.id.replace(/_p\d+$/, '')
        prizeKeys.set(key, (prizeKeys.get(key) ?? 0) + 1)
    }
    for (const [key, n] of prizeKeys) if (n > 1) push('duplicate-prize', `${key}x${n}`)
    const trophyCount = new Map<string, number>()
    for (const t of save.teams) for (const tr of t.trophies || []) trophyCount.set(tr.tournamentId, (trophyCount.get(tr.tournamentId) ?? 0) + 1)
    for (const [id, n] of trophyCount) if (n > 1) push('duplicate-trophy', `${id}x${n}`)
    const ids = new Set<string>()
    for (const t of save.tournaments as TournamentSaveData[]) {
        if (ids.has(t.id)) push('duplicate-tournament-instance', t.id)
        ids.add(t.id)
        if (new Set(t.teamIds).size !== t.teamIds.length) push('tournament-team-twice', t.id)
        const standings = (t.standings || []).map(s => s.teamId)
        if (new Set(standings).size !== standings.length) push('standings-team-twice', t.id)
        for (const g of t.groups || []) for (const id of g.teamIds) if (!t.teamIds.includes(id)) push('group-team-not-entered', `${t.id}:${id}`)
        const byStage = new Map<string, string[]>()
        for (const m of t.playoffBracket || []) {
            if (m.homeTeamId && m.homeTeamId === m.awayTeamId) push('bracket-self-match', `${t.id}:${m.id}`)
            const list = byStage.get(m.stage) ?? []
            for (const id of [m.homeTeamId, m.awayTeamId]) if (id) list.push(id)
            byStage.set(m.stage, list)
            if (m.isCompleted && m.winnerId && m.winnerId !== m.homeTeamId && m.winnerId !== m.awayTeamId) push('bracket-winner-not-participant', `${t.id}:${m.id}`)
        }
        // Round-robin and Swiss stages legitimately list a team many times;
        // elimination stages (incl. byes) may not.
        const roundRobin = (stage: string) => t.format === 'league' || t.format === 'swiss' || /league|swiss|group|round robin/i.test(stage)
        for (const [stage, list] of byStage) if (!roundRobin(stage) && new Set(list).size !== list.length) push('bracket-team-twice-in-stage', `${t.id}:${stage}`)
        if (t.isCompleted && (!t.winnerId || (t.teamIds.length > 0 && !t.teamIds.includes(t.winnerId)))) push('completed-without-valid-winner', `${t.id}:${t.winnerId}`)
        if (!t.isCompleted && t.teamIds.length >= 2 && t.endWeek + BOUNDS.tournamentStallWeeks < week) push('tournament-not-terminated', `${t.id} end=${t.endWeek}`)
    }
    return out
}

/** Every managed-club cash movement during a step must be one new ledger row (and only one). */
export function reconcileCash(before: { budget: number; ledgerIds: Set<string> }, after: GameSave, teamId: string, phase: string): Failure[] {
    const team = after.teams.find(t => t.id === teamId)
    if (!team) return []
    const fresh = after.financeLedger.filter(e => !before.ledgerIds.has(e.id))
    const seen = new Set<string>(), out: Failure[] = []
    for (const e of fresh) { if (seen.has(e.id)) out.push({ kind: 'duplicate-ledger-id', week: after.currentWeek, detail: `${phase}:${e.id}` }); seen.add(e.id) }
    const ledgerDelta = fresh.filter(e => e.teamId === teamId).reduce((s, e) => s + signed(e), 0)
    const cashDelta = team.budget - before.budget
    if (Math.abs(cashDelta - ledgerDelta) > 1) out.push({ kind: 'cash-ledger-mismatch', week: after.currentWeek, detail: `${phase}: cash ${Math.round(cashDelta)} vs ledger ${Math.round(ledgerDelta)}` })
    return out
}

// ---------------------------------------------------------------- worker
function mulberry32(seed: number) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

const ageBucket = (age: number) => age <= 19 ? '<=19' : age <= 22 ? '20-22' : age <= 25 ? '23-25' : age <= 28 ? '26-28' : age <= 31 ? '29-31' : '32+'
const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16)

async function runCareer(seed: number, tier: Tier, seasons: number) {
    // Seed cosmetic randomness first so the whole career (including snapshot
    // instantiation) is reproducible from (seed, tier, source).
    let random = mulberry32(seed)
    Math.random = () => random()
    const { useGameStore } = await import('../../store/game-store')
    const { snapshotLoader } = await import('../../data')
    const { buildSaveSnapshot } = await import('../../store/utils/build-save-snapshot')
    const { canonicalWeekState } = await import('../../engine/worker/week-replay')
    const { academyHeldPlayerIds, recruitmentSalary } = await import('../../engine/recruitment')
    const { asyncStorage, debouncedStorage } = await import('../../engine/storage-adapter')
    type Store = ReturnType<typeof useGameStore.getState>
    const get = (): Store => useGameStore.getState()
    const snap = (): GameSave => buildSaveSnapshot(get() as never) as GameSave

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(root, 'public/data/snapshot')
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    const band = tier === 'top' ? [0, 10] : tier === 'mid' ? [50, 80] : [130, Math.min(170, ranked.length)]
    const club = ranked[band[0] + (seed * 7) % (band[1] - band[0])]
    await get().initializeNewGame(`campaign-${seed}`, club.id)
    if (get().error || !get().playerTeamId) throw Error(`init failed: ${get().error}`)
    useGameStore.setState({ lastRngSeed: seed })
    let teamId = get().playerTeamId!
    const jobChanges: Array<{ week: number; from: string; to: string }> = []
    const saveId = get().saveId!

    fs.mkdirSync(path.join(outDir, 'failures'), { recursive: true })
    const tag = `seed-${seed}-${tier}`
    const failures: Failure[] = []
    const firstOfKind = new Set<string>()
    let lastGood: GameSave = structuredClone(snap())
    const record = (list: Failure[], failingState?: () => GameSave) => {
        for (const f of list) {
            if (failures.filter(x => x.kind === f.kind).length < 25) failures.push(f)
            if (!firstOfKind.has(f.kind)) {
                firstOfKind.add(f.kind)
                const base = path.join(outDir, 'failures', `${tag}-${f.kind.replace(/[^a-z0-9-]/gi, '_')}-w${f.week}`)
                fs.writeFileSync(`${base}-last-good.json.gz`, zlib.gzipSync(JSON.stringify(lastGood)))
                if (failingState) fs.writeFileSync(`${base}-failing.json.gz`, zlib.gzipSync(JSON.stringify(failingState())))
                fs.writeFileSync(`${base}-report.json`, JSON.stringify({ seed, tier, club: club.id, failure: f, sameKindSoFar: failures.filter(x => x.kind === f.kind).length }, null, 2))
            }
        }
    }

    const openingActive = get().players.filter(p => !p.isRetired).length
    const initial = structuralFailures(snap())
    const baselineKinds = new Set(initial.map(f => f.kind))
    if (initial.length) record(initial.map(f => ({ ...f, kind: `initial:${f.kind}` })))

    // ------------------------------------------------ deterministic policy
    const playerTeam = () => get().teams.find(t => t.id === teamId)!
    const policyStats = { forfeitAdvances: 0, registrations: 0, signings: 0, upgrades: 0, renewals: 0, renewalFailures: 0, sponsorsSigned: 0, choices: 0, jobOffersDeclined: 0, jobChanges: 0, softlocks: 0 }
    // Job market: stay loyal unless the board has put the manager on notice,
    // then take the best-ranked offer (exercises real job changes).
    const jobMarket = () => {
        const s = get()
        const board = s.boardState
        const offers = s.eventsLog.filter(e => e.type === 'JOB_OFFER' && !e.selectedChoiceId && !e.data?.isWithdrawn && e.week >= s.currentWeek - 1)
        if (!offers.length) return
        if (board && (board.onNotice || board.confidence < 35)) {
            const best = [...offers].sort((a, b) => Number(a.data.offeringTeamRank ?? 999) - Number(b.data.offeringTeamRank ?? 999) || a.id.localeCompare(b.id))[0]
            const from = teamId
            if (get().acceptJobOffer(best.id).success && get().playerTeamId && get().playerTeamId !== from) {
                teamId = get().playerTeamId!
                policyStats.jobChanges++
                jobChanges.push({ week: get().currentWeek, from, to: teamId })
                return
            }
        }
        for (const e of offers) { get().declineJobOffer(e.id); policyStats.jobOffersDeclined++ }
    }
    const policy = () => {
        const s = get()
        // Inbox decisions: take the money-maximising branch of every open
        // choice event (greedy: exposes repeatable money sources).
        // State-derived so a reload replays them.
        for (const e of s.eventsLog) {
            if (e.selectedChoiceId || e.data?.isWithdrawn || e.type === 'JOB_OFFER') continue
            const choices = (e as unknown as { choices?: Array<{ id: string; effects?: { money?: number; morale?: number } }> }).choices
            if (!choices?.length || e.week < s.currentWeek - 1) continue
            // Competent: never trade squad morale for money; among the rest, take the most money.
            const best = [...choices].sort((a, b) => Number((a.effects?.morale ?? 0) < 0) - Number((b.effects?.morale ?? 0) < 0) || (b.effects?.money ?? 0) - (a.effects?.money ?? 0))[0]
            get().resolveEventChoice(e.id, best.id)
            if (get().eventsLog.find(x => x.id === e.id)?.selectedChoiceId) policyStats.choices++
        }
        // Renew expiring starters while affordable (renewContract applies its own gates).
        for (const id of [...playerTeam().rosterIds]) {
            const c = get().contracts.find(x => x.playerId === id && x.teamId === teamId)
            if (c && c.endWeek - get().currentWeek <= 6 && c.endWeek > get().currentWeek) {
                const end = c.endWeek
                get().renewContract(id)
                if ((get().contracts.find(x => x.playerId === id && x.teamId === teamId)?.endWeek ?? 0) > end) policyStats.renewals++
                else policyStats.renewalFailures++
            }
        }
        // Fill the senior five from free agency: best player we can pay for two years, else cheapest.
        if (playerTeam().rosterIds.length < 5) {
            const st = get(), held = academyHeldPlayerIds(st as never)
            const owned = new Set(st.teams.flatMap(t => t.rosterIds))
            const free = st.players.filter(p => !p.isRetired && !held.has(p.id) && !owned.has(p.id) && !st.contracts.some(c => c.playerId === p.id && c.endWeek > st.currentWeek))
                .map(p => ({ p, wage: recruitmentSalary(p as PlayerSaveData, st.currentWeek, playerTeam()) }))
            const budget = Math.max(0, playerTeam().budget)
            const affordable = free.filter(x => x.wage * 104 <= budget).sort((a, b) => b.p.skill - a.p.skill || a.p.id.localeCompare(b.p.id))
            const cheapest = free.filter(x => !affordable.includes(x)).sort((a, b) => a.wage - b.wage || a.p.id.localeCompare(b.p.id))
            for (const { p, wage } of [...affordable, ...cheapest]) {
                if (playerTeam().rosterIds.length >= 5) break
                const w = get().currentWeek
                if (get().transferPlayer(p.id, null, teamId, 0, { salaryPerWeek: wage, startWeek: w, endWeek: w + 104, buyout: 0 }).success) policyStats.signings++
            }
        }
        // Monthly squad upgrade: replace the weakest starter with a clearly
        // better free agent we can pay for two years from a quarter of cash.
        if (playerTeam().rosterIds.length === 5 && get().currentWeek % 4 === 0) {
            const st = get(), held = academyHeldPlayerIds(st as never)
            const owned = new Set(st.teams.flatMap(t => t.rosterIds))
            const starters = playerTeam().rosterIds.map(id => st.players.find(p => p.id === id)!).filter(Boolean).sort((a, b) => a.skill - b.skill || a.id.localeCompare(b.id))
            const worst = starters[0]
            const budget = Math.max(0, playerTeam().budget)
            const pick = worst && st.players.filter(p => !p.isRetired && !held.has(p.id) && !owned.has(p.id) && p.skill >= worst.skill + 5 && !st.contracts.some(c => c.playerId === p.id && c.endWeek > st.currentWeek))
                .map(p => ({ p, wage: recruitmentSalary(p as PlayerSaveData, st.currentWeek, playerTeam()) }))
                .filter(x => x.wage * 104 <= budget * 0.25)
                .sort((a, b) => b.p.skill - a.p.skill || a.p.id.localeCompare(b.p.id))[0]
            const w = st.currentWeek
            if (pick && get().transferPlayer(pick.p.id, null, teamId, 0, { salaryPerWeek: pick.wage, startWeek: w, endWeek: w + 104, buyout: 0 }).success) {
                if (get().transferPlayer(worst.id, teamId, 'FA', 0).success) policyStats.upgrades++
            }
        }
        // Bad policy: stack the squad to seven with the best free agents at
        // whatever they ask (no affordability check, no sponsors below).
        if (policyName === 'spendthrift' && playerTeam().rosterIds.length < 7 && get().currentWeek % 4 === 0) {
            const st = get(), held = academyHeldPlayerIds(st as never)
            const owned = new Set(st.teams.flatMap(t => t.rosterIds))
            const pick = st.players.filter(p => !p.isRetired && !held.has(p.id) && !owned.has(p.id) && !st.contracts.some(c => c.playerId === p.id && c.endWeek > st.currentWeek))
                .sort((a, b) => b.skill - a.skill || a.id.localeCompare(b.id))[0]
            const w = st.currentWeek
            if (pick && get().transferPlayer(pick.id, null, teamId, 0, { salaryPerWeek: recruitmentSalary(pick as PlayerSaveData, w, playerTeam()), startWeek: w, endWeek: w + 104, buyout: 0 }).success) policyStats.signings++
        }
        // Enter every upcoming event the club is eligible for (the Tournaments
        // screen's Register button). The passive policy never presses it and
        // relies on automatic entry (invites, points, open qualifiers).
        if (policyName !== 'passive') for (const t of [...get().tournaments].filter(t => t.startWeek > get().currentWeek && t.startWeek <= get().currentWeek + 4 && !t.teamIds.includes(teamId)).sort((a, b) => a.startWeek - b.startWeek || a.id.localeCompare(b.id))) {
            if (get().registerForTournament(t.id).success) policyStats.registrations++
        }
        // Sponsors: keep slots filled with the best currently offered deal (signSponsor enforces gates).
        if (policyName !== 'spendthrift' && (playerTeam().sponsors?.length ?? 0) < 3) {
            if (!get().sponsorOffers.length) get().refreshSponsorOffers()
            // Competent: avoid brands that drain morale (betting: -0.3/week each); best payout among the rest.
            const drains = (o: { brandEffect?: { moralePerWeek?: number } }) => Number((o.brandEffect?.moralePerWeek ?? 0) < 0)
            for (const o of [...get().sponsorOffers].sort((a, b) => drains(a) - drains(b) || b.weeklyPayout - a.weeklyPayout || a.id.localeCompare(b.id))) {
                if ((playerTeam().sponsors?.length ?? 0) >= 3) break
                if (get().signSponsor(teamId, { ...o, signedWeek: get().currentWeek }).success) policyStats.sponsorsSigned++
            }
        }
    }
    const unplayedOwn = () => {
        const s = get()
        const done = new Set(s.completedMatches.map(m => m.id))
        return s.scheduledMatches.filter(m => m.week === s.currentWeek && (m.homeTeamId === teamId || m.awayTeamId === teamId) && !done.has(m.id))
    }

    // One full in-game week through the real coordinator. Returns false on softlock.
    const playWeek = async (check: boolean): Promise<boolean> => {
        const startWeek = get().currentWeek
        const step = async (phase: string, fn: () => Promise<void> | void) => {
            const before = { budget: playerTeam().budget, ledgerIds: new Set(get().financeLedger.map(e => e.id)) }
            await fn()
            if (check) record(reconcileCash(before, snap(), teamId, phase), snap)
        }
        jobMarket()
        await step('policy', policy)
        const refused = new Set<string>()
        for (let guard = 0; guard < 20 && get().currentWeek === startWeek && !get().gameOverReason; guard++) {
            // Earliest fixture first, as the match-day UI presents them; fixtures
            // the coordinator refused this week are left to the tick's forfeit.
            const pending = unplayedOwn().filter(m => !refused.has(m.id)).sort((a, b) => (a.day ?? 6) - (b.day ?? 6) || a.id.localeCompare(b.id))
            if (pending.length) {
                const m = pending[0]
                if (get().timeMode === 'HYBRID_DAILY' && get().currentDay < (m.day ?? 6)) {
                    const day = get().currentDay
                    await step('advance-day', () => get().advanceToWeekEnd())
                    if (get().currentDay === day && get().currentWeek === startWeek) refused.add(m.id)
                    continue
                }
                const doneBefore = get().completedMatches.length
                await step('own-match', async () => { await get().simulateInstantMatch(m.id) })
                if (get().completedMatches.length === doneBefore) {
                    // Refused (e.g. understrength roster). Give the policy one chance to fix it.
                    await step('policy-retry', policy)
                    const again = get().completedMatches.length
                    await step('own-match-retry', async () => { await get().simulateInstantMatch(m.id) })
                    if (get().completedMatches.length === again) { refused.add(m.id); policyStats.forfeitAdvances++ }
                }
                continue
            }
            await step('advance', () => get().advanceToWeekEnd())
            if (get().error) throw Error(`advance error: ${get().error}`)
        }
        return get().currentWeek === startWeek + 1 || !!get().gameOverReason
    }

    // ------------------------------------------------ season metrics
    const seasonsOut: unknown[] = []
    const inboxPerWeek: number[] = []
    const inboxByType: Record<string, number> = {}
    const seenTypes = new Set(get().eventsLog.map(e => e.id))
    const tickMs: number[] = []
    let shortWeeks = new Map<string, number>()
    let lastIds = new Set(get().eventsLog.map(e => e.id))
    const weeks = seasons * 52
    let roundTrip: unknown = null
    const roundTripAt = Number(arg('roundtrip-at', String(60 + (seed * 13) % 120)))
    let ticks = 0
    const seasonOpen = openState(snap(), playerTeam().budget)

    const income = new Map<string, number>()
    while (ticks < weeks && !get().gameOverReason) {
        // Mid-campaign save → load round trip through SaveManager + store.loadGame.
        if (ticks === roundTripAt) {
            await get().saveGame(); await debouncedStorage.flush()
            const keys = (await asyncStorage.getAllKeys()).filter(k => k.includes(saveId))
            const stash = new Map<string, string>()
            for (const k of keys) stash.set(k, (await asyncStorage.getItem(k))!)
            const stats = { ...policyStats }, teamBefore = teamId, jobsBefore = jobChanges.length
            const run = async () => {
                random = mulberry32(seed * 7919 + ticks)
                const hashes: string[] = []
                for (let i = 0; i < 4 && !get().gameOverReason; i++) { await playWeek(false); hashes.push(sha(canonicalWeekState(snap()))) }
                return { hashes, state: canonicalWeekState(snap()) }
            }
            const first = await run()
            for (const [k, v] of stash) await asyncStorage.setItem(k, v)
            await get().loadGame(saveId)
            Object.assign(policyStats, stats); teamId = teamBefore; jobChanges.length = jobsBefore
            const second = await run()
            let firstDiff: string | null = null
            if (first.state !== second.state) {
                const a = JSON.parse(first.state), b = JSON.parse(second.state)
                firstDiff = Object.keys({ ...a, ...b }).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).slice(0, 12).join(',')
                record([{ kind: 'save-load-divergence', week: get().currentWeek, detail: `keys: ${firstDiff}` }], snap)
            }
            roundTrip = { atTick: ticks, weeks: first.hashes.length, identical: first.state === second.state, first: first.hashes, second: second.hashes, differingKeys: firstDiff }
            ticks += first.hashes.length
            lastIds = new Set(get().eventsLog.map(e => e.id))
            continue
        }
        const t0 = Date.now()
        const weekBefore = get().currentWeek
        const ledgerBefore = new Set(get().financeLedger.map(e => e.id))
        const ok = await playWeek(true)
        tickMs.push(Date.now() - t0)
        ticks++
        if (!ok) { policyStats.softlocks++; record([{ kind: 'softlock', week: get().currentWeek, detail: `own match unplayable, roster ${playerTeam().rosterIds.length}` }], snap); break }
        const s = snap()
        if (!get().gameOverReason && s.currentWeek !== weekBefore + 1) record([{ kind: 'calendar-skip', week: s.currentWeek, detail: `${weekBefore} -> ${s.currentWeek}` }], snap)
        for (const e of s.financeLedger) if (!ledgerBefore.has(e.id) && e.teamId === teamId) income.set(`${e.type}:${e.category}`, (income.get(`${e.type}:${e.category}`) ?? 0) + e.amount)
        // Inbox volume: new events that landed this week.
        const ids = new Set(s.eventsLog.map(e => e.id))
        let added = 0
        for (const id of ids) if (!lastIds.has(id)) added++
        lastIds = ids
        inboxPerWeek.push(added)
        for (const e of s.eventsLog) if (!seenTypes.has(e.id)) { seenTypes.add(e.id); inboxByType[e.type] = (inboxByType[e.type] ?? 0) + 1 }
        if (added > BOUNDS.maxInboxPerWeek) record([{ kind: 'inbox-flood', week: s.currentWeek, detail: `${added} new events` }], () => s)
        const structural = structuralFailures(s).filter(f => !(baselineKinds.has(f.kind) && ticks < 2))
        record(structural, () => s)
        // AI roster viability (consecutive short weeks).
        const nextShort = new Map<string, number>()
        for (const t of s.teams) if (t.id !== teamId && t.rosterIds.length < 5) nextShort.set(t.id, (shortWeeks.get(t.id) ?? 0) + 1)
        shortWeeks = nextShort
        const longShort = [...nextShort].filter(([, n]) => n === BOUNDS.aiShortRosterWeeks + 1)
        if (longShort.length) record([{ kind: 'ai-roster-not-viable', week: s.currentWeek, detail: longShort.map(([id]) => id).join(',') }], () => s)
        const active = s.players.filter(p => !p.isRetired).length
        if (active < openingActive * BOUNDS.supplyMinRatio || active > openingActive * BOUNDS.supplyMaxRatio) record([{ kind: 'player-supply', week: s.currentWeek, detail: `${active} active vs ${openingActive} at start` }], () => s)
        if (structural.length === 0) lastGood = structuredClone(s)
        if (ticks % 52 === 0 || get().gameOverReason) seasonsOut.push(seasonMetrics(s, seasonOpen, income, teamId, (w: number) => jobChanges.filter(j => j.week <= w).at(-1)?.to ?? club.id))
        if (ticks % 52 === 0) { Object.assign(seasonOpen, openState(s, playerTeam().budget)); income.clear() }
        if (ticks % 26 === 0) process.stdout.write(`${tag} tick ${ticks} week ${s.currentWeek} cash ${Math.round(playerTeam().budget)} failures ${failures.length} avgMs ${Math.round(tickMs.slice(-26).reduce((a, b) => a + b, 0) / 26)}\n`)
    }
    const final = snap()
    const result = {
        seed, tier, policyName, openingActive, club: club.id, clubName: club.name, seasonsRequested: seasons, ticks, finalWeek: final.currentWeek,
        terminal: final.gameOverReason ?? null, failures, failureKinds: [...new Set(failures.map(f => f.kind))],
        policy: policyStats, jobChanges, roundTrip, inboxPerWeek: distribution(inboxPerWeek), inboxMax: Math.max(0, ...inboxPerWeek), inboxByType,
        tickMs: distribution(tickMs), seasons: seasonsOut, finalHash: sha(canonicalWeekState(final)),
    }
    fs.writeFileSync(path.join(outDir, `${tag}.json`), JSON.stringify(result, null, 2))
    if (failures.length) fs.writeFileSync(path.join(outDir, 'failures', `${tag}-final.json.gz`), zlib.gzipSync(JSON.stringify(final)))
    process.stdout.write(`${tag} done ticks ${ticks} terminal ${result.terminal} failures ${failures.length} kinds ${result.failureKinds.join(',')}\n`)
}

/** Season-open reference for flow metrics (GC removes retired players at season end, so count by id). */
function openState(s: GameSave, cash: number) {
    return { cash, active: new Set(s.players.filter(p => !p.isRetired).map(p => p.id)), all: new Set(s.players.map(p => p.id)), hof: new Set((s.hallOfFame || []).map(h => h.id)) }
}

const avgOf = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length * 10) / 10 : NaN

/** Starter condition: managed club vs the AI top ten (form/morale/fatigue/skill averages). */
function conditionMetrics(s: GameSave, teamId: string) {
    const byId = new Map(s.players.map(p => [p.id, p]))
    const of = (ids: string[]) => ids.map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p)
    const pack = (ps: PlayerSaveData[]) => ({ form: avgOf(ps.map(p => p.form)), morale: avgOf(ps.map(p => p.morale)), fatigue: avgOf(ps.map(p => p.fatigue)), skill: avgOf(ps.map(p => p.skill)) })
    const aiTop = s.teams.filter(t => t.id !== teamId).sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999)).slice(0, 10)
    return { managed: pack(of(s.teams.find(t => t.id === teamId)?.rosterIds ?? [])), aiTop10: pack(of(aiTop.flatMap(t => t.rosterIds))) }
}

/**
 * `managedAt(week)`: the club the manager ran that week. Own matches are
 * counted for that club, so a job change at a season boundary does not
 * report the season as empty (seeds 12/19 in final-4efd1ff9).
 */
function seasonMetrics(s: GameSave, open: ReturnType<typeof openState>, income: Map<string, number>, teamId: string, managedAt: (week: number) => string = () => teamId) {
    const team = s.teams.find(t => t.id === teamId)!
    const alive = s.players.filter(p => !p.isRetired)
    const rostered = new Set(s.teams.flatMap(t => t.rosterIds))
    const ovrByAge: Record<string, number[]> = {}
    for (const p of alive.filter(p => rostered.has(p.id))) (ovrByAge[ageBucket(p.age)] ??= []).push(p.skill)
    const seasonStart = s.currentWeek - 52
    const done = s.tournaments.filter(t => t.isCompleted && t.winnerId && t.endWeek > seasonStart)
    const winners: Record<string, string[]> = {}
    for (const t of done) (winners[t.tier] ??= []).push(t.winnerId!)
    const ai = s.teams.filter(t => t.id !== teamId)
    const own = s.completedMatches.filter(m => m.week > seasonStart && (m.homeTeamId === managedAt(m.week) || m.awayTeamId === managedAt(m.week)))
    return {
        week: s.currentWeek,
        managed: { cash: Math.round(team.budget), cashDelta: Math.round(team.budget - open.cash), ranking: team.worldRanking, roster: team.rosterIds.length,
            sponsors: team.sponsors?.length ?? 0, wins: own.filter(m => m.result?.winnerId === managedAt(m.week)).length, matches: own.length,
            trophies: (team.trophies || []).filter(tr => tr.week > seasonStart).map(tr => tr.tier), board: s.boardState?.confidence,
            ledger: Object.fromEntries([...income].map(([k, v]) => [k, Math.round(v)])) },
        aiBudgets: distribution(ai.map(t => t.budget)),
        aiNegative: ai.filter(t => t.budget < 0).length,
        aiCrisis: ai.filter(t => t.financialState === 'CRISIS').length,
        aiShortRosters: ai.filter(t => t.rosterIds.length < 5).length,
        wages: distribution(s.contracts.filter(c => c.endWeek > s.currentWeek).map(c => c.salaryPerWeek)),
        transferFees: distribution(s.transferHistory.filter(t => t.week > seasonStart && t.fee > 0).map(t => t.fee)),
        transfers: s.transferHistory.filter(t => t.week > seasonStart).length,
        ovrByAge: Object.fromEntries(Object.entries(ovrByAge).sort().map(([k, v]) => [k, distribution(v)])),
        playersActive: alive.length, playersTotal: s.players.length, freeAgents: alive.filter(p => !rostered.has(p.id)).length,
        retiredThisSeason: (() => { const ids = new Set(alive.map(p => p.id)); return [...open.active].filter(id => !ids.has(id)).length })(), newPlayers: s.players.filter(p => !open.all.has(p.id)).length,
        hofInductions: (s.hallOfFame || []).filter(h => !open.hof.has(h.id)).length,
        condition: conditionMetrics(s, teamId),
        managedTopTierShare: Object.fromEntries(Object.entries(winners).map(([tier, ws]) => [tier, ws.length ? ws.filter(w => w === teamId).length / ws.length : 0])),
        titles: Object.fromEntries(Object.entries(winners).map(([tier, ws]) => [tier, { events: ws.length, distinctWinners: new Set(ws).size, topWinnerShare: ws.length ? Math.max(...[...new Set(ws)].map(w => ws.filter(x => x === w).length)) / ws.length : 0 }])),
        winners: done.map(t => ({ id: t.id, tier: t.tier, winner: t.winnerId })),
        tournamentsTracked: s.tournaments.length, matchesThisSeason: s.completedMatches.filter(m => m.week > seasonStart).length,
        eventsLog: s.eventsLog.length, financeLedger: s.financeLedger.length,
    }
}

// ---------------------------------------------------------------- aggregate
/** Balance-tuning targets (docs/launch-readiness/evidence/balance-tuning-2026-10-04.md). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function targetMetrics(results: any[]) {
    const maxSeasons = Math.max(0, ...results.map(r => r.seasons.length))
    const bySeason = <T>(fn: (s: any) => T) => Array.from({ length: maxSeasons }, (_, i) => results.map(r => r.seasons[i]).filter(Boolean).map(fn)) // eslint-disable-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const later = results.flatMap(r => r.seasons.slice(1)) as any[]
    return {
        worldNumberOneBySeason: bySeason(s => s.managed.ranking === 1).map((xs, i) => ({ season: i + 1, careers: xs.length, worldNo1: xs.filter(Boolean).length })),
        managedSTierTitleShareSeason2Plus: distribution(later.map(s => s.managedTopTierShare?.S_TIER ?? 0)),
        managedATierTitleShareSeason2Plus: distribution(later.map(s => s.managedTopTierShare?.A_TIER ?? 0)),
        managedWinRateSeason2Plus: distribution(later.filter(s => s.managed.matches).map(s => s.managed.wins / s.managed.matches)),
        hofInductionsBySeason: bySeason(s => s.hofInductions ?? NaN).map((xs, i) => ({ season: i + 1, ...distribution(xs) })),
        aiShortRostersAtSeasonEnd: distribution(results.flatMap(r => r.seasons.map((s: { aiShortRosters: number }) => s.aiShortRosters))),
        poolRatioFinal: distribution(results.map(r => (r.seasons.at(-1)?.playersActive ?? NaN) / (r.openingActive ?? NaN))),
        newPlayersPerSeason: distribution(results.flatMap(r => r.seasons.map((s: { newPlayers: number }) => s.newPlayers))),
        retiredPerSeason: distribution(results.flatMap(r => r.seasons.map((s: { retiredThisSeason: number }) => s.retiredThisSeason))),
        terminal: results.reduce((m: Record<string, number>, r) => { const k = r.terminal ?? 'none'; m[k] = (m[k] ?? 0) + 1; return m }, {}),
        managedFormGap: distribution(later.map(s => (s.condition?.managed.form ?? NaN) - (s.condition?.aiTop10.form ?? NaN))),
        managedMoraleGap: distribution(later.map(s => (s.condition?.managed.morale ?? NaN) - (s.condition?.aiTop10.morale ?? NaN))),
        managedSkillGap: distribution(later.map(s => (s.condition?.managed.skill ?? NaN) - (s.condition?.aiTop10.skill ?? NaN))),
        seasonCashDelta: distribution(results.flatMap(r => r.seasons.map((s: { managed: { cashDelta: number } }) => s.managed.cashDelta))),
    }
}

function aggregate() {
    const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(f => /^seed-\d+-\w+\.json$/.test(f)) : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = files.map(f => JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8')) as any).sort((a, b) => a.seed - b.seed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seasonsAll = results.flatMap(r => r.seasons.map((s: any, i: number) => ({ ...s, tier: r.tier, seed: r.seed, index: i + 1 })))
    const byKind: Record<string, { seeds: number[]; count: number; first: unknown }> = {}
    for (const r of results) for (const f of r.failures) {
        const k = (byKind[f.kind] ??= { seeds: [], count: 0, first: f })
        k.count++; if (!k.seeds.includes(r.seed)) k.seeds.push(r.seed)
    }
    const perTier = Object.fromEntries(TIERS.map(tier => {
        const rs = results.filter(r => r.tier === tier)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ss = seasonsAll.filter((s: any) => s.tier === tier)
        return [tier, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            deadSeasons: ss.filter((s: any) => s.managed.matches < 5).length, seasons: ss.length,
            careers: rs.length, completedAllSeasons: rs.filter(r => r.ticks >= r.seasonsRequested * 52).length,
            terminal: rs.reduce((m: Record<string, number>, r) => { if (r.terminal) m[r.terminal] = (m[r.terminal] ?? 0) + 1; return m }, {}),
            finalCash: distribution(rs.map(r => r.seasons.at(-1)?.managed.cash ?? NaN)),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seasonCashDelta: distribution(ss.map((s: any) => s.managed.cashDelta)),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            winRate: distribution(ss.filter((s: any) => s.managed.matches).map((s: any) => s.managed.wins / s.managed.matches)),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            trophiesPerSeason: distribution(ss.map((s: any) => s.managed.trophies.length)),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            finalRanking: distribution(rs.map(r => r.seasons.at(-1)?.managed.ranking ?? NaN)),
        }]
    }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (fn: (s: any) => number) => distribution(seasonsAll.map(fn))
    const ovrBuckets = ['<=19', '20-22', '23-25', '26-28', '29-31', '32+']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastSeason = (r: any) => r.seasons.at(-1)
    const summary = {
        generated: new Date().toISOString(), label,
        driver: 'Real useGameStore coordinator (initializeNewGame, advanceToWeekEnd/advanceWeek with worker synchronous fallback, simulateInstantMatch, transferPlayer, renewContract, signSponsor, resolveEventChoice, declineJobOffer, saveGame/loadGame) over the full snapshot world.',
        policyName: [...new Set(results.map(r => r.policyName ?? 'competent'))].join(','),
        targets: targetMetrics(results),
        policy: 'Deterministic: register for every eligible event starting within 4 weeks; play own matches by instant sim; decline job offers unless on board notice (then take the best-ranked offer); monthly swap of the weakest starter for a clearly better free agent payable from a quarter of cash; greedy-money branch on choice events; renew expiring starters; fill to five from free agency (best affordable for 104 weeks, else cheapest); keep up to three sponsors (best offered).',
        bounds: BOUNDS,
        sampleSize: { careers: results.length, seeds: [...new Set(results.map(r => r.seed))].length, weekTicks: results.reduce((s, r) => s + r.ticks, 0), seasonSnapshots: seasonsAll.length,
            byTier: Object.fromEntries(TIERS.map(t => [t, results.filter(r => r.tier === t).length])),
            completedRequestedSeasons: results.filter(r => r.ticks >= r.seasonsRequested * 52).length, seasonsRequested: [...new Set(results.map(r => r.seasonsRequested))] },
        invariantFailures: byKind,
        roundTrips: results.map(r => ({ seed: r.seed, ...(r.roundTrip ?? {}) })).map(({ seed, atTick, identical, differingKeys }) => ({ seed, atTick, identical, differingKeys })),
        perTier,
        distributions: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            aiBudgetMedian: pick((s: any) => s.aiBudgets.median), aiBudgetMin: pick((s: any) => s.aiBudgets.min), aiBudgetMax: pick((s: any) => s.aiBudgets.max),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            aiNegativeCash: pick((s: any) => s.aiNegative), aiCrisis: pick((s: any) => s.aiCrisis), aiShortRosters: pick((s: any) => s.aiShortRosters),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            wageMedian: pick((s: any) => s.wages.median), wageP90: pick((s: any) => s.wages.p90), wageMax: pick((s: any) => s.wages.max),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            transferFeeMedian: pick((s: any) => s.transferFees.median ?? NaN), transferFeeMax: pick((s: any) => s.transferFees.max ?? NaN), transfersPerSeason: pick((s: any) => s.transfers),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ovrMedianByAge: Object.fromEntries(ovrBuckets.map(b => [b, pick((s: any) => s.ovrByAge[b]?.median ?? NaN)])),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ovrMedianByAgeFinalSeason: Object.fromEntries(ovrBuckets.map(b => [b, distribution(results.map(r => lastSeason(r)?.ovrByAge[b]?.median ?? NaN))])),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            playersActive: pick((s: any) => s.playersActive), freeAgents: pick((s: any) => s.freeAgents), retiredPerSeason: pick((s: any) => s.retiredThisSeason), newPlayersPerSeason: pick((s: any) => s.newPlayers),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            matchesPerSeason: pick((s: any) => s.matchesThisSeason), inboxPerWeekMax: distribution(results.map(r => r.inboxMax)), inboxPerWeekMedian: distribution(results.map(r => r.inboxPerWeek.median)),
            tickMsMedian: distribution(results.map(r => r.tickMs.median)),
        },
        titleSpread: Object.fromEntries(['S_TIER', 'A_TIER', 'B_TIER', 'C_TIER'].map(tier => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ws = seasonsAll.flatMap((s: any) => (s.winners as Array<{ tier: string; winner: string }>).filter(w => w.tier === tier).map(w => w.winner))
            const counts = new Map<string, number>(); for (const w of ws) counts.set(w, (counts.get(w) ?? 0) + 1)
            const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return [tier, { titles: ws.length, distinctWinners: counts.size, top5: top, perSeasonTopShare: pick((s: any) => s.titles[tier]?.topWinnerShare ?? NaN) }]
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        managedIncomeByCategory: seasonsAll.reduce((m: Record<string, number[]>, s: any) => { for (const [k, v] of Object.entries(s.managed.ledger)) (m[k] ??= []).push(v as number); return m }, {}),
        careers: results.map(r => ({ seed: r.seed, tier: r.tier, club: r.club, ticks: r.ticks, terminal: r.terminal, failureKinds: r.failureKinds, finalCash: lastSeason(r)?.managed.cash, policy: r.policy, roundTripIdentical: r.roundTrip?.identical ?? null })),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(summary as any).sponsorToWageRatio = distribution(seasonsAll.map((s: any) => (s.managed.ledger['INCOME:SPONSOR'] ?? 0) / Math.max(1, (s.managed.ledger['EXPENSE:WAGES_PLAYER'] ?? 0) + (s.managed.ledger['EXPENSE:WAGES_STAFF'] ?? 0))))
    summary.managedIncomeByCategory = Object.fromEntries(Object.entries(summary.managedIncomeByCategory).map(([k, v]) => [k, distribution(v) as unknown as number[]]))
    const evidence = path.resolve(root, arg('out', path.join('docs/launch-readiness/evidence', `long-career-${today}.json`)))
    fs.writeFileSync(evidence, JSON.stringify(summary, null, 2))
    process.stdout.write(`aggregate: ${results.length} careers, ${summary.sampleSize.weekTicks} ticks -> ${path.relative(root, evidence)}\n`)
}

// ---------------------------------------------------------------- orchestrator
async function orchestrate() {
    const seeds = Number(arg('seeds', '30')), seasons = Number(arg('seasons', '10')), parallel = Number(arg('parallel', '2')), first = Number(arg('first-seed', '1'))
    if (![seeds, seasons, parallel, first].every(n => Number.isInteger(n) && n > 0)) throw Error('Invalid --seeds/--seasons/--parallel/--first-seed')
    fs.mkdirSync(outDir, { recursive: true })
    const queue = Array.from({ length: seeds }, (_, i) => first + i).filter(seed => !fs.existsSync(path.join(outDir, `seed-${seed}-${TIERS[(seed - 1) % 3]}.json`)))
    const cli = path.join(root, 'node_modules/tsx/dist/cli.mjs')
    const runOne = (seed: number) => new Promise<void>(resolve => {
        const log = fs.createWriteStream(path.join(outDir, `seed-${seed}.log`))
        const child = spawn(process.execPath, ['--max-old-space-size=3072', cli, __filename, '--worker', `--seed=${seed}`, `--seasons=${seasons}`, `--label=${label}`, `--policy=${policyName}`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
        child.stdout.on('data', d => { log.write(d); if (/done|tick \d*0[48] /.test(String(d))) process.stdout.write(String(d)) })
        child.stderr.on('data', d => log.write(d))
        child.on('exit', code => { log.end(); if (code) process.stdout.write(`seed ${seed} exited ${code} (see ${path.relative(root, path.join(outDir, `seed-${seed}.log`))})\n`); resolve() })
    })
    const workers = Array.from({ length: Math.min(parallel, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()!) })
    await Promise.all(workers)
    aggregate()
}

async function main() {
    if (flag('worker')) {
        const seed = Number(arg('seed', '1'))
        const tier = (arg('tier', TIERS[(seed - 1) % 3])) as Tier
        if (!TIERS.includes(tier)) throw Error(`Unknown tier ${tier}`)
        fs.mkdirSync(outDir, { recursive: true })
        await runCareer(seed, tier, Number(arg('seasons', '10')))
        process.exit(0)
    }
    if (flag('aggregate')) return aggregate()
    await orchestrate()
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1) })
