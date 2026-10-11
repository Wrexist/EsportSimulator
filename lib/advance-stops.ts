/**
 * "Continue to next decision" stop conditions (Phase 4 stream 4.1).
 *
 * Continue advances day by day (daily mode) or week by week until something
 * needs the manager. Each signal has a stable key: Continue stops once for a
 * key, says why, and passes it on the next press (the manager has seen it and
 * chose to go on). A playable match always blocks: the week cannot advance
 * past it, so Continue turns into "Play match".
 */

import { isPendingDecisionEvent, getEventTitle } from "@/lib/event-format"
import { fixtureBlockReason, pendingPlayableMatch, type PlayableMatchState } from "@/lib/playable-match"
import type { GameEventSaveData } from "@/engine/save-types"
import { inboxHref } from "@/lib/navigation"

export type StopKind =
    | "match" | "game-over" | "forfeit" | "injury" | "event" | "offer"
    | "contract" | "board" | "season" | "cap" | "cancelled" | "error"

export interface AdvanceStop {
    key: string
    kind: StopKind
    /** Why Continue stopped, e.g. "Celyx's contract ends in 2 weeks". */
    reason: string
    href?: string
    actionLabel?: string
}

/** Stop after this many completed weeks with nothing needing the manager. */
export const CONTINUE_WEEK_CAP = 4

const PRIORITY: StopKind[] = ["match", "game-over", "forfeit", "injury", "event", "offer", "contract", "board", "season"]

/** How many weeks of contract left counts as "expiring" for a stop. */
export const CONTRACT_STOP_WEEKS = 2

type MatchLike = PlayableMatchState["scheduledMatches"][number] & { format?: string }

export interface StopSource extends PlayableMatchState<MatchLike> {
    completedMatches: Array<{ id: string }>
    contracts: Array<{ playerId: string; teamId: string; endWeek: number }>
    eventsLog: GameEventSaveData[]
    newsFeed?: Array<{ id: string; title: string; week: number }>
    gameOverReason?: string | null
    players: Array<{ id: string; nickname?: string; isRetired?: boolean; injury?: { name?: string; weeksRemaining?: number } | null }>
}

/** A readable name for a decision event; some carry no title (fan and sponsor requests). */
function decisionLabel(e: GameEventSaveData): string {
    const title = getEventTitle(e)
    if (title !== "Notification") return title
    const data = (e.data ?? {}) as Record<string, unknown>
    const type = String(e.type)
    if (type === "FAN") return "A fan meetup request"
    if (type === "SPONSOR") return "A sponsor review"
    const text = [data.headline, data.description, data.message].find(v => typeof v === "string" && v.trim()) as string | undefined
    if (text) return text.length > 60 ? `${text.slice(0, 57)}...` : text
    return "A decision"
}

