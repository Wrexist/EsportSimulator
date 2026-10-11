/**
 * Week change recorder: compact "what changed, and why" entries for the
 * managed club (Phase 4 stream 4.1, weekly report).
 *
 * Recording is diff based. A caller snapshots the managed club, runs one step
 * whose cause it knows (training, recovery, a match, the finance settlement),
 * snapshots again and diffs. Only values that really moved become entries, so
 * the report can never show an effect the engine did not apply.
 *
 * Engine safe: no React, no store. The week processor runs this inside the
 * worker and returns the entries with its result.
 */

export type ChangeKind =
    | "attribute" | "form" | "morale" | "fatigue" | "energy"
    | "money" | "reputation" | "ranking" | "board"
    | "injury" | "contract" | "chemistry"

export type CauseType =
    | "training" | "staff" | "event" | "match" | "activity" | "facility"
    | "salary" | "sponsor" | "prize" | "decay" | "recovery" | "development"
    | "age" | "transfer" | "finance" | "board" | "decision" | "academy"
    | "stability" | "world" | "contract" | "injury" | "dressing_room" | "other"

export interface ChangeCause { type: CauseType; label: string }

export interface ChangeEntry {
    kind: ChangeKind
    /** Player id, or the club id for club-level kinds (money, ranking, board, chemistry, reputation). */
    subjectId: string
    /** What moved: "AWP", "Morale", "Player salaries", "World rank". */
    label: string
    /** Signed change. Money in dollars; world rank in places (negative = climbed). */
    delta: number
    cause: ChangeCause
}

/** Attributes the report tracks, in snapshot order. */
export const TRACKED_ATTRIBUTES = [
    "skill", "awp", "rifle", "pistol", "reaction", "grenades", "creativity",
    "clutch", "tactic", "leader", "teamwork", "stressResistance", "loyalty",
] as const

export const ATTRIBUTE_LABEL: Record<string, string> = {
    skill: "Aim", awp: "AWP", rifle: "Rifle", pistol: "Pistol", reaction: "Reaction",
    grenades: "Utility", creativity: "Creativity", clutch: "Clutch", tactic: "Tactics",
    leader: "Leadership", teamwork: "Teamwork", stressResistance: "Composure", loyalty: "Loyalty",
}

const CONDITION_KINDS = ["morale", "form", "fatigue", "energy"] as const
const CONDITION_LABEL: Record<(typeof CONDITION_KINDS)[number], string> = {
    morale: "Morale", form: "Form", fatigue: "Fatigue", energy: "Energy",
}

export interface PlayerSnapshot {
    id: string
    name: string
    /** TRACKED_ATTRIBUTES values, same order. */
    a: number[]
    morale: number
    form: number
    fatigue: number
    energy: number
    injury: { name: string; weeks: number } | null
}

export interface LedgerRowSnapshot { id: string; signed: number; category: string; description: string }

export interface ClubSnapshot {
    teamId: string
    week: number
    budget: number
    reputation: number
    chemistry: number
    elo: number
    worldRanking: number | null
    board: number | null
    players: PlayerSnapshot[]
    /** playerId → contract end week, managed roster only. */
    contracts: Record<string, number>
    /** Managed club ledger rows from the previous week on (enough to spot new rows). */
    ledger: LedgerRowSnapshot[]
}

/** The slice of a save (or the store) a snapshot reads. */
export interface ClubSource {
    currentWeek: number
    teams: Array<{ id: string; rosterIds: string[]; budget: number; reputation?: number; chemistry?: number; elo?: number; worldRanking?: number }>
    players: Array<{ id: string; nickname?: string; morale?: number; form?: number; fatigue?: number; energy?: number; injury?: { name?: string; weeksRemaining?: number } | null }>
    contracts: Array<{ playerId: string; teamId: string; endWeek: number }>
    financeLedger: Array<{ id: string; teamId: string; week: number; type: string; amount: number; category: string; description: string }>
    boardState?: { teamId?: string; confidence?: number } | null
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback)
const round = (v: number, places: number): number => { const f = 10 ** places; return Math.round(v * f) / f }

