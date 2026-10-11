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
    // generateSeed() (the new game's RNG state, module fallback RNGs) reads
    // Web Crypto, so two processes running the same seed started from
    // different worlds and before/after runs were not paired. Route it
    // through the seeded stream too (Phase 4.6).
    globalThis.crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
        const view = array as unknown as { length: number; BYTES_PER_ELEMENT: number; [i: number]: number }
        for (let i = 0; i < view.length; i++) view[i] = Math.floor(random() * 2 ** (8 * view.BYTES_PER_ELEMENT))
        return array
    }) as Crypto['getRandomValues']
    const { useGameStore } = await import('../../store/game-store')
    const { snapshotLoader } = await import('../../data')
    const { buildSaveSnapshot } = await import('../../store/utils/build-save-snapshot')
    const { canonicalWeekState } = await import('../../engine/worker/week-replay')
    const { academyHeldPlayerIds, recruitmentSalary, recruitmentBudget, affordableInvestment } = await import('../../engine/recruitment')
    const { asyncStorage, debouncedStorage } = await import('../../engine/storage-adapter')
    const { EconomyEngine } = await import('../../engine/economy-engine')
    const { calculateBaseSkill } = await import('../../engine/player-evaluation')
    const strengthOf: StrengthOf = (s, team) => {
        const ratings = team.rosterIds.map(id => s.players.find(p => p.id === id)).filter((p): p is PlayerSaveData => !!p && !p.isRetired)
            .map(p => calculateBaseSkill(p)).sort((a, b) => b - a).slice(0, 5)
        return ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0
    }
    const project: FinanceProjector = (s, team) => {
        const academy = (team.youthAcademyIds || []).length + (team.managementState?.academyPlayers || []).length
        const r = EconomyEngine.processWeeklyFinances(team, s.players, s.contracts, s.staff || [], s.currentWeek, academy, { implicitGear: true })
        const { total: _i, ...income } = r.income
        const { total: _e, ...expenses } = r.expenses
        void _i; void _e
        return { income, expenses }
    }
    type Store = ReturnType<typeof useGameStore.getState>
    const get = (): Store => useGameStore.getState()
    const snap = (): GameSave => buildSaveSnapshot(get() as never) as GameSave

    ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(root, 'public/data/snapshot')
    const loaded = await snapshotLoader.loadSnapshot()
    if (!loaded.success) throw Error(loaded.error)
    const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    const band = tier === 'top' ? [0, 10] : tier === 'mid' ? [50, 80] : [130, Math.min(170, ranked.length)]
    const club = ranked[band[0] + (seed * 7) % (band[1] - band[0])]
    // The save id (and ids derived from it, e.g. preseason friendlies) embeds
    // Date.now(); pin it during creation so a seed replays the same world.
    const realNow = Date.now
    Date.now = () => 1_700_000_000_000 + seed
    try { await get().initializeNewGame(`campaign-${seed}`, club.id) } finally { Date.now = realNow }
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
    const policyStats = { forfeitAdvances: 0, registrations: 0, signings: 0, upgrades: 0, renewals: 0, renewalFailures: 0, sponsorsSigned: 0, choices: 0, jobOffersDeclined: 0, jobChanges: 0, softlocks: 0, preparations: 0, benchReleases: 0, sackings: 0, bankruptcies: 0, rehired: 0 }
    // Phase 4.4: a dismissed manager (sacked, or the club folded) takes the
    // best dismissal offer and the career continues at the new club.
    const dismissals: Array<{ week: number; reason: string; from: string; to: string | null }> = []
    const recoverFromDismissal = (): boolean => {
        const s = get()
        if (s.gameOverReason !== 'SACKED' && s.gameOverReason !== 'BANKRUPTCY') return false
        if (s.gameOverReason === 'SACKED') policyStats.sackings++
        else policyStats.bankruptcies++
        const offers = s.eventsLog.filter(e => e.type === 'JOB_OFFER' && e.data?.afterDismissal && !e.selectedChoiceId && !e.data?.isWithdrawn)
            .sort((a, b) => Number(a.data.offeringTeamRank ?? 999) - Number(b.data.offeringTeamRank ?? 999) || a.id.localeCompare(b.id))
        const from = teamId, reason = String(s.gameOverReason)
        for (const offer of offers) {
            if (get().acceptJobOffer(offer.id).success && !get().gameOverReason) {
                teamId = get().playerTeamId!
                policyStats.rehired++
                jobChanges.push({ week: get().currentWeek, from, to: teamId })
                dismissals.push({ week: get().currentWeek, reason, from, to: teamId })
                return true
            }
        }
        dismissals.push({ week: get().currentWeek, reason, from, to: null })
        return false
    }
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
        // better free agent the club can afford (same test as AI upgrades).
        if (playerTeam().rosterIds.length === 5 && get().currentWeek % 4 === 0) {
            const st = get(), held = academyHeldPlayerIds(st as never)
            const owned = new Set(st.teams.flatMap(t => t.rosterIds))
            const starters = playerTeam().rosterIds.map(id => st.players.find(p => p.id === id)!).filter(Boolean).sort((a, b) => a.skill - b.skill || a.id.localeCompare(b.id))
            const worst = starters[0]
            const save0 = snap(), canAfford = recruitmentBudget(save0 as never, playerTeam() as never)
            const pick = worst && st.players.filter(p => !p.isRetired && !held.has(p.id) && !owned.has(p.id) && p.skill >= worst.skill + 5 && !st.contracts.some(c => c.playerId === p.id && c.endWeek > st.currentWeek))
                .map(p => ({ p, wage: recruitmentSalary(p as PlayerSaveData, st.currentWeek, playerTeam()) }))
                // Pass 2: the same affordability test AI upgrades use (26-week reserve
                // and non-negative weekly net), not a stricter quarter-of-cash rule.
                .filter(x => canAfford(x.wage) && affordableInvestment(save0 as never, playerTeam() as never, 0, x.wage))
                .sort((a, b) => b.p.skill - a.p.skill || a.p.id.localeCompare(b.p.id))[0]
            const w = st.currentWeek
            if (pick && get().transferPlayer(pick.p.id, null, teamId, 0, { salaryPerWeek: pick.wage, startWeek: w, endWeek: w + 104, buyout: 0 }).success) {
                if (get().transferPlayer(worst.id, teamId, 'FA', 0).success) policyStats.upgrades++
            }
        }
        // Competent: shed bench wages while the club runs a weekly deficit
        // (job changes often land the manager at a seven-player AI roster).
        if (policyName !== 'spendthrift' && playerTeam().rosterIds.length > 5 && (playerTeam().weeklyNet ?? 0) < 0) {
            const st = get()
            const bench = playerTeam().rosterIds.slice(5).map(id => st.players.find(p => p.id === id)!).filter(Boolean).sort((a, b) => a.skill - b.skill || a.id.localeCompare(b.id))[0]
            if (bench && get().transferPlayer(bench.id, teamId, 'FA', 0).success) policyStats.benchReleases++
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
    // Match-day preparation a competent manager uses from the match screen:
    // VOD review (scouts the opponent; +25 tactical prep, $2,500), then the
    // counter playstyle; a mental reset ($5,000, +15 morale) only when squad
    // morale is low. Kept to a cash reserve so preparation never bankrupts.
    const MENTAL_RESET_BELOW = 40
    const COUNTER: Record<string, 'aggressive' | 'structured' | 'balanced'> = { aggressive: 'balanced', structured: 'aggressive', balanced: 'structured' }
    const prepareMatch = (m: { id: string; homeTeamId: string; awayTeamId: string }) => {
        if (playerTeam().budget < 250_000 || (playerTeam().weeklyNet ?? 0) < 0) return
        get().performVODReview(m.id)
        const opp = get().teams.find(t => t.id === (m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId))
        const counter = opp?.playstyle ? COUNTER[opp.playstyle] : undefined
        if (counter && playerTeam().playstyle !== counter) get().setPlaystyle(teamId, counter)
        const roster = playerTeam().rosterIds.map(id => get().players.find(p => p.id === id)).filter(Boolean) as Array<{ morale: number }>
        if (roster.length && roster.reduce((s, p) => s + (p.morale ?? 50), 0) / roster.length < MENTAL_RESET_BELOW) get().performMentalReset(m.id)
        policyStats.preparations++
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
                if (policyName === 'competent') await step('match-prep', () => prepareMatch(m))
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
    // Season structure: official matches per club are counted as they
    // complete, because the completed-match log is capped and a season-end
    // scan would undercount busy seasons.
    const season = newSeasonTracker(snap())
    const aiEconomy = newAIEconomyTracker(snap(), teamId)
    const rankings = newRankingTracker(snap(), teamId)
    const dressing = newDressingTracker()
    const startRank = playerTeam().worldRanking ?? null
    // --record-results: every official result and a periodic club snapshot
    // (tmp/ only), for replaying rating models offline (Phase 4.8).
    const recordResults = flag('record-results')
    const recordedIds = new Set(get().completedMatches.map(m => m.id))
    const recordClubs = (s: GameSave) => fs.appendFileSync(path.join(outDir, `${tag}-clubs.jsonl`), JSON.stringify({ w: s.currentWeek, managed: teamId,
        clubs: s.teams.map(t => [t.id, Math.round((t.elo ?? 0) * 10) / 10, t.worldRanking ?? 999, Math.round(t.reputation ?? 0), Math.round(strengthOf(s, t) * 10) / 10, t.region ?? '', t.leagueTier ?? '', t.leagueDivisionLevel ?? 0]) }) + '\n')
    if (recordResults) recordClubs(snap())
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
            syncAIEconomyTracker(aiEconomy, snap())
            syncRankingTracker(rankings, snap())
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
        trackSeasonWeek(season, s, teamId)
        trackAIEconomyWeek(aiEconomy, s, teamId, project)
        trackRankingWeek(rankings, s, teamId)
        trackDressingWeek(dressing, s, teamId)
        if (recordResults) {
            const tiers = new Map(s.tournaments.map(t => [t.id, t.tier]))
            const rows: string[] = []
            for (const m of s.completedMatches) {
                if (recordedIds.has(m.id)) continue
                recordedIds.add(m.id)
                const r = m.result
                if (!r) continue
                let hr = 0, ar = 0
                for (const x of r.maps || []) { hr += x.homeScore || 0; ar += x.awayScore || 0 }
                const kind = !m.tournamentId || m.tournamentId === 'SCRIM' ? 'FRIENDLY' : m.tournamentId.startsWith('league_') ? 'LEAGUE' : (tiers.get(m.tournamentId) ?? 'EVENT')
                rows.push(JSON.stringify({ w: m.week, d: m.day ?? null, id: m.id, h: m.homeTeamId, a: m.awayTeamId, win: r.winnerId ?? (r.homeScore > r.awayScore ? m.homeTeamId : m.awayTeamId), k: kind, st: m.stage ?? null, hs: r.homeScore, as: r.awayScore, hr, ar, maps: (r.maps || []).length, f: m.format ?? null }))
            }
            if (rows.length) fs.appendFileSync(path.join(outDir, `${tag}-results.jsonl`), rows.join('\n') + '\n')
            if (s.currentWeek % 13 === 1) recordClubs(s)
        }
        // --trace-ai: one row per AI club per week (debugging aid, tmp/ only).
        if (flag('trace-ai')) fs.appendFileSync(path.join(outDir, `${tag}-ai-trace.jsonl`), s.teams.filter(t => t.id !== teamId).map(t => JSON.stringify({
            w: s.currentWeek, id: t.id, rank: t.worldRanking, rep: Math.round(t.reputation ?? 0), lvl: t.leagueDivisionLevel, cash: Math.round(t.budget), net: t.weeklyNet, roster: t.rosterIds.length,
            wages: wageBillOf(s, t.id, t.rosterIds), staff: t.staffIds.length, spons: (t.sponsors || []).map(x => `${x.tier[0]}${Math.round(x.weeklyPayout)}`).join(','), adm: t.administrations ?? 0, st: t.financialState,
        })).join('\n') + '\n')
        if (get().gameOverReason && recoverFromDismissal()) { lastIds = new Set(get().eventsLog.map(e => e.id)) }
        if (ticks % 52 === 0 || get().gameOverReason) seasonsOut.push({ ...seasonMetrics(s, seasonOpen, income, teamId, (w: number) => jobChanges.filter(j => j.week <= w).at(-1)?.to ?? club.id), structure: seasonStructureMetrics(season, s, teamId), aiEconomy: aiEconomyMetrics(aiEconomy, s), rankings: rankingMetrics(rankings, s, teamId, strengthOf), dressingRoom: dressingMetrics(dressing, s, teamId) })
        if (ticks % 52 === 0) resetDressingTracker(dressing)
        if (ticks % 52 === 0) { Object.assign(seasonOpen, openState(s, playerTeam().budget)); income.clear(); resetSeasonTracker(season, s); resetAIEconomyTracker(aiEconomy, s, teamId); resetRankingTracker(rankings, s, teamId) }
        if (ticks % 26 === 0) process.stdout.write(`${tag} tick ${ticks} week ${s.currentWeek} cash ${Math.round(playerTeam().budget)} failures ${failures.length} avgMs ${Math.round(tickMs.slice(-26).reduce((a, b) => a + b, 0) / 26)}\n`)
    }
    const final = snap()
    const result = {
        seed, tier, policyName, openingActive, startRank, club: club.id, clubName: club.name, seasonsRequested: seasons, ticks, finalWeek: final.currentWeek,
        terminal: final.gameOverReason ?? null, failures, failureKinds: [...new Set(failures.map(f => f.kind))],
        policy: policyStats, jobChanges, dismissals, roundTrip, inboxPerWeek: distribution(inboxPerWeek), inboxMax: Math.max(0, ...inboxPerWeek), inboxByType,
        tickMs: distribution(tickMs), seasons: seasonsOut, finalHash: sha(canonicalWeekState(final)),
        aiAdministrationsCareer: (() => {
            const counts = final.teams.filter(t => t.id !== teamId && (t.administrations ?? 0) > 0).map(t => t.administrations ?? 0)
            return { total: counts.reduce((a, b) => a + b, 0), clubs: counts.length, maxPerClub: Math.max(0, ...counts) }
        })(),
    }
    fs.writeFileSync(path.join(outDir, `${tag}.json`), JSON.stringify(result, null, 2))
    if (failures.length) fs.writeFileSync(path.join(outDir, 'failures', `${tag}-final.json.gz`), zlib.gzipSync(JSON.stringify(final)))
    process.stdout.write(`${tag} done ticks ${ticks} terminal ${result.terminal} failures ${failures.length} kinds ${result.failureKinds.join(',')}\n`)
}

