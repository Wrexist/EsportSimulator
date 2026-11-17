/**
 * "Continue to next decision" stop conditions (Phase 4 stream 4.1).
 *
 * Continue advances day by day (daily mode) or week by week until something
 * needs the manager. Each signal has a stable key: Continue stops once for a
 * key, says why, and passes it on the next press (the manager has seen it and
 * chose to go on). A playable match always blocks: the week cannot advance
 * past it, so Continue turns into "Play match".
 *
 * A queued moment (a title, promotion, signing: engine/moments.ts) blocks
 * like a match: Continue never advances past a moment the manager has not
 * seen; the moment shows itself and is dismissed from there (Phase 5.4a).
 *
 * Decisions and offers stop at most once per event, also across a reload:
 * the stop marks the event (`data.continueStopped`), and a refreshed repeat
 * keeps that mark. A request past its deadline never stops; the week tick
 * settles it with its stated default (engine/decision-deadlines.ts).
 *
 * MODES-09: a club's offer to the pro in a pro career blocks Continue like a
 * moment until it is answered (Skip week still lets it lapse to "stay").
 */

import { isPendingDecisionEvent, isTransferRumor, getEventTitle } from "@/lib/event-format"
import { fixtureBlockRef, pendingPlayableMatch, type PlayableMatchState } from "@/lib/playable-match"
import type { GameEventSaveData } from "@/engine/save-types"
import { momentHeadline, titleMomentFromCelebration, type Moment } from "@/engine/moments"
import { inboxHref } from "@/lib/navigation"
import { isTextRef, STORED_REF, t, tRef, type TextParam, type TextRef } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"
import { getEventSubject } from "@/components/inbox/inbox-model"

export type StopKind =
    | "moment" | "match" | "game-over" | "forfeit" | "injury" | "event" | "offer"
    | "contract" | "board" | "season" | "cap" | "cancelled" | "error"

export interface AdvanceStop {
    key: string
    kind: StopKind
    /** Why Continue stopped, e.g. "Celyx's contract ends in 2 weeks". */
    reason: string
    href?: string
    actionLabel?: string
    /**
     * The reason and action as translation keys (I18N-01): the notice reads
     * them in the language active when it is shown, so a language change
     * after the stop no longer leaves "Play X (BO1)" in the old language.
     * `reason` / `actionLabel` keep the text of the moment (tests, fallback).
     */
    reasonRef?: TextRef
    actionRef?: TextRef
}

/** A stop's reason in the active language. */
export function stopReasonText(stop: Pick<AdvanceStop, "reason" | "reasonRef">): string {
    return stop.reasonRef ? tRef(stop.reasonRef) : stop.reason
}

/** A stop's action link label in the active language, if it has one. */
export function stopActionText(stop: Pick<AdvanceStop, "actionLabel" | "actionRef">): string | undefined {
    return stop.actionRef ? tRef(stop.actionRef) : stop.actionLabel
}

const ref = (key: string, params?: Record<string, TextParam>, count?: number): TextRef =>
    ({ key, ...(params ? { params } : {}), ...(count !== undefined ? { count } : {}) })
/** English stored by older code (injury names, board titles), shown through lib/stored-text. */
const stored = (text: string): TextRef => ({ key: STORED_REF, params: { text } })

/** A stop whose reason and action label are kept as refs and as the text of the moment. */
export function makeStop(key: string, kind: StopKind, reasonRef: TextRef, href?: string, actionRef?: TextRef): AdvanceStop {
    return {
        key, kind, reason: tRef(reasonRef), reasonRef,
        ...(href !== undefined ? { href } : {}),
        ...(actionRef ? { actionLabel: tRef(actionRef), actionRef } : {}),
    }
}

/** A club's offer to the pro (engine/pro-career.ts processProWeek). */
const PRO_OFFER_PREFIX = "pro_offer_"

/** Stop after this many completed weeks with nothing needing the manager. */
export const CONTINUE_WEEK_CAP = 4

const PRIORITY: StopKind[] = ["moment", "match", "game-over", "forfeit", "injury", "event", "offer", "contract", "board", "season"]

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
    /** Full-screen moments waiting to be shown (Phase 5.4a). */
    momentQueue?: Moment[]
    /** Legacy title celebration (older saves), shown as a moment. */
    pendingCelebration?: Parameters<typeof titleMomentFromCelebration>[0]
}

/**
 * The moment the MomentHost shows next, if any: the queue in order, then a
 * legacy celebration; a season review always waits for everything else.
 */