export function snapshotClub(source: ClubSource, teamId: string, playerIndex?: Map<string, ClubSource["players"][number]>): ClubSnapshot | null {
    const team = source.teams.find(t => t.id === teamId)
    if (!team) return null
    const byId = playerIndex ?? null
    const players: PlayerSnapshot[] = []
    for (const id of team.rosterIds) {
        const p = byId ? byId.get(id) : source.players.find(x => x.id === id)
        if (!p) continue
        const rec = p as unknown as Record<string, unknown>
        players.push({
            id: p.id,
            name: p.nickname || p.id,
            a: TRACKED_ATTRIBUTES.map(k => num(rec[k])),
            morale: num(p.morale, 50),
            form: num(p.form, 50),
            fatigue: num(p.fatigue),
            energy: num(p.energy, 100),
            injury: p.injury ? { name: String(p.injury.name || "Injury"), weeks: num(p.injury.weeksRemaining) } : null,
        })
    }
    const roster = new Set(team.rosterIds)
    const contracts: Record<string, number> = {}
    for (const c of source.contracts) if (c.teamId === teamId && roster.has(c.playerId)) contracts[c.playerId] = c.endWeek
    const ledger: LedgerRowSnapshot[] = []
    for (const e of source.financeLedger) {
        if (e.teamId !== teamId || e.week < source.currentWeek - 1) continue
        ledger.push({ id: e.id, signed: e.type === "INCOME" ? e.amount : -e.amount, category: e.category, description: e.description })
    }
    const board = source.boardState && (!source.boardState.teamId || source.boardState.teamId === teamId)
        ? num(source.boardState.confidence, NaN) : NaN
    return {
        teamId,
        week: source.currentWeek,
        budget: num(team.budget),
        reputation: num(team.reputation),
        chemistry: num(team.chemistry, 50),
        elo: num(team.elo),
        worldRanking: typeof team.worldRanking === "number" && Number.isFinite(team.worldRanking) ? team.worldRanking : null,
        board: Number.isFinite(board) ? board : null,
        players,
        contracts,
        ledger,
    }
}

/** Cause of a ledger row, from its category. */
export function moneyCause(category: string, description: string): ChangeCause {
    switch (category) {
        case "WAGES_PLAYER": return { type: "salary", label: "Player wages" }
        case "WAGES_STAFF": return { type: "staff", label: "Staff wages" }
        case "FACILITIES": return /activity/i.test(description) ? { type: "activity", label: "Weekly activity" }
            : /operations/i.test(description) ? { type: "finance", label: "Club operations" }
            : { type: "facility", label: "Upkeep" }
        case "PRIZE": return /league|division/i.test(description) ? { type: "prize", label: "League prize money" } : { type: "prize", label: "Prize money" }
        case "SPONSOR": return { type: "sponsor", label: "Sponsors" }
        case "MERCH": return { type: "sponsor", label: "Merchandise" }
        case "TRANSFER_IN": case "TRANSFER_OUT": return { type: "transfer", label: "Transfers" }
        case "TRAINING": return { type: "training", label: "Training" }
        default: return /board/i.test(description) ? { type: "board", label: "Board" }
            : { type: "other", label: /fan/i.test(description) ? "Fans" : /league/i.test(description) ? "League" : "Other" }
    }
}

/**
 * Score from the managed club's side, as the result screens show it: rounds
 * for a single map, maps for a series.
 */
export function sideScore(
    result: { homeScore: number; awayScore: number; maps?: unknown[] },
    isHome: boolean,
): string {
    const maps = (result.maps ?? []) as Array<{ homeScore?: number; awayScore?: number; finalScore?: { team1: number; team2: number } }>
    if (maps.length === 1) {
        const h = maps[0].finalScore?.team1 ?? maps[0].homeScore, a = maps[0].finalScore?.team2 ?? maps[0].awayScore
        if (typeof h === "number" && typeof a === "number") return isHome ? `${h}–${a}` : `${a}–${h}`
    }
    return isHome ? `${result.homeScore}–${result.awayScore}` : `${result.awayScore}–${result.homeScore}`
}

type PendingEntry = Omit<ChangeEntry, "cause">
export type CauseResolver = ChangeCause | ((entry: PendingEntry) => ChangeCause)

const EPS = 1e-6

/**
 * Entries for everything that moved between two snapshots of the same club.
 * Money is itemized from new ledger rows (cause from the row's category);
 * any budget movement no row explains is reported as "Unitemized change".
 */