const money = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`

/** Every stop signal active in this state, highest priority first. */
export function collectStopSignals(state: StopSource): AdvanceStop[] {
    const out: AdvanceStop[] = []
    const me = state.playerTeamId
    if (!me) return out
    const teamName = (id: string) => state.teams.find(t => t.id === id)?.name ?? "your opponent"
    const playerName = (id: string) => state.players.find(p => p.id === id)?.nickname ?? "A player"

    const completed = new Set(state.completedMatches.map(m => m.id))
    const playable = pendingPlayableMatch(state, completed, { respectDay: true })
    if (playable) {
        const opp = playable.homeTeamId === me ? playable.awayTeamId : playable.homeTeamId
        out.push({ key: `match:${playable.id}`, kind: "match", reason: `Play ${teamName(opp)}${playable.format ? ` (${playable.format})` : ""}`, href: `/match/${playable.id}/tactics`, actionLabel: "Play match" })
    }

    // Phase 4.4: a dismissed manager is between clubs; Home lists the job offers.
    if (state.gameOverReason) out.push({ key: `game-over:${state.gameOverReason}`, kind: "game-over", reason: state.gameOverReason === "SACKED" ? "You were dismissed: review your job offers" : "Your club folded: review your job offers", href: "/" })

    // A due fixture the store will resolve by forfeit (a side can't field five).
    for (const m of state.scheduledMatches) {
        if (m.week !== state.currentWeek || (m.homeTeamId !== me && m.awayTeamId !== me) || completed.has(m.id)) continue
        if (state.timeMode === "HYBRID_DAILY" && (m.day ?? 6) > (state.currentDay ?? 6)) continue
        const block = fixtureBlockReason(state, m)
        if (!block) continue
        const opp = m.homeTeamId === me ? m.awayTeamId : m.homeTeamId
        out.push({ key: `forfeit:${m.id}`, kind: "forfeit", reason: `Your match vs ${teamName(opp)} will be forfeited: ${block.split(".")[0].toLowerCase()}`, href: "/transfers", actionLabel: "Find a player" })
    }

    const team = state.teams.find(t => t.id === me)
    const roster = new Set(team?.rosterIds ?? [])
    for (const p of state.players) {
        if (!roster.has(p.id) || !p.injury || p.isRetired) continue
        const weeks = p.injury.weeksRemaining ?? 0
        out.push({ key: `injury:${p.id}:${p.injury.name ?? ""}`, kind: "injury", reason: `${p.nickname ?? "A player"} is injured (${p.injury.name ?? "injury"}, ${weeks} week${weeks === 1 ? "" : "s"})`, href: `/player/${p.id}`, actionLabel: "View player" })
    }

    for (const e of state.eventsLog) {
        if (e.week < state.currentWeek - 2) continue
        const data = (e.data ?? {}) as Record<string, unknown>
        if (data.isWithdrawn) continue
        const type = String(e.type)
        if (isPendingDecisionEvent(e)) {
            if (typeof data.deadlineWeek === "number" && data.deadlineWeek < state.currentWeek) continue
            out.push({ key: `event:${e.id}`, kind: "event", reason: `${decisionLabel(e)} needs an answer`, href: "/", actionLabel: "Decide" })
            continue
        }
        const resolved = (e as unknown as { selectedChoiceId?: string }).selectedChoiceId !== undefined
        if (resolved) continue
        if (type === "TRANSFER_OFFER") {
            const expires = typeof data.expiresWeek === "number" ? data.expiresWeek : e.week + 2
            if (expires < state.currentWeek) continue
            const amount = typeof data.offerAmount === "number" ? ` ${money(data.offerAmount)}` : ""
            out.push({ key: `offer:${e.id}`, kind: "offer", reason: `${String(data.teamName ?? "A club")} bid${amount} for ${String(data.playerName ?? "your player")}`, href: inboxHref("decisions"), actionLabel: "Review offer" })
        } else if (type === "JOB_OFFER") {
            if (typeof data.deadlineWeek === "number" && data.deadlineWeek < state.currentWeek) continue
            const club = data.offeringTeamName ?? data.teamName
            const rank = typeof data.offeringTeamRank === "number" ? ` (#${data.offeringTeamRank})` : ""
            out.push({ key: `offer:${e.id}`, kind: "offer", reason: `Job offer from ${club ? `${String(club)}${rank}` : "another club"}`, href: inboxHref("decisions"), actionLabel: "Review offer" })
        } else if (type === "CONTRACT" && data.action === "TRANSFER_OFFER") {
            out.push({ key: `offer:${e.id}`, kind: "offer", reason: `Transfer offer for ${String(data.playerName ?? playerName(String(data.playerId ?? "")))}`, href: inboxHref("decisions"), actionLabel: "Review offer" })
        }
    }

    for (const c of state.contracts) {
        if (c.teamId !== me || !roster.has(c.playerId)) continue
        const left = c.endWeek - state.currentWeek
        if (left <= 0 || left > CONTRACT_STOP_WEEKS) continue
        out.push({ key: `contract:${c.playerId}:${c.endWeek}`, kind: "contract", reason: `${playerName(c.playerId)}'s contract ends in ${left} week${left === 1 ? "" : "s"}`, href: `/player/${c.playerId}`, actionLabel: "Renew" })
    }

    let seasonReviewed = false
    for (const n of state.newsFeed ?? []) {
        if (n.week < state.currentWeek - 1) continue
        if (!n.id.startsWith("board_pulse_") && !n.id.startsWith("board_review_")) continue
        if (n.id.startsWith("board_review_")) seasonReviewed = true
        out.push({ key: `board:${n.id}`, kind: "board", reason: `Board ${n.id.startsWith("board_review_") ? "season review" : "review"}: ${n.title}`, href: "/", actionLabel: "View objective" })
    }

    // Season end (the tick into week 52 runs promotion/relegation). The board's
    // season review already covers it when present.
    if (!seasonReviewed && state.currentWeek > 0 && state.currentWeek % 52 === 0 && (state.timeMode !== "HYBRID_DAILY" || (state.currentDay ?? 0) === 0)) {
        const season = state.currentWeek / 52
        out.push({ key: `season:${season}`, kind: "season", reason: `Season ${season} is over`, href: "/", actionLabel: "Season review" })
    }

    return out.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
}

/** Several new items of one kind become one stop ("2 decisions need an answer"). */
const GROUPED: Partial<Record<StopKind, (n: number) => string>> = {
    event: n => `${n} decisions need an answer`,
    offer: n => `${n} offers need a response`,
    injury: n => `${n} players are injured`,
    contract: n => `${n} contracts end within ${CONTRACT_STOP_WEEKS} weeks`,
}

/**
 * The stop Continue should make now: a playable match always, else the first
 * signal not yet seen (with any other unseen signals of the same kind folded
 * in; `keys` lists every signal the stop covers).
 */
export function nextStop(state: StopSource, seen: ReadonlySet<string>): (AdvanceStop & { keys?: string[] }) | null {
    const signals = collectStopSignals(state)
    for (const s of signals) {
        if (s.kind === "match" || s.kind === "game-over") return s
        if (seen.has(s.key)) continue
        const same = signals.filter(x => x.kind === s.kind && !seen.has(x.key))
        const group = GROUPED[s.kind]
        if (same.length > 1 && group) return { ...s, reason: group(same.length), keys: same.map(x => x.key) }
        return s
    }
    return null
}