export function nextMoment(state: Pick<StopSource, "momentQueue" | "pendingCelebration">): Moment | null {
    const queue = state.momentQueue ?? []
    return queue.find(m => m.kind !== "season-review") ?? titleMomentFromCelebration(state.pendingCelebration) ?? queue[0] ?? null
}

/**
 * A readable name for a decision event, the same subject line Home's
 * Decisions panel and the inbox show ("3-match win streak", not the event
 * type "Performance", HOME-03); some carry no title (fan and sponsor requests).
 */
function decisionLabel(e: GameEventSaveData, state: StopSource): TextParam {
    const data = (e.data ?? {}) as Record<string, unknown>
    const roster = new Set(state.teams.find(tm => tm.id === state.playerTeamId)?.rosterIds ?? [])
    const subject = getEventSubject(e, {
        currentWeek: state.currentWeek,
        playerTeamId: state.playerTeamId ?? null,
        rosterIds: roster,
        playerName: id => state.players.find(p => p.id === id)?.nickname,
    })
    // A title kept as a key follows a later language change (I18N-01).
    if (subject && isTextRef(data.titleRef) && subject === tRef(data.titleRef).trim()) return data.titleRef
    if (subject && subject !== t("ib.subj.notification")) return subject
    const title = getEventTitle(e)
    if (title !== "Notification") return stored(title)
    const type = String(e.type)
    if (type === "FAN") return ref("stop.fanRequest")
    if (type === "SPONSOR") return ref("stop.sponsorReview")
    const raw = [data.headline, data.description, data.message].find(v => typeof v === "string" && v.trim()) as string | undefined
    const text = raw ? storedText(raw) : undefined
    if (text) return text.length > 60 ? `${text.slice(0, 57)}…` : text
    return ref("stop.aDecision")
}

/** The press conference's topic, without the "Press conference:" prefix the stored title carries. */
function pressTopic(e: GameEventSaveData): TextParam {
    const titleRef = (e.data as { titleRef?: unknown } | undefined)?.titleRef
    const topic = isTextRef(titleRef) ? titleRef.params?.topic : undefined
    if (isTextRef(topic)) return topic
    const raw = getEventTitle(e).replace(/^Press conference:\s*/i, "")
    return stored(raw)
}