export function diffClubs(before: ClubSnapshot | null, after: ClubSnapshot | null, cause: CauseResolver): ChangeEntry[] {
    if (!before || !after || before.teamId !== after.teamId) return []
    const out: ChangeEntry[] = []
    const resolve = (e: PendingEntry): ChangeCause => (typeof cause === "function" ? cause(e) : cause)
    const push = (e: PendingEntry, fixed?: ChangeCause) => out.push({ ...e, cause: fixed ?? resolve(e) })
    const teamId = after.teamId

    const beforePlayers = new Map(before.players.map(p => [p.id, p]))
    const afterIds = new Set(after.players.map(p => p.id))
    for (const p of after.players) {
        const b = beforePlayers.get(p.id)
        if (!b) {
            push({ kind: "contract", subjectId: p.id, label: "Joined the club", delta: 1 })
            continue
        }
        TRACKED_ATTRIBUTES.forEach((key, i) => {
            const d = p.a[i] - b.a[i]
            if (Math.abs(d) > EPS) push({ kind: "attribute", subjectId: p.id, label: ATTRIBUTE_LABEL[key], delta: round(d, 3) })
        })
        for (const kind of CONDITION_KINDS) {
            const d = p[kind] - b[kind]
            if (Math.abs(d) > EPS) push({ kind, subjectId: p.id, label: CONDITION_LABEL[kind], delta: round(d, 2) })
        }
        if (!b.injury && p.injury) push({ kind: "injury", subjectId: p.id, label: p.injury.name, delta: p.injury.weeks })
        else if (b.injury && !p.injury) push({ kind: "injury", subjectId: p.id, label: `Recovered from ${b.injury.name}`, delta: -b.injury.weeks })
        else if (b.injury && p.injury && b.injury.weeks !== p.injury.weeks) push({ kind: "injury", subjectId: p.id, label: p.injury.name, delta: p.injury.weeks - b.injury.weeks })
        const endBefore = before.contracts[p.id], endAfter = after.contracts[p.id]
        if (typeof endBefore === "number" && typeof endAfter === "number" && endAfter !== endBefore) {
            push({ kind: "contract", subjectId: p.id, label: endAfter > endBefore ? `Contract extended to week ${endAfter}` : `Contract now ends week ${endAfter}`, delta: endAfter - endBefore })
        }
    }
    for (const b of before.players) {
        if (!afterIds.has(b.id)) push({ kind: "contract", subjectId: b.id, label: "Left the club", delta: -1 })
    }

    // Money: new ledger rows itemized, then any unexplained remainder.
    const known = new Set(before.ledger.map(r => r.id))
    let itemized = 0
    for (const row of after.ledger) {
        if (known.has(row.id)) continue
        itemized += row.signed
        if (row.signed !== 0) push({ kind: "money", subjectId: teamId, label: row.description || "Ledger entry", delta: row.signed }, moneyCause(row.category, row.description))
    }
    const unexplained = Math.round(after.budget - before.budget - itemized)
    if (Math.abs(unexplained) >= 1) push({ kind: "money", subjectId: teamId, label: "Unitemized change", delta: unexplained })

    const club: Array<[ChangeKind, string, number, number]> = [
        ["reputation", "Reputation", before.reputation, after.reputation],
        ["chemistry", "Chemistry", before.chemistry, after.chemistry],
        ["ranking", "Elo", before.elo, after.elo],
    ]
    for (const [kind, label, from, to] of club) {
        const d = to - from
        if (Math.abs(d) > EPS) push({ kind, subjectId: teamId, label, delta: round(d, 2) })
    }
    if (before.worldRanking != null && after.worldRanking != null && before.worldRanking !== after.worldRanking) {
        push({ kind: "ranking", subjectId: teamId, label: "World rank", delta: after.worldRanking - before.worldRanking })
    }
    if (before.board != null && after.board != null && Math.abs(after.board - before.board) > EPS) {
        push({ kind: "board", subjectId: teamId, label: "Board confidence", delta: round(after.board - before.board, 2) })
    }
    return out
}

const entryKey = (e: ChangeEntry) => `${e.kind}|${e.subjectId}|${e.label}|${e.cause.type}|${e.cause.label}`