// ---------------------------------------------------------------- season structure
/**
 * Per-season accumulators for the season-structure, money and board metrics
 * (Phase 4.4). Official = any match with a tournament or league id other
 * than SCRIM (friendlies and scrims are excluded).
 */
export interface SeasonTracker {
    seenIds: Set<string>
    clubMatches: Map<string, number>
    tierAtStart: Map<string, string>
    budgetAtStart: Map<string, number>
    managedCash: number[]
    managedStates: Record<string, number>
    board: number[]
    aiInsolventWeeks: number
}

export function newSeasonTracker(s: GameSave): SeasonTracker {
    const t: SeasonTracker = { seenIds: new Set(s.completedMatches.map(m => m.id)), clubMatches: new Map(), tierAtStart: new Map(), budgetAtStart: new Map(), managedCash: [], managedStates: {}, board: [], aiInsolventWeeks: 0 }
    resetSeasonTracker(t, s)
    return t
}

export function resetSeasonTracker(t: SeasonTracker, s: GameSave): void {
    t.clubMatches.clear(); t.tierAtStart.clear(); t.budgetAtStart.clear()
    t.managedCash = []; t.managedStates = {}; t.board = []; t.aiInsolventWeeks = 0
    for (const team of s.teams) { t.tierAtStart.set(team.id, team.leagueTier ?? 'NONE'); t.budgetAtStart.set(team.id, team.budget) }
}