const money = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`

/**
 * Fixtures of the managed club this week that the store will resolve by
 * forfeit (a side can't field five). By default only fixtures already due
 * (daily mode: today or earlier); `wholeWeek` also counts the rest of the
 * week, for "Skip week", which plays them all (SQUAD-04).
 */
export function forfeitStops(state: StopSource, completed?: ReadonlySet<string>, options?: { wholeWeek?: boolean }): AdvanceStop[] {
    const me = state.playerTeamId
    if (!me) return []
    const done = completed ?? new Set(state.completedMatches.map(m => m.id))
    const teamName = (id: string): TextParam => state.teams.find(tm => tm.id === id)?.name ?? ref("stop.yourOpponent")
    const out: AdvanceStop[] = []
    for (const m of state.scheduledMatches) {
        if (m.week !== state.currentWeek || (m.homeTeamId !== me && m.awayTeamId !== me) || done.has(m.id)) continue
        if (!options?.wholeWeek && state.timeMode === "HYBRID_DAILY" && (m.day ?? 6) > (state.currentDay ?? 6)) continue
        const block = fixtureBlockRef(state, m)
        if (!block) continue
        const opp = m.homeTeamId === me ? m.awayTeamId : m.homeTeamId
        out.push(makeStop(`forfeit:${m.id}`, "forfeit", ref("stop.forfeit", { team: teamName(opp), reason: block }), "/transfers", ref("stop.findPlayer")))
    }
    return out
}

/** Every stop signal active in this state, highest priority first. */
export function collectStopSignals(state: StopSource): AdvanceStop[] {
    const out: AdvanceStop[] = []
    const me = state.playerTeamId
    if (!me) return out
    const teamName = (id: string): TextParam => state.teams.find(tm => tm.id === id)?.name ?? ref("stop.yourOpponent")
    const playerName = (id: string): TextParam => state.players.find(p => p.id === id)?.nickname ?? ref("stop.aPlayer")

    const moment = nextMoment(state)
    if (moment) out.push({ key: `moment:${moment.key}`, kind: "moment", reason: momentHeadline(moment), href: "/" })

    const completed = new Set(state.completedMatches.map(m => m.id))
    const playable = pendingPlayableMatch(state, completed, { respectDay: true })
    if (playable) {
        const opp = playable.homeTeamId === me ? playable.awayTeamId : playable.homeTeamId
        const reason = playable.format
            ? ref("stop.playFormat", { team: teamName(opp), format: String(playable.format).toUpperCase() })
            : ref("stop.play", { team: teamName(opp) })
        out.push(makeStop(`match:${playable.id}`, "match", reason, `/match/${playable.id}/tactics`, ref("stop.playMatch")))
    }

    // Phase 4.4: a dismissed manager is between clubs; Home lists the job offers.
    if (state.gameOverReason) out.push(makeStop(`game-over:${state.gameOverReason}`, "game-over", ref(state.gameOverReason === "SACKED" ? "stop.sacked" : state.gameOverReason === "UNEMPLOYED" ? "stop.unemployed" : "stop.folded"), "/"))

    // A due fixture the store will resolve by forfeit (a side can't field five).
    out.push(...forfeitStops(state, completed))

    const team = state.teams.find(tm => tm.id === me)
    const roster = new Set(team?.rosterIds ?? [])
    for (const p of state.players) {
        if (!roster.has(p.id) || !p.injury || p.isRetired) continue
        const weeks = p.injury.weeksRemaining ?? 0
        const reason = ref("stop.injured", { name: p.nickname ?? ref("stop.aPlayer"), injury: p.injury.name ? stored(p.injury.name) : ref("stop.injury") }, weeks)
        out.push(makeStop(`injury:${p.id}:${p.injury.name ?? ""}`, "injury", reason, `/player/${p.id}`, ref("stop.viewPlayer")))
    }

    for (const e of state.eventsLog) {
        if (e.week < state.currentWeek - 2) continue
        const data = (e.data ?? {}) as Record<string, unknown>
        const proOffer = e.id.startsWith(PRO_OFFER_PREFIX)
        if (data.isWithdrawn || (data.continueStopped && !proOffer)) continue
        const type = String(e.type)
        if (isPendingDecisionEvent(e)) {
            if (typeof data.deadlineWeek === "number" && data.deadlineWeek < state.currentWeek) continue
            // Phase 5.3: the press conference before a big match (answered on the match screen).
            if (e.id.startsWith("press_") && typeof data.matchId === "string") {
                out.push(makeStop(`event:${e.id}`, "event", ref("stop.press", { topic: pressTopic(e) }), `/match/${data.matchId}/tactics`, ref("stop.facePress")))
                continue
            }
            out.push(makeStop(`event:${e.id}`, "event", ref("stop.needsAnswer", { label: decisionLabel(e, state) }), "/", ref("stop.decide")))
            continue
        }
        const resolved = (e as unknown as { selectedChoiceId?: string }).selectedChoiceId !== undefined
        if (resolved) continue
        if (type === "TRANSFER_OFFER") {
            if (isTransferRumor(e)) continue
            // acceptTransferOffer treats currentWeek >= expiresWeek as expired.
            const expires = typeof data.expiresWeek === "number" ? data.expiresWeek : e.week + 2
            if (expires <= state.currentWeek) continue
            const club: TextParam = data.teamName != null ? String(data.teamName) : ref("stop.aClub")
            const player: TextParam = data.playerName != null ? String(data.playerName) : ref("stop.yourPlayer")
            const reason = typeof data.offerAmount === "number" ? ref("stop.bidAmount", { club, amount: money(data.offerAmount), player }) : ref("stop.bid", { club, player })
            out.push(makeStop(`offer:${e.id}`, "offer", reason, inboxHref("decisions"), ref("stop.reviewOffer")))
        } else if (type === "JOB_OFFER") {
            if (typeof data.deadlineWeek === "number" && data.deadlineWeek < state.currentWeek) continue
            const club = data.offeringTeamName ?? data.teamName
            const rank = typeof data.offeringTeamRank === "number" ? ` (#${data.offeringTeamRank})` : ""
            out.push(makeStop(`offer:${e.id}`, "offer", ref("stop.jobOffer", { club: club ? `${String(club)}${rank}` : ref("stop.anotherClub") }), inboxHref("decisions"), ref("stop.reviewOffer")))
        } else if (type === "CONTRACT" && data.action === "TRANSFER_OFFER") {
            const player = data.playerName != null ? String(data.playerName) : playerName(String(data.playerId ?? ""))
            out.push(makeStop(`offer:${e.id}`, "offer", ref("stop.transferOffer", { player }), inboxHref("decisions"), ref("stop.reviewOffer")))
        }
    }

    for (const c of state.contracts) {
        if (c.teamId !== me || !roster.has(c.playerId)) continue
        const left = c.endWeek - state.currentWeek
        if (left <= 0 || left > CONTRACT_STOP_WEEKS) continue
        out.push(makeStop(`contract:${c.playerId}:${c.endWeek}`, "contract", ref("stop.contract", { name: playerName(c.playerId) }, left), `/player/${c.playerId}`, ref("stop.renew")))
    }

    let seasonReviewed = false
    for (const n of state.newsFeed ?? []) {
        if (n.week < state.currentWeek - 1) continue
        if (!n.id.startsWith("board_pulse_") && !n.id.startsWith("board_review_")) continue
        if (n.id.startsWith("board_review_")) seasonReviewed = true
        out.push(makeStop(`board:${n.id}`, "board", ref(n.id.startsWith("board_review_") ? "stop.boardSeason" : "stop.board", { title: stored(n.title) }), "/", ref("stop.viewObjective")))
    }

    // Season end (the tick into week 52 runs promotion/relegation). The board's
    // season review already covers it when present.
    if (!seasonReviewed && state.currentWeek > 0 && state.currentWeek % 52 === 0 && (state.timeMode !== "HYBRID_DAILY" || (state.currentDay ?? 0) === 0)) {
        const season = state.currentWeek / 52
        out.push(makeStop(`season:${season}`, "season", ref("stop.seasonOver", { season }), "/", ref("stop.seasonReview")))
    }

    return out.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))
}