/** Sum entries that share subject, label and cause; drop ones that cancel out. */
export function mergeChanges(entries: ChangeEntry[]): ChangeEntry[] {
    const merged = new Map<string, ChangeEntry>()
    for (const e of entries) {
        const key = entryKey(e)
        const prev = merged.get(key)
        if (prev) prev.delta += e.delta
        else merged.set(key, { ...e, cause: { ...e.cause } })
    }
    return [...merged.values()]
        .map(e => ({ ...e, delta: e.kind === "money" ? Math.round(e.delta) : round(e.delta, 3) }))
        .filter(e => Math.abs(e.delta) > EPS || e.kind === "injury" || e.kind === "contract")
}

/**
 * Entries in `total` that `recorded` does not explain, keyed by kind, subject
 * and label. Used for the in-week segment: the baseline-to-advance diff minus
 * what the match/decision recorders already attributed.
 */
export function residualChanges(total: ChangeEntry[], recorded: ChangeEntry[]): ChangeEntry[] {
    const key = (e: ChangeEntry) => `${e.kind}|${e.subjectId}|${e.label}`
    const sums = new Map<string, number>()
    for (const e of recorded) sums.set(key(e), (sums.get(key(e)) ?? 0) + e.delta)
    const out: ChangeEntry[] = []
    for (const e of total) {
        const k = key(e)
        const explained = sums.get(k) ?? 0
        const rest = e.delta - explained
        sums.set(k, 0)
        if (e.kind === "injury" || e.kind === "contract") {
            if (explained === 0) out.push(e)
            continue
        }
        if (Math.abs(rest) > (e.kind === "money" ? 0.5 : 1e-3)) out.push({ ...e, delta: rest })
    }
    return out
}

/**
 * Accumulates entries across the steps of one week tick: `mark()` diffs the
 * club against the previous mark and attributes the movement to `cause`.
 */
export class WeekChangeRecorder {
    readonly entries: ChangeEntry[] = []
    private last: ClubSnapshot | null = null

    constructor(private readonly teamId: string) {}

    begin(source: ClubSource): void {
        this.last = this.teamId ? snapshotClub(source, this.teamId) : null
    }

    /** Snapshot now, record what moved since the previous mark, and continue from here. */
    mark(source: ClubSource, cause: CauseResolver): ClubSnapshot | null {
        if (!this.teamId) return null
        const now = snapshotClub(source, this.teamId)
        if (this.last && now) this.entries.push(...diffClubs(this.last, now, cause))
        this.last = now
        return now
    }

    /**
     * Like mark(), but `itemized` entries (already split by cause, e.g. the
     * board's weekly moves) replace the diff for their kind+label; any part of
     * the real movement they do not explain (clamping) is attributed to `cause`.
     */
    markItemized(source: ClubSource, itemized: ChangeEntry[], cause: CauseResolver): ClubSnapshot | null {
        if (!this.teamId) return null
        const now = snapshotClub(source, this.teamId)
        if (this.last && now) {
            const sums = new Map<string, number>()
            for (const e of itemized) sums.set(`${e.kind}|${e.label}`, (sums.get(`${e.kind}|${e.label}`) ?? 0) + e.delta)
            const rest: ChangeEntry[] = []
            const covered = new Set<string>()
            for (const e of diffClubs(this.last, now, cause)) {
                const key = `${e.kind}|${e.label}`
                if (!sums.has(key)) { rest.push(e); continue }
                covered.add(key)
                const residual = e.delta - (sums.get(key) ?? 0)
                if (Math.abs(residual) > 0.05) rest.push({ ...e, delta: round(residual, 2) })
            }
            // Itemized moves whose net cancelled out produce no diff entry; keep them anyway.
            this.entries.push(...itemized.filter(e => Math.abs(e.delta) > EPS), ...rest)
            // A value that did not exist before (e.g. the first board of a career) has no diff to reconcile.
            const comparable = this.last.board != null && now.board != null
            if (comparable) for (const [key, sum] of sums) if (!covered.has(key) && Math.abs(sum) > 0.05) {
                const [kind, label] = key.split("|")
                this.entries.push({ kind: kind as ChangeKind, subjectId: this.teamId, label, delta: round(-sum, 2), cause: { type: "other", label: "Capped at the limit" } })
            }
        }
        this.last = now
        return now
    }

    get snapshot(): ClubSnapshot | null { return this.last }

    result(): ChangeEntry[] { return mergeChanges(this.entries) }
}