export function trackSeasonWeek(t: SeasonTracker, s: GameSave, teamId: string): void {
    const now = new Set<string>()
    for (const m of s.completedMatches) {
        now.add(m.id)
        if (t.seenIds.has(m.id) || !m.tournamentId || m.tournamentId === 'SCRIM') continue
        for (const id of [m.homeTeamId, m.awayTeamId]) t.clubMatches.set(id, (t.clubMatches.get(id) ?? 0) + 1)
    }
    t.seenIds = now
    const team = s.teams.find(x => x.id === teamId)
    if (team) {
        t.managedCash.push(Math.round(team.budget))
        const state = team.financialState ?? 'UNKNOWN'
        t.managedStates[state] = (t.managedStates[state] ?? 0) + 1
    }
    if (s.boardState && s.boardState.teamId === teamId) t.board.push(Math.round(s.boardState.confidence))
    t.aiInsolventWeeks += s.teams.filter(x => x.id !== teamId && x.financialState === 'INSOLVENT').length
}

export function seasonStructureMetrics(t: SeasonTracker, s: GameSave, teamId: string) {
    const ai = s.teams.filter(x => x.id !== teamId)
    const group = <T>(rows: T[], key: (r: T) => string) => rows.reduce((m: Record<string, T[]>, r) => { (m[key(r)] ??= []).push(r); return m }, {})
    const byTier = group(ai, x => t.tierAtStart.get(x.id) ?? x.leagueTier ?? 'NONE')
    const byRegion = group(ai, x => x.region ?? 'NONE')
    const matchesOf = (x: { id: string }) => t.clubMatches.get(x.id) ?? 0
    const counts = ai.map(matchesOf)
    const team = s.teams.find(x => x.id === teamId)
    const board = s.boardState as (GameSave['boardState'] & Record<string, unknown>) | undefined
    // Season metrics are taken in the first week of the next season.
    const review = (s.newsFeed || []).find(n => n.id.startsWith(`board_review_s${Math.floor((s.currentWeek - 2) / 52) + 1}_`))
    return {
        clubMatches: distribution(counts),
        clubMatchesByTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, distribution(v.map(matchesOf))])),
        clubMatchesByRegion: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [k, distribution(v.map(matchesOf))])),
        clubsBelow20: counts.filter(n => n < 20).length, clubsBelow30: counts.filter(n => n < 30).length, clubsAbove45: counts.filter(n => n > 45).length,
        managedMatches: t.clubMatches.get(teamId) ?? 0,
        aiBudgetByTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, distribution(v.map(x => x.budget))])),
        aiCashDeltaByTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, distribution(v.map(x => x.budget - (t.budgetAtStart.get(x.id) ?? x.budget)))])),
        aiWeeklyNetByTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, distribution(v.map(x => x.weeklyNet ?? NaN))])),
        aiNegative: ai.filter(x => x.budget < 0).length,
        aiFinancialStates: ai.reduce((m: Record<string, number>, x) => { const k = x.financialState ?? 'UNKNOWN'; m[k] = (m[k] ?? 0) + 1; return m }, {}),
        aiInsolventClubWeeks: t.aiInsolventWeeks,
        aiAdministrations: ai.reduce((n, x) => n + ((x as { administrations?: number }).administrations ?? 0), 0),
        leagueDivisions: s.league?.current?.divisions.length ?? 0,
        managed: {
            tier: t.tierAtStart.get(teamId), cashStart: t.managedCash[0] ?? null, cashMin: t.managedCash.length ? Math.min(...t.managedCash) : null, cashEnd: team ? Math.round(team.budget) : null,
            weeklyNet: team?.weeklyNet ?? null, runwayWeeks: team?.runwayWeeks ?? null, stateWeeks: t.managedStates,
            board: { start: t.board[0] ?? null, min: t.board.length ? Math.min(...t.board) : null, end: t.board.at(-1) ?? null, onNotice: !!board?.onNotice, warnings: board?.warnings ?? null, review: review?.title ?? null, objectives: board?.objectives ?? null },
        },
    }
}

// ---------------------------------------------------------------- dressing room (Phase 5.2)
/**
 * Personalities and morale v2 (read-only; a save without personalities
 * reports archetype NONE). Transfer requests are counted once by event id in
 * the season they arrived; promises by their kept/broken notices.
 */
export interface DressingTracker {
    requests: Map<string, { week: number; choice: string | null }>
    promises: Map<string, { week: number; kept: boolean }>
    rosterMorale: number[]
    unhappyPlayerWeeks: number
    seasonStartWeek: number | null
}

type PersonalityLike = { archetype?: string; promise?: { kind?: string } }
const personalityOf = (p: PlayerSaveData): PersonalityLike | undefined => (p as unknown as { personality?: PersonalityLike }).personality

export function newDressingTracker(): DressingTracker {
    return { requests: new Map(), promises: new Map(), rosterMorale: [], unhappyPlayerWeeks: 0, seasonStartWeek: null }
}

export function resetDressingTracker(t: DressingTracker): void {
    t.rosterMorale = []; t.unhappyPlayerWeeks = 0; t.seasonStartWeek = null
}

export function trackDressingWeek(t: DressingTracker, s: GameSave, teamId: string): void {
    t.seasonStartWeek ??= s.currentWeek
    for (const e of s.eventsLog) {
        if (e.id.startsWith('transfer_request_')) {
            const row = t.requests.get(e.id)
            if (!row) t.requests.set(e.id, { week: e.week, choice: e.selectedChoiceId ?? null })
            else if (e.selectedChoiceId) row.choice = e.selectedChoiceId
        } else if ((e.id.startsWith('promise_kept_') || e.id.startsWith('promise_broken_')) && !t.promises.has(e.id)) {
            t.promises.set(e.id, { week: e.week, kept: e.id.startsWith('promise_kept_') })
        }
    }
    const byId = new Map(s.players.map(p => [p.id, p]))
    const roster = (s.teams.find(x => x.id === teamId)?.rosterIds ?? []).map(id => byId.get(id)).filter((p): p is PlayerSaveData => !!p)
    if (roster.length) t.rosterMorale.push(avgOf(roster.map(p => p.morale)))
    t.unhappyPlayerWeeks += roster.filter(p => p.morale < 40).length
}