/** Event ids a stop's keys cover (decisions and offers), for `data.continueStopped`. */
export function stoppedEventIds(keys: readonly string[]): string[] {
    return keys.filter(k => k.startsWith("event:") || k.startsWith("offer:")).map(k => k.slice(k.indexOf(":") + 1))
}

/**
 * False once every decision or offer a stop names has been answered (or
 * withdrawn, or is gone): its "Decision waiting" notice no longer applies.
 * Other stops stay until dismissed or the next advance.
 */
export function advanceStopStillOpen(stop: Pick<AdvanceStop, "key" | "kind"> & { keys?: string[] }, eventsLog: readonly GameEventSaveData[]): boolean {
    if (stop.kind !== "event" && stop.kind !== "offer") return true
    const ids = stoppedEventIds(stop.keys?.length ? stop.keys : [stop.key])
    if (ids.length === 0) return true
    return ids.some(id => {
        const e = eventsLog.find(x => x.id === id) as (GameEventSaveData & { selectedChoiceId?: string }) | undefined
        return !!e && e.selectedChoiceId === undefined && !(e.data as Record<string, unknown> | undefined)?.isWithdrawn
    })
}

/** Several new items of one kind become one stop ("2 decisions need an answer"). */
const GROUPED: Partial<Record<StopKind, (n: number) => TextRef>> = {
    event: n => ref("stop.grp.event", undefined, n),
    offer: n => ref("stop.grp.offer", undefined, n),
    injury: n => ref("stop.grp.injury", undefined, n),
    contract: n => ref("stop.grp.contract", { weeks: CONTRACT_STOP_WEEKS }, n),
}

/**
 * The stop Continue should make now: a playable match always, else the first
 * signal not yet seen (with any other unseen signals of the same kind folded
 * in; `keys` lists every signal the stop covers).
 */
export function nextStop(state: StopSource, seen: ReadonlySet<string>): (AdvanceStop & { keys?: string[] }) | null {
    const signals = collectStopSignals(state)
    for (const s of signals) {
        if (s.kind === "moment" || s.kind === "game-over") return s
        if (s.key.startsWith(`event:${PRO_OFFER_PREFIX}`)) return s
        // Phase 5.3: a press conference stops Continue once, before its match.
        if (s.kind === "match") {
            const press = signals.find(x => x.key.startsWith("event:press_") && !seen.has(x.key))
            return press ?? s
        }
        if (seen.has(s.key)) continue
        const same = signals.filter(x => x.kind === s.kind && !seen.has(x.key))
        const group = GROUPED[s.kind]
        if (same.length > 1 && group) {
            const reasonRef = group(same.length)
            return { ...s, reason: tRef(reasonRef), reasonRef, keys: same.map(x => x.key) }
        }
        return s
    }
    return null
}
