/**
 * Moments (Phase 5 stream 5.4a): the big beats of a career shown full-screen
 * one at a time: a title, a league division title, a promotion or
 * relegation, a signing, the new-career welcome, and (5.4b) the season
 * review that opens the next season.
 *
 * A moment is queued where the fact is decided (the week processor for
 * titles and tier moves, the store for a grand final won on the result
 * screen, a signing or a new career). The queue is saved with the career,
 * so a moment survives a reload; it is drained one at a time by the
 * MomentHost and deduped by key: a key that is queued or already delivered
 * (`seenMomentKeys`) is never queued again, so no moment fires twice.
 *
 * Every number a moment carries is the engine's own (prize booked or the
 * exact share the week tick will pay, reputation, follower gain, the next
 * tier's payments). The UI states nothing else.
 *
 * The season review always comes last: a moment decided while a review
 * waits is queued in front of it, so titles and tier moves are told first.
 */

export type MomentKind = "title" | "league-title" | "promotion" | "relegation" | "signing" | "welcome" | "season-review"

interface MomentBase {
    /** Stable dedupe key, e.g. `title:<tournamentId>`. */
    key: string
    kind: MomentKind
    /** Week the moment was decided. */
    week: number
}

/** A tournament won by the managed club. */
export interface TitleMoment extends MomentBase {
    kind: "title"
    tournamentId: string
    tournamentName: string
    tier: string
    /** S-tier (major): the full-scale moment. */
    major: boolean
    /** The champion's prize (its share of the pool). */
    prize: number
    /** True when the PRIZE ledger entry is booked; false: paid when the week ends. */
    prizeBooked: boolean
    /** Legacy payloads carried the event's whole prize pool instead of the share. */
    prizeIsPool?: boolean
    /** Reputation the title adds (after the 100 cap). */
    repGain: number
    /** Followers gained; only known once the week tick has granted the title. */
    fanGain?: number
    /** The deciding match (grand final) when the title was won on the result screen. */
    matchId?: string
    finalOpponentName?: string
    /** Final series score from the champion's side, e.g. "2-1". */
    finalScore?: string
    finalStage?: string
    logoPath?: string
}

/** A regional league division won by the managed club. */
export interface LeagueTitleMoment extends MomentBase {
    kind: "league-title"
    divisionId: string
    divisionName: string
    level: number
    season: number
    split: number
    wins: number
    losses: number
    points: number
    /** Split prize paid for first place (booked). */
    prize: number
    repGain: number
    /** Top division titles are added to the trophy cabinet. */
    trophy: boolean
}

/** Promotion or relegation: between league divisions (split end) or world tiers (season end). */
export interface TierMoveMoment extends MomentBase {
    kind: "promotion" | "relegation"
    scope: "division" | "world"
    season: number
    split?: number
    fromLabel: string
    toLabel: string
    /** Division moves: the club's league payment per week, before and after. */
    centralPayment?: { from: number; to: number }
    /** Division moves: the split prize pool, before and after. */
    prizePool?: { from: number; to: number }
    /** Division moves into the top division: its champion is added to the trophy cabinet. */
    topDivision?: boolean
    /** World moves: final world ranking and the new tier's rank band. */
    worldRank?: number
    band?: string
    /** World moves: league-entry events that require the new / the old tier. */
    eligibleNow?: string[]
    eligibleLost?: string[]
}

/** The manager's hand-drawn signature: SVG path data in a w x h box. */
export interface SigningSignature {
    d: string
    w: number
    h: number
}

/** A player signed by the manager (transfer or free agent; not a renewal). */
export interface SigningMoment extends MomentBase {
    kind: "signing"
    playerId: string
    fee: number
    salaryPerWeek: number
    contractEndWeek: number
    /** Selling club; null for a free agent. */
    fromTeamName: string | null
    /** Overall rating when signed. */
    rating: number
    /** Rating 85+ (the game's "blockbuster" rule): the bigger reveal. */
    big: boolean
    /** Market standing when signed (engine/transfer-hype.ts); absent for most players. */
    standing?: "ICON" | "STAR" | "WONDERKID"
    /** AI clubs that were in the race for him (up to three) and how many there were. */
    rivalNames?: string[]
    rivalCount?: number
    /** Best-five OVR of the manager's squad before and after the deal. */
    squad?: { before: number; after: number }
    /** The signature the manager drew on the contract. */
    signature?: SigningSignature
}

/** The board brief after a new career is created. */
export interface WelcomeMoment extends MomentBase {
    kind: "welcome"
    teamId: string
}

/**
 * The closed season told full-screen (Phase 5.4b): the club's season, the
 * awards, the team of the season, records and the story. Carries only the
 * season; the screen reads its stored honours (engine/season-review.ts).
 */
export interface SeasonReviewMoment extends MomentBase {
    kind: "season-review"
    season: number
    /** Managed club when the season closed. */
    teamId: string
}

export type Moment = TitleMoment | LeagueTitleMoment | TierMoveMoment | SigningMoment | WelcomeMoment | SeasonReviewMoment

const MOMENT_KINDS: readonly MomentKind[] = ["title", "league-title", "promotion", "relegation", "signing", "welcome", "season-review"]