export function dressingMetrics(t: DressingTracker, s: GameSave, teamId: string) {
    const from = t.seasonStartWeek ?? s.currentWeek - 51
    const requests = [...t.requests.values()].filter(r => r.week >= from)
    const promises = [...t.promises.values()].filter(r => r.week >= from)
    const active = s.players.filter(p => !p.isRetired)
    const rostered = new Set(s.teams.flatMap(x => x.rosterIds))
    const archetypes: Record<string, number> = {}
    const traits: Record<string, number> = {}
    for (const p of active) {
        const a = personalityOf(p)?.archetype ?? 'NONE'
        archetypes[a] = (archetypes[a] ?? 0) + 1
        for (const tr of p.traits ?? []) traits[tr] = (traits[tr] ?? 0) + 1
    }
    const team = s.teams.find(x => x.id === teamId) as (GameSave['teams'][number] & { dressingRoom?: { captainId?: string; mentorships?: unknown[] } }) | undefined
    const aiMorale = active.filter(p => rostered.has(p.id) && !team?.rosterIds.includes(p.id)).map(p => p.morale)
    return {
        transferRequests: requests.length,
        requestChoices: requests.reduce((m: Record<string, number>, r) => { const k = r.choice ?? 'open'; m[k] = (m[k] ?? 0) + 1; return m }, {}),
        promisesKept: promises.filter(p => p.kept).length,
        promisesBroken: promises.filter(p => !p.kept).length,
        managedRosterMorale: distribution(t.rosterMorale),
        managedUnhappyPlayerWeeks: t.unhappyPlayerWeeks,
        aiRosteredMorale: distribution(aiMorale),
        archetypes,
        traitShare: active.length ? active.filter(p => (p.traits?.length ?? 0) > 0).length / active.length : 0,
        traits,
        captainId: team?.dressingRoom?.captainId ?? null,
        mentorships: team?.dressingRoom?.mentorships?.length ?? 0,
    }
}

/** Phase 5.2 summary: transfer requests per managed club and season, promises, morale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dressingRoomSummary(results: any[], seasonsAll: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ss = seasonsAll.filter((s: any) => s.dressingRoom)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sum = (fn: (s: any) => number) => ss.reduce((n: number, s: any) => n + fn(s), 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const last = results.map(r => r.seasons.at(-1)?.dressingRoom).filter(Boolean) as any[]
    const archetypes: Record<string, number> = {}
    for (const d of last) for (const [k, v] of Object.entries(d.archetypes as Record<string, number>)) archetypes[k] = (archetypes[k] ?? 0) + v
    return {
        seasons: ss.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transferRequestsPerClubSeason: distribution(ss.map((s: any) => s.dressingRoom.transferRequests)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transferRequestsMaxPerClubSeason: Math.max(0, ...ss.map((s: any) => s.dressingRoom.transferRequests)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transferRequestsTotal: sum((s: any) => s.dressingRoom.transferRequests),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requestChoices: ss.reduce((m: Record<string, number>, s: any) => { for (const [k, v] of Object.entries(s.dressingRoom.requestChoices as Record<string, number>)) m[k] = (m[k] ?? 0) + v; return m }, {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        promisesKept: sum((s: any) => s.dressingRoom.promisesKept), promisesBroken: sum((s: any) => s.dressingRoom.promisesBroken),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        managedRosterMoraleMedian: distribution(ss.map((s: any) => s.dressingRoom.managedRosterMorale.median)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        managedUnhappyPlayerWeeks: distribution(ss.map((s: any) => s.dressingRoom.managedUnhappyPlayerWeeks)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiRosteredMoraleMedian: distribution(ss.map((s: any) => s.dressingRoom.aiRosteredMorale.median)),
        archetypesFinal: archetypes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        traitShareFinal: distribution(last.map((d: any) => d.traitShare)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiAdministrationsCareer: results.map((r: any) => r.aiAdministrationsCareer?.total ?? null),
    }
}

// ---------------------------------------------------------------- AI economy (Phase 4.6)
/** Weekly running-cost/income breakdown of one club (EconomyEngine projection). */
export type FinanceBreakdown = { income: Record<string, number>; expenses: Record<string, number> }
export type FinanceProjector = (s: GameSave, team: GameSave['teams'][number]) => FinanceBreakdown

interface AITeamSeason {
    tier: string; region: string; level: number; startBudget: number; startWages: number; startRoster: number
    flows: Record<string, number>; minRoster: number; shortWeeks: number; insolventWeeks: number
    /** Cumulative team.administrations seen so far, and this season's count. */
    adminSeen: number; administrations: number
}

/**
 * Per-season AI club economy: where each AI club's money came from and went
 * (recurring lines from the weekly settlement, one-off lines from new ledger
 * rows, and the unledgered residual such as an administration
 * recapitalisation), administrations, and roster viability every week.
 */
export interface AIEconomyTracker {
    teams: Map<string, AITeamSeason>
    ledgerIds: Set<string>
    lastBudget: Map<string, number>
    minRoster: number
    shortClubWeeks: number
    administrations: Array<{ week: number; teamId: string }>
}

const wageBillOf = (s: GameSave, teamId: string, roster: string[]) => {
    const ids = new Set(roster)
    return s.contracts.filter(c => c.teamId === teamId && ids.has(c.playerId) && c.endWeek > s.currentWeek).reduce((n, c) => n + c.salaryPerWeek, 0)
}

export function newAIEconomyTracker(s: GameSave, teamId: string): AIEconomyTracker {
    const t: AIEconomyTracker = { teams: new Map(), ledgerIds: new Set(s.financeLedger.map(e => e.id)), lastBudget: new Map(), minRoster: Infinity, shortClubWeeks: 0, administrations: [] }
    resetAIEconomyTracker(t, s, teamId)
    return t
}

export function resetAIEconomyTracker(t: AIEconomyTracker, s: GameSave, teamId: string): void {
    t.teams.clear(); t.minRoster = Infinity; t.shortClubWeeks = 0; t.administrations = []
    for (const team of s.teams) {
        t.lastBudget.set(team.id, team.budget)
        if (team.id === teamId) continue
        t.teams.set(team.id, {
            tier: team.leagueTier ?? 'NONE', region: team.region ?? 'NONE', level: team.leagueDivisionLevel ?? 0,
            startBudget: team.budget, startWages: wageBillOf(s, team.id, team.rosterIds), startRoster: team.rosterIds.length,
            flows: {}, minRoster: team.rosterIds.length, shortWeeks: 0, insolventWeeks: 0, adminSeen: team.administrations ?? 0, administrations: 0,
        })
    }
}

export function trackAIEconomyWeek(t: AIEconomyTracker, s: GameSave, teamId: string, project: FinanceProjector): void {
    const fresh = new Map<string, Record<string, number>>()
    for (const e of s.financeLedger) {
        if (t.ledgerIds.has(e.id)) continue
        t.ledgerIds.add(e.id)
        const rows = fresh.get(e.teamId) ?? {}
        const key = `${e.type === 'INCOME' ? '+' : '-'}${e.category}`
        rows[key] = (rows[key] ?? 0) + (e.type === 'INCOME' ? e.amount : -e.amount)
        fresh.set(e.teamId, rows)
    }
    for (const team of s.teams) {
        const prev = t.lastBudget.get(team.id) ?? team.budget
        t.lastBudget.set(team.id, team.budget)
        const row = t.teams.get(team.id)
        if (!row || team.id === teamId) continue
        const add = (k: string, v: number) => { row.flows[k] = (row.flows[k] ?? 0) + v }
        const settled = team.financeSettlement?.week === s.currentWeek ? team.financeSettlement : undefined
        let explained = 0
        if (settled) {
            // Split the settled totals by the current projection's shares.
            const b = project(s, team)
            const inc = Object.values(b.income).reduce((a, x) => a + x, 0) || 1
            const exp = Object.values(b.expenses).reduce((a, x) => a + x, 0) || 1
            for (const [k, v] of Object.entries(b.income)) add(`+${k}`, settled.income * v / inc)
            for (const [k, v] of Object.entries(b.expenses)) add(`-${k}`, -settled.expenses * v / exp)
            explained += settled.income - settled.expenses
        }
        for (const [k, v] of Object.entries(fresh.get(team.id) ?? {})) { add(k, v); explained += v }
        const residual = team.budget - prev - explained
        if (Math.abs(residual) > 1) add('residual', residual)
        row.minRoster = Math.min(row.minRoster, team.rosterIds.length)
        if (team.rosterIds.length < 5) { row.shortWeeks++; t.shortClubWeeks++ }
        if (team.financialState === 'INSOLVENT') row.insolventWeeks++
        t.minRoster = Math.min(t.minRoster, team.rosterIds.length)
        const admins = team.administrations ?? 0
        for (let i = row.adminSeen; i < admins; i++) { t.administrations.push({ week: s.currentWeek, teamId: team.id }); row.administrations++ }
        row.adminSeen = Math.max(row.adminSeen, admins)
    }
}

/** Weeks the tracker did not see (the save/load round trip): book the cash change as untracked. */
export function syncAIEconomyTracker(t: AIEconomyTracker, s: GameSave): void {
    for (const e of s.financeLedger) t.ledgerIds.add(e.id)
    for (const team of s.teams) {
        const row = t.teams.get(team.id)
        if (row) row.flows.untracked = (row.flows.untracked ?? 0) + team.budget - (t.lastBudget.get(team.id) ?? team.budget)
        t.lastBudget.set(team.id, team.budget)
    }
}

const median = (xs: number[]) => distribution(xs).median ?? NaN
const round = (x: number) => Math.round(x)

/** Season summary of the AI economy (by Elo tier at season start, region and division level). */
export function aiEconomyMetrics(t: AIEconomyTracker, s: GameSave) {
    const rows = [...t.teams.entries()].map(([id, r]) => {
        const team = s.teams.find(x => x.id === id)
        return { id, ...r, endBudget: team?.budget ?? NaN, endWages: team ? wageBillOf(s, id, team.rosterIds) : NaN, endRoster: team?.rosterIds.length ?? 0 }
    })
    const group = (key: (r: typeof rows[number]) => string) => {
        const out: Record<string, typeof rows> = {}
        for (const r of rows) (out[key(r)] ??= []).push(r)
        return out
    }
    const flowKeys = [...new Set(rows.flatMap(r => Object.keys(r.flows)))].sort()
    const summarise = (rs: typeof rows) => ({
        clubs: rs.length,
        cashDelta: distribution(rs.map(r => r.endBudget - r.startBudget)),
        endBudgetMedian: median(rs.map(r => r.endBudget)),
        wageBillStartMedian: median(rs.map(r => r.startWages)), wageBillEndMedian: median(rs.map(r => r.endWages)),
        flowsMeanPerClub: Object.fromEntries(flowKeys.map(k => [k, round(rs.reduce((n, r) => n + (r.flows[k] ?? 0), 0) / Math.max(1, rs.length))]).filter(([, v]) => v !== 0)),
        insolventClubWeeks: rs.reduce((n, r) => n + r.insolventWeeks, 0),
        administrations: rs.reduce((n, r) => n + r.administrations, 0),
        shortClubWeeks: rs.reduce((n, r) => n + r.shortWeeks, 0),
        negativeAtEnd: rs.filter(r => r.endBudget < 0).length,
    })
    const perClub = new Map<string, number>()
    for (const a of t.administrations) perClub.set(a.teamId, (perClub.get(a.teamId) ?? 0) + 1)
    return {
        administrations: t.administrations.length,
        administrationClubs: perClub.size,
        administrationsMaxPerClub: Math.max(0, ...perClub.values()),
        administrationWeeks: t.administrations.map(a => a.week),
        administrationsList: t.administrations.map(a => `${a.teamId}@${a.week}`),
        minRoster: Number.isFinite(t.minRoster) ? t.minRoster : null,
        shortClubWeeks: t.shortClubWeeks,
        byTier: Object.fromEntries(Object.entries(group(r => r.tier)).sort().map(([k, v]) => [k, summarise(v)])),
        byRegion: Object.fromEntries(Object.entries(group(r => r.region)).sort().map(([k, v]) => [k, summarise(v)])),
        byDivisionLevel: Object.fromEntries(Object.entries(group(r => String(r.level))).sort().map(([k, v]) => [k, summarise(v)])),
        worstClubs: [...rows].sort((a, b) => (a.endBudget - a.startBudget) - (b.endBudget - b.startBudget)).slice(0, 8)
            .map(r => ({ id: r.id, tier: r.tier, region: r.region, level: r.level, cashDelta: round(r.endBudget - r.startBudget), startWages: r.startWages, endWages: r.endWages, administrations: r.administrations, flows: Object.fromEntries(Object.entries(r.flows).map(([k, v]) => [k, round(v)])) })),
    }
}

// ---------------------------------------------------------------- rankings (Phase 4.8)
/** Squad strength of a club (mean of its five best players by the projector's rating). */
export type StrengthOf = (s: GameSave, team: GameSave['teams'][number]) => number

const SPONSOR_TIERS = ['ELITE', 'PREMIUM', 'STANDARD'] as const
const LEAGUE_TIER_KEYS = ['S_TIER', 'A_TIER', 'B_TIER', 'C_TIER'] as const

/**
 * World-ranking stability over a career (Phase 4.8): weekly rank movement of
 * the clubs that opened the career in the top 20 (AI clubs only), Elo pool
 * level and spread, league tier counts, sponsor tiers held and premium/elite
 * eligibility flips (rank crossing 30 or 10), and the managed club's path.
 */
export interface RankingTracker {
    top10: string[]
    top20: string[]
    /** AI top 10 at the start of the current season ("over a season" retention). */
    seasonTop10: string[]
    lastRank: Map<string, number>
    /** |rank change| per snapshot top-20 club per week, this season. */
    weeklyTop20: number[]
    /** |rank change| per club per week (all clubs), this season. */
    weeklyAll: number[]
    top10OutsideTop30Weeks: number
    start: { elo: ReturnType<typeof eloStats>; tiers: Record<string, number>; sponsorTiers: Map<string, Set<string>>; week: number }
    tierMin: Record<string, number>
    tierMax: Record<string, number>
    premiumFlips: number
    eliteFlips: number
    weeks: number
    managedPath: Array<[number, number]>
    eloMeanPath: Array<[number, number]>
}