/** Dedupe key of a season's review: one per season. */
export const seasonReviewKey = (season: number) => `season-review:${season}`

/** The review of a closed season (queued by the week tick that closes it). */
export function seasonReviewMoment(season: number, week: number, teamId: string): SeasonReviewMoment {
    return { key: seasonReviewKey(season), kind: "season-review", week, season, teamId }
}

/** Anything that carries a moment queue: the save, the store, a draft. */
export interface MomentHolder {
    momentQueue?: Moment[]
    seenMomentKeys?: string[]
}

/** Delivered keys kept (oldest dropped first). */
export const SEEN_MOMENT_KEYS_CAP = 200
/** Queued moments kept (a guard; a queue drains one moment per view). */
export const MOMENT_QUEUE_CAP = 12

/** Has this key been queued or delivered? */
export function hasMomentKey(holder: MomentHolder, key: string): boolean {
    return !!holder.momentQueue?.some(m => m.key === key) || !!holder.seenMomentKeys?.includes(key)
}

/** Record a delivered key (a shown moment, a played intro, an offered legend pick). */
export function markMomentKey(holder: MomentHolder, key: string): void {
    const seen = holder.seenMomentKeys ?? (holder.seenMomentKeys = [])
    if (seen.includes(key)) return
    seen.push(key)
    if (seen.length > SEEN_MOMENT_KEYS_CAP) seen.splice(0, seen.length - SEEN_MOMENT_KEYS_CAP)
}

/**
 * Queue a moment unless its key is queued or delivered. FIFO: moments show
 * in the order they were decided. Returns true when it was added.
 */
export function queueMoment(holder: MomentHolder, moment: Moment): boolean {
    if (!moment.key || hasMomentKey(holder, moment.key)) return false
    const queue = holder.momentQueue ?? (holder.momentQueue = [])
    // A waiting season review stays last: anything else goes in front of it.
    const review = moment.kind === "season-review" ? -1 : queue.findIndex(m => m.kind === "season-review")
    if (review >= 0) queue.splice(review, 0, moment)
    else queue.push(moment)
    if (queue.length > MOMENT_QUEUE_CAP) {
        // Drop the oldest beyond the cap, but remember them as delivered so a
        // re-run of the deciding code does not queue them again.
        for (const dropped of queue.splice(0, queue.length - MOMENT_QUEUE_CAP)) markMomentKey(holder, dropped.key)
    }
    return true
}

/** Remove a moment from the queue and record it as delivered. */
export function dismissMoment(holder: MomentHolder, key: string): void {
    if (holder.momentQueue) {
        const index = holder.momentQueue.findIndex(m => m.key === key)
        if (index >= 0) holder.momentQueue.splice(index, 1)
    }
    markMomentKey(holder, key)
}

/** A sanitized queue from untrusted save data (older saves have none). */
export function restoreMomentQueue(raw: unknown): Moment[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: Moment[] = []
    for (const m of raw) {
        if (!m || typeof m !== "object") continue
        const { key, kind } = m as { key?: unknown; kind?: unknown }
        if (typeof key !== "string" || !key || seen.has(key) || !MOMENT_KINDS.includes(kind as MomentKind)) continue
        seen.add(key)
        out.push(m as Moment)
    }
    return out.slice(-MOMENT_QUEUE_CAP)
}

/** A sanitized delivered-key list from untrusted save data. */
export function restoreSeenMomentKeys(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return [...new Set(raw.filter((k): k is string => typeof k === "string" && k.length > 0))].slice(-SEEN_MOMENT_KEYS_CAP)
}

/** One line for the moment (Continue's stop reason, screen readers). */
export function momentHeadline(m: Moment): string {
    switch (m.kind) {
        case "title": return `Champions: ${m.tournamentName}`
        case "league-title": return `${m.divisionName} champions`
        case "promotion": return `Promoted to ${m.toLabel}`
        case "relegation": return `Relegated to ${m.toLabel}`
        case "signing": return "New signing"
        case "welcome": return "Board brief"
        case "season-review": return `Season ${m.season} review`
    }
}

/** Legacy `pendingCelebration` (older saves, debug) as a title moment. */
export function titleMomentFromCelebration(c: {
    tournamentId?: string; tournamentName?: string; tier?: string; prize?: number; repGain?: number; fanGain?: number; week?: number; logoPath?: string
} | null | undefined): TitleMoment | null {
    if (!c || typeof c.tournamentName !== "string" || !c.tournamentName) return null
    const tier = typeof c.tier === "string" ? c.tier : "B_TIER"
    return {
        key: `title:${c.tournamentId ?? c.tournamentName}`,
        kind: "title",
        week: typeof c.week === "number" ? c.week : 0,
        tournamentId: c.tournamentId ?? c.tournamentName,
        tournamentName: c.tournamentName,
        tier,
        major: tier === "S_TIER",
        // The legacy payload carried the event's whole pool, not the share.
        prize: typeof c.prize === "number" ? c.prize : 0,
        prizeBooked: false,
        prizeIsPool: true,
        repGain: typeof c.repGain === "number" ? c.repGain : 0,
        fanGain: typeof c.fanGain === "number" ? c.fanGain : undefined,
        logoPath: c.logoPath,
    }
}