function eloStats(s: GameSave) {
    const elos = s.teams.map(t => t.elo ?? NaN).filter(Number.isFinite)
    const mean = elos.reduce((a, b) => a + b, 0) / Math.max(1, elos.length)
    const sd = Math.sqrt(elos.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, elos.length))
    const d = distribution(elos)
    const sorted = [...elos].sort((a, b) => b - a)
    return { mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10, min: d.min, p10: d.p10, median: d.median, p90: d.p90, max: d.max, top20Spread: sorted.length >= 20 ? Math.round(sorted[0] - sorted[19]) : null }
}

function tierCounts(s: GameSave): Record<string, number> {
    const out: Record<string, number> = Object.fromEntries(LEAGUE_TIER_KEYS.map(k => [k, 0]))
    for (const t of s.teams) out[t.leagueTier ?? 'NONE'] = (out[t.leagueTier ?? 'NONE'] ?? 0) + 1
    return out
}

const sponsorTiersOf = (s: GameSave, teamId: string) => new Map(s.teams.filter(t => t.id !== teamId).map(t => [t.id, new Set((t.sponsors || []).map(x => String(x.tier)))]))

export function newRankingTracker(s: GameSave, teamId: string): RankingTracker {
    const ai = s.teams.filter(t => t.id !== teamId).sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999) || a.id.localeCompare(b.id))
    const t: RankingTracker = {
        top10: ai.slice(0, 10).map(x => x.id), top20: ai.slice(0, 20).map(x => x.id), seasonTop10: [], lastRank: new Map(),
        weeklyTop20: [], weeklyAll: [], top10OutsideTop30Weeks: 0,
        start: { elo: eloStats(s), tiers: tierCounts(s), sponsorTiers: sponsorTiersOf(s, teamId), week: s.currentWeek },
        tierMin: {}, tierMax: {}, premiumFlips: 0, eliteFlips: 0, weeks: 0, managedPath: [], eloMeanPath: [],
    }
    resetRankingTracker(t, s, teamId)
    return t
}

export function resetRankingTracker(t: RankingTracker, s: GameSave, teamId: string): void {
    t.weeklyTop20 = []; t.weeklyAll = []; t.top10OutsideTop30Weeks = 0; t.premiumFlips = 0; t.eliteFlips = 0; t.weeks = 0
    t.seasonTop10 = s.teams.filter(x => x.id !== teamId).sort((a, b) => (a.worldRanking ?? 999) - (b.worldRanking ?? 999) || a.id.localeCompare(b.id)).slice(0, 10).map(x => x.id)
    t.start = { elo: eloStats(s), tiers: tierCounts(s), sponsorTiers: sponsorTiersOf(s, teamId), week: s.currentWeek }
    t.tierMin = { ...t.start.tiers }; t.tierMax = { ...t.start.tiers }
    t.managedPath = []; t.eloMeanPath = []
    syncRankingTracker(t, s)
}

/** Weeks the tracker did not see (the save/load round trip): continue from the current ranks. */
export function syncRankingTracker(t: RankingTracker, s: GameSave): void {
    t.lastRank = new Map(s.teams.map(x => [x.id, x.worldRanking ?? 999]))
}

export function trackRankingWeek(t: RankingTracker, s: GameSave, teamId: string): void {
    const top20 = new Set(t.top20), top10 = new Set(t.top10)
    for (const team of s.teams) {
        const now = team.worldRanking ?? 999, before = t.lastRank.get(team.id)
        if (before === undefined) continue
        const d = Math.abs(now - before)
        t.weeklyAll.push(d)
        if (top20.has(team.id)) t.weeklyTop20.push(d)
        if (top10.has(team.id) && now > 30) t.top10OutsideTop30Weeks++
        if (team.id !== teamId) {
            if ((before <= 30) !== (now <= 30)) t.premiumFlips++
            if ((before <= 10) !== (now <= 10)) t.eliteFlips++
        }
    }
    const tiers = tierCounts(s)
    for (const [k, v] of Object.entries(tiers)) { t.tierMin[k] = Math.min(t.tierMin[k] ?? v, v); t.tierMax[k] = Math.max(t.tierMax[k] ?? v, v) }
    t.weeks++
    const managed = s.teams.find(x => x.id === teamId)?.worldRanking
    if (t.weeks % 4 === 0) {
        if (managed !== undefined) t.managedPath.push([s.currentWeek, managed])
        t.eloMeanPath.push([s.currentWeek, eloStats(s).mean])
    }
    syncRankingTracker(t, s)
}

function spearman(xs: number[], ys: number[]): number {
    const rank = (v: number[]) => { const order = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(v.length); order.forEach(([, i], k) => { r[i] = k }); return r }
    const a = rank(xs), b = rank(ys), n = xs.length
    if (n < 3) return NaN
    const ma = a.reduce((p, q) => p + q, 0) / n, mb = b.reduce((p, q) => p + q, 0) / n
    let num = 0, da = 0, db = 0
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 }
    return Math.round(num / Math.sqrt(da * db) * 1000) / 1000
}

export function rankingMetrics(t: RankingTracker, s: GameSave, teamId: string, strengthOf: StrengthOf) {
    const byId = new Map(s.teams.map(x => [x.id, x]))
    const rankOf = (id: string) => byId.get(id)?.worldRanking ?? 999
    const endSponsors = sponsorTiersOf(s, teamId)
    const heldBy = (m: Map<string, Set<string>>, tier: string) => [...m.values()].filter(set => set.has(tier)).length
    const lostPremiumOrElite = t.top20.filter(id => {
        const a = t.start.sponsorTiers.get(id), b = endSponsors.get(id)
        const had = !!a && (a.has('ELITE') || a.has('PREMIUM')), has = !!b && (b.has('ELITE') || b.has('PREMIUM'))
        return had && !has
    }).length
    const ai = s.teams.filter(x => x.id !== teamId)
    const strength = ai.map(x => strengthOf(s, x))
    const strengthRank = new Map([...ai.map((x, i) => [x.id, strength[i]] as const)].sort((a, b) => b[1] - a[1]).map(([id], i) => [id, i + 1]))
    const seasonFallers = t.seasonTop10.filter(id => rankOf(id) > 30)
    return {
        weeks: t.weeks,
        weeklyRankChangeTop20: distribution(t.weeklyTop20),
        weeklyRankChangeAll: distribution(t.weeklyAll),
        top10EndRanks: t.top10.map(rankOf),
        top20EndRanks: t.top20.map(rankOf),
        top10OutsideTop30AtEnd: t.top10.filter(id => rankOf(id) > 30).length,
        // Retention over this season: the AI top 10 at season start, at season end.
        seasonTop10EndRanks: t.seasonTop10.map(rankOf),
        seasonTop10OutsideTop30AtEnd: seasonFallers.length,
        // ...of which the squad is still top-30 strength (a fall the squad does not explain).
        seasonTop10FallsWithTop30Squad: seasonFallers.filter(id => (strengthRank.get(id) ?? 999) <= 30).length,
        top10OutsideTop30Weeks: t.top10OutsideTop30Weeks,
        top20InTop30AtEnd: t.top20.filter(id => rankOf(id) <= 30).length,
        elo: { start: t.start.elo, end: eloStats(s), meanPath: t.eloMeanPath },
        tiers: { start: t.start.tiers, end: tierCounts(s), min: t.tierMin, max: t.tierMax },
        sponsors: {
            start: Object.fromEntries(SPONSOR_TIERS.map(k => [k, heldBy(t.start.sponsorTiers, k)])),
            end: Object.fromEntries(SPONSOR_TIERS.map(k => [k, heldBy(endSponsors, k)])),
            top20LostPremiumOrElite: lostPremiumOrElite,
            premiumEligibilityFlipsPerWeek: Math.round(t.premiumFlips / Math.max(1, t.weeks) * 100) / 100,
            eliteEligibilityFlipsPerWeek: Math.round(t.eliteFlips / Math.max(1, t.weeks) * 100) / 100,
        },
        // Spearman between world rank and squad-strength rank (1 = rank order is strength order).
        rankVsStrength: spearman(ai.map(x => x.worldRanking ?? 999), strength.map(v => -v)),
        managed: { rank: byId.get(teamId)?.worldRanking ?? null, best: Math.min(...t.managedPath.map(p => p[1]), byId.get(teamId)?.worldRanking ?? 999), path: t.managedPath, tier: byId.get(teamId)?.leagueTier ?? null },
    }
}

/** Phase 4.8 summary: ranking volatility, Elo pool, tier counts and sponsor churn per season. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rankingSummary(results: any[], seasonsAll: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ss = seasonsAll.filter((s: any) => s.rankings)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxSeasons = Math.max(0, ...results.map((r: any) => r.seasons.length))
    const tiers = LEAGUE_TIER_KEYS
    return {
        bySeason: Array.from({ length: maxSeasons }, (_, i) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const list = ss.filter((s: any) => s.index === i + 1).map((s: any) => s.rankings)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pick = (fn: (r: any) => number) => distribution(list.map(fn))
            return {
                season: i + 1, careers: list.length,
                weeklyRankChangeTop20: { median: pick(r => r.weeklyRankChangeTop20.median), p90: pick(r => r.weeklyRankChangeTop20.p90), max: pick(r => r.weeklyRankChangeTop20.max) },
                weeklyRankChangeAll: { median: pick(r => r.weeklyRankChangeAll.median), p90: pick(r => r.weeklyRankChangeAll.p90) },
                top10OutsideTop30AtEnd: pick(r => r.top10OutsideTop30AtEnd),
                seasonTop10OutsideTop30AtEnd: pick(r => r.seasonTop10OutsideTop30AtEnd ?? NaN),
                seasonTop10FallsWithTop30Squad: pick(r => r.seasonTop10FallsWithTop30Squad ?? NaN),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                seasonTop10EndRanks: distribution(list.flatMap((r: any) => r.seasonTop10EndRanks ?? [])),
                top10OutsideTop30Weeks: pick(r => r.top10OutsideTop30Weeks),
                top20InTop30AtEnd: pick(r => r.top20InTop30AtEnd),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                top10EndRanks: distribution(list.flatMap((r: any) => r.top10EndRanks)),
                eloMean: { start: pick(r => r.elo.start.mean), end: pick(r => r.elo.end.mean) },
                eloSd: { start: pick(r => r.elo.start.sd), end: pick(r => r.elo.end.sd) },
                eloMax: { start: pick(r => r.elo.start.max), end: pick(r => r.elo.end.max) },
                eloMin: { start: pick(r => r.elo.start.min), end: pick(r => r.elo.end.min) },
                eloTop20Spread: { start: pick(r => r.elo.start.top20Spread), end: pick(r => r.elo.end.top20Spread) },
                tierCountsStart: Object.fromEntries(tiers.map(k => [k, pick(r => r.tiers.start[k] ?? 0).median])),
                tierCountsEnd: Object.fromEntries(tiers.map(k => [k, pick(r => r.tiers.end[k] ?? 0).median])),
                tierCountRangeInSeason: Object.fromEntries(tiers.map(k => [k, [pick(r => r.tiers.min[k] ?? 0).min, pick(r => r.tiers.max[k] ?? 0).max]])),
                sponsorTiersHeldStart: Object.fromEntries(SPONSOR_TIERS.map(k => [k, pick(r => r.sponsors.start[k]).median])),
                sponsorTiersHeldEnd: Object.fromEntries(SPONSOR_TIERS.map(k => [k, pick(r => r.sponsors.end[k]).median])),
                top20LostPremiumOrElite: pick(r => r.sponsors.top20LostPremiumOrElite),
                premiumEligibilityFlipsPerWeek: pick(r => r.sponsors.premiumEligibilityFlipsPerWeek),
                eliteEligibilityFlipsPerWeek: pick(r => r.sponsors.eliteEligibilityFlipsPerWeek),
                rankVsStrength: pick(r => r.rankVsStrength),
            }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        managed: results.map((r: any) => ({
            seed: r.seed, tier: r.tier, club: r.club,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rankBySeason: r.seasons.map((s: any) => s.rankings?.managed.rank ?? s.managed.ranking),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            bestBySeason: r.seasons.map((s: any) => s.rankings?.managed.best ?? null),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            winRateBySeason: r.seasons.map((s: any) => s.managed.matches ? Math.round(s.managed.wins / s.managed.matches * 1000) / 1000 : null),
            startRank: r.startRank ?? null,
        })),
    }
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

/** Phase 4.4 summary: fixtures per club, money by tier, board outcomes, failure states. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function seasonStructureSummary(results: any[], seasonsAll: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ss = seasonsAll.filter((s: any) => s.structure)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pick = (fn: (s: any) => number) => distribution(ss.map(fn))
    const leagueTiers = ['S_TIER', 'A_TIER', 'B_TIER', 'C_TIER']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxSeasons = Math.max(0, ...results.map((r: any) => r.seasons.length))
    return {
        aiClubMatches: { min: pick(s => s.structure.clubMatches.min), p10: pick(s => s.structure.clubMatches.p10), median: pick(s => s.structure.clubMatches.median), p90: pick(s => s.structure.clubMatches.p90), max: pick(s => s.structure.clubMatches.max) },
        aiClubMatchesMedianByLeagueTier: Object.fromEntries(leagueTiers.map(t => [t, pick(s => s.structure.clubMatchesByTier[t]?.median ?? NaN)])),
        aiClubMatchesMinByLeagueTier: Object.fromEntries(leagueTiers.map(t => [t, pick(s => s.structure.clubMatchesByTier[t]?.min ?? NaN)])),
        clubsBelow20: pick(s => s.structure.clubsBelow20), clubsBelow30: pick(s => s.structure.clubsBelow30), clubsAbove45: pick(s => s.structure.clubsAbove45),
        managedMatchesByTier: Object.fromEntries(TIERS.map(t => [t, distribution(ss.filter(s => s.tier === t).map(s => s.structure.managedMatches))])),
        managedCashEndBySeason: Object.fromEntries(TIERS.map(t => [t, Array.from({ length: maxSeasons }, (_, i) => distribution(ss.filter(s => s.tier === t && s.index === i + 1).map(s => s.structure.managed.cashEnd)).median)])),
        managedCashMinBySeason: Object.fromEntries(TIERS.map(t => [t, Array.from({ length: maxSeasons }, (_, i) => distribution(ss.filter(s => s.tier === t && s.index === i + 1).map(s => s.structure.managed.cashMin)).median)])),
        managedWeeklyNetEnd: Object.fromEntries(TIERS.map(t => [t, distribution(ss.filter(s => s.tier === t).map(s => s.structure.managed.weeklyNet ?? NaN))])),
        aiBudgetMedianByLeagueTier: Object.fromEntries(leagueTiers.map(t => [t, pick(s => s.structure.aiBudgetByTier[t]?.median ?? NaN)])),
        aiCashDeltaMedianByLeagueTier: Object.fromEntries(leagueTiers.map(t => [t, pick(s => s.structure.aiCashDeltaByTier[t]?.median ?? NaN)])),
        aiNegative: pick(s => s.structure.aiNegative), aiInsolventClubWeeks: pick(s => s.structure.aiInsolventClubWeeks),
        boardEndByTier: Object.fromEntries(TIERS.map(t => [t, distribution(ss.filter(s => s.tier === t).map(s => s.structure.managed.board.end ?? NaN))])),
        boardMinByTier: Object.fromEntries(TIERS.map(t => [t, distribution(ss.filter(s => s.tier === t).map(s => s.structure.managed.board.min ?? NaN))])),
        boardOnNoticeSeasons: ss.filter(s => s.structure.managed.board.onNotice).length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        boardReviews: ss.reduce((m: Record<string, number>, s: any) => { const k = String(s.structure.managed.board.review ?? 'none').replace(/ (at|with|on|about) .*$/, ''); m[k] = (m[k] ?? 0) + 1; return m }, {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        terminal: results.reduce((m: Record<string, number>, r: any) => { const k = `${r.tier}:${r.terminal ?? 'none'}`; m[k] = (m[k] ?? 0) + 1; return m }, {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sackings: results.reduce((n: number, r: any) => n + (r.policy?.sackings ?? (r.terminal === 'SACKED' ? 1 : 0)), 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        bankruptcies: results.reduce((n: number, r: any) => n + (r.policy?.bankruptcies ?? (r.terminal === 'BANKRUPTCY' ? 1 : 0)), 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rehiredAfterDismissal: results.reduce((n: number, r: any) => n + (r.policy?.rehired ?? 0), 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        aiAdministrations: pick(s => s.structure.aiAdministrations ?? NaN),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        jobChanges: results.reduce((n: number, r: any) => n + (r.jobChanges?.length ?? 0), 0),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tickMsMedian: distribution(results.map((r: any) => r.tickMs.median)),
    }
}

/** Phase 4.6 summary: AI club economy and roster viability per season. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function aiEconomySummary(results: any[], seasonsAll: any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ss = seasonsAll.filter((s: any) => s.aiEconomy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxSeasons = Math.max(0, ...results.map((r: any) => r.seasons.length))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ofSeason = (i: number) => ss.filter((s: any) => s.index === i)
    const tiers = ['S_TIER', 'A_TIER', 'B_TIER', 'C_TIER']
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meanFlows = (list: any[]) => {
        const acc: Record<string, number> = {}
        for (const f of list) for (const [k, v] of Object.entries(f ?? {})) acc[k] = (acc[k] ?? 0) + (v as number) / list.length
        return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, Math.round(v)]))
    }
    return {
        bySeason: Array.from({ length: maxSeasons }, (_, i) => {
            const list = ofSeason(i + 1)
            return {
                season: i + 1, careers: list.length,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                administrations: distribution(list.map((s: any) => s.aiEconomy.administrations)),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                administrationsMaxPerClub: Math.max(0, ...list.map((s: any) => s.aiEconomy.administrationsMaxPerClub)),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                minRoster: Math.min(...list.map((s: any) => s.aiEconomy.minRoster ?? 99)),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shortClubWeeks: distribution(list.map((s: any) => s.aiEconomy.shortClubWeeks)),
                cashDeltaMedianByTier: Object.fromEntries(tiers.map(t => [t, distribution(list.map((s: any) => s.aiEconomy.byTier[t]?.cashDelta.median ?? NaN))])), // eslint-disable-line @typescript-eslint/no-explicit-any
                wageBillMedianByTier: Object.fromEntries(tiers.map(t => [t, { start: distribution(list.map((s: any) => s.aiEconomy.byTier[t]?.wageBillStartMedian ?? NaN)).median, end: distribution(list.map((s: any) => s.aiEconomy.byTier[t]?.wageBillEndMedian ?? NaN)).median }])), // eslint-disable-line @typescript-eslint/no-explicit-any
                flowsMeanPerClubByTier: Object.fromEntries(tiers.map(t => [t, meanFlows(list.map((s: any) => s.aiEconomy.byTier[t]?.flowsMeanPerClub).filter(Boolean))])), // eslint-disable-line @typescript-eslint/no-explicit-any
                cashDeltaMedianByRegion: Object.fromEntries([...new Set(list.flatMap((s: any) => Object.keys(s.aiEconomy.byRegion)))].sort().map(r => [r, distribution(list.map((s: any) => s.aiEconomy.byRegion[r]?.cashDelta.median ?? NaN)).median])), // eslint-disable-line @typescript-eslint/no-explicit-any
                administrationsByRegion: Object.fromEntries([...new Set(list.flatMap((s: any) => Object.keys(s.aiEconomy.byRegion)))].sort().map(r => [r, list.reduce((n: number, s: any) => n + (s.aiEconomy.byRegion[r]?.administrations ?? 0), 0)])), // eslint-disable-line @typescript-eslint/no-explicit-any
                administrationsByDivisionLevel: Object.fromEntries([...new Set(list.flatMap((s: any) => Object.keys(s.aiEconomy.byDivisionLevel)))].sort().map(r => [r, list.reduce((n: number, s: any) => n + (s.aiEconomy.byDivisionLevel[r]?.administrations ?? 0), 0)])), // eslint-disable-line @typescript-eslint/no-explicit-any
                cashDeltaMedianByDivisionLevel: Object.fromEntries([...new Set(list.flatMap((s: any) => Object.keys(s.aiEconomy.byDivisionLevel)))].sort().map(r => [r, distribution(list.map((s: any) => s.aiEconomy.byDivisionLevel[r]?.cashDelta.median ?? NaN)).median])), // eslint-disable-line @typescript-eslint/no-explicit-any
            }
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        careerAdministrations: results.map((r: any) => ({ seed: r.seed, ...(r.aiAdministrationsCareer ?? {}) })),
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
        policy: 'Deterministic: register for every eligible event starting within 4 weeks; play own matches by instant sim after match prep (VOD review + counter playstyle; mental reset when squad morale < 40; only above a $250k reserve and with non-negative weekly net); release the weakest bench player while running a weekly deficit; decline job offers unless on board notice (then take the best-ranked offer); monthly swap of the weakest starter for a clearly better free agent the club can afford (same 26-week reserve and non-negative net test as AI upgrades); money-maximising branch on choice events that does not cost morale; renew expiring starters; fill to five from free agency (best affordable for 104 weeks, else cheapest); keep up to three sponsors (best offered, avoiding morale-draining brands).',
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
    ;(summary as any).seasonStructure = seasonStructureSummary(results, seasonsAll)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(summary as any).aiEconomy = aiEconomySummary(results, seasonsAll)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(summary as any).rankings = rankingSummary(results, seasonsAll)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(summary as any).dressingRoom = dressingRoomSummary(results, seasonsAll)
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
        const child = spawn(process.execPath, ['--max-old-space-size=3072', cli, __filename, '--worker', `--seed=${seed}`, `--seasons=${seasons}`, `--label=${label}`, `--policy=${policyName}`, ...(flag('record-results') ? ['--record-results'] : [])], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
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
