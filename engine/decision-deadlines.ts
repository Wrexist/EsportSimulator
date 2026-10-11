/**
 * Decision deadlines (Phase 4.9).
 *
 * Every event that asks the manager for an answer carries a deadline and a
 * documented default, stated in the event itself ("If you don't answer by
 * Week 9, the club …"). When the deadline passes, the week processor applies
 * that default through the same effect code as a manual answer
 * (engine/event-choice.ts) and the weekly report lists it with the cause
 * "Unanswered: …".
 *
 * One open decision per family and subject: a new request of the same kind
 * refreshes the open one instead of stacking, and a family that was just
 * settled stays quiet for a few weeks (its cooldown). Situational requests
 * (fan meetups, sponsor reviews, interviews, equipment deals, streaks,
 * birthdays, an unhappy or exhausted player) are not raised while
 * MAX_OPEN_DECISIONS answers are already waiting.
 *
 * Engine safe: no store, no React. Deterministic: no RNG.
 */

import type { GameEventSaveData, GameSave } from "./save-types"
import { applyChoiceEffects, type ChoiceEffects, type ChoiceTarget } from "./event-choice"
import { isPendingDecisionEvent, isTransferRumor } from "@/lib/event-format"

export interface DecisionRule {
    /** Dedup and cooldown key, together with the subject. */
    family: string
    /** Report label: "Unanswered: Fan meetup request". */
    label: string
    /** Weeks to answer, counted from the week the request arrived. */
    window: number
    /** Weeks a settled family/subject stays quiet before a new request may open. */
    cooldown: number
    /** Choice applied when unanswered; null = the request lapses with no effect. */
    defaultChoiceId: string | null
    /** Completes "If you don't answer by Week N, the club …" ({name} = the player). */
    consequence: string
    /** Bids and job offers are per club; they never merge. */
    dedupe?: boolean
    /**
     * A situational request: not raised while MAX_OPEN_DECISIONS answers are
     * already waiting (a persisting situation asks again a later week).
     * Offers, the legend coach and the squad decisions are never held back.
     */
    deferrable?: boolean
}

/** Deferrable requests wait until fewer than this many decisions are open. */
export const MAX_OPEN_DECISIONS = 2

type EventLike = GameEventSaveData
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by type
type AnyData = Record<string, any>
const dataOf = (e: EventLike): AnyData => (e.data ?? {}) as AnyData

const rule = (r: DecisionRule): DecisionRule => r

/**
 * Known decision families, matched by id prefix (ids are stable across saves).
 * Defaults are the answer that costs nothing; where the request itself
 * carries a consequence (an ignored complaint), the default says so.
 */
const PREFIX_RULES: Array<[prefix: string, rule: DecisionRule]> = [
    ["fan_meet_", rule({ family: "fan_meet", label: "Fan meetup request", window: 1, cooldown: 4, defaultChoiceId: "ignore_fans", consequence: "skips the meetup and keeps the squad on practice", deferrable: true })],
    ["sponsor_review_", rule({ family: "sponsor_review", label: "Sponsor progress review", window: 1, cooldown: 4, defaultChoiceId: "status_quo", consequence: "sends the standard progress report", deferrable: true })],
    ["equipment_deal_", rule({ family: "equipment_deal", label: "Equipment deal", window: 1, cooldown: 4, defaultChoiceId: "decline_deal", consequence: "declines the deal", deferrable: true })],
    ["media_interview_", rule({ family: "media_interview", label: "Interview request", window: 1, cooldown: 4, defaultChoiceId: "decline", consequence: "declines the interview", deferrable: true })],
    ["morale_", rule({ family: "unhappy_player", label: "Unhappy player", window: 1, cooldown: 4, defaultChoiceId: "ignore", consequence: "leaves {name}'s complaint unanswered", deferrable: true })],
    ["birthday_", rule({ family: "birthday", label: "Birthday", window: 1, cooldown: 0, defaultChoiceId: "wish", consequence: "sends {name} its best wishes", deferrable: true })],
    ["fatigue_", rule({ family: "burnout", label: "Burnout warning", window: 1, cooldown: 4, defaultChoiceId: "push", consequence: "keeps {name} on the full training load", deferrable: true })],
    ["streak_win_", rule({ family: "win_streak", label: "Win streak", window: 1, cooldown: 0, defaultChoiceId: "focus", consequence: "tells the squad to stay focused", deferrable: true })],
    ["streak_loss_", rule({ family: "losing_run", label: "Losing run", window: 1, cooldown: 0, defaultChoiceId: "shakeup", consequence: "issues the standard roster shakeup warning", deferrable: true })],
    ["legend_coach_opportunity_", rule({ family: "legend_coach", label: "Legend coach offer", window: 2, cooldown: 0, defaultChoiceId: "decline", consequence: "declines the coaching offer" })],
    // Phase 5.2: a player's transfer request (engine/processors/dressing-room.ts
    // spaces them out and caps them per season itself).
    ["transfer_request_", rule({ family: "transfer_request", label: "Transfer request", window: 2, cooldown: 0, defaultChoiceId: "refuse", consequence: "refuses {name}'s transfer request (his morale and loyalty drop)" })],
]

/** Situation decisions (engine/career-decisions.ts) keep their two-week window and eight-week spacing. */
const CAREER_RULES: Record<string, DecisionRule> = {
    confidence: { family: "squad_decision", label: "Player support", window: 2, cooldown: 0, defaultChoiceId: "talk", consequence: "holds a private conversation with {name}" },
    recovery: { family: "squad_decision", label: "Player recovery", window: 2, cooldown: 0, defaultChoiceId: "talk", consequence: "settles for a check-in with {name}" },
    momentum: { family: "squad_decision", label: "Squad momentum", window: 2, cooldown: 0, defaultChoiceId: "praise", consequence: "praises the captain" },
}

const JOB_OFFER_RULE: DecisionRule = { family: "job_offer", label: "Job offer", window: 1, cooldown: 0, defaultChoiceId: null, consequence: "lets the offer lapse", dedupe: false }
const BID_RULE: DecisionRule = { family: "transfer_bid", label: "Transfer bid", window: 1, cooldown: 0, defaultChoiceId: null, consequence: "lets the bid lapse", dedupe: false }
/** Pre-4.9 contract talks ("Discuss renewal"): no longer created; old ones lapse. */
const LEGACY_CONTRACT_RULE: DecisionRule = { family: "contract_talk", label: "Contract talk", window: 1, cooldown: 0, defaultChoiceId: null, consequence: "drops the request" }

function fallbackRule(e: EventLike): DecisionRule {
    // Unknown decision: two weeks, and the first answer that costs nothing
    // and harms no one (else the first free one, else it lapses).
    const choices = e.choices ?? []
    const harmless = choices.find(c => !Object.values(c.effects ?? {}).some(v => typeof v === "number" && v < 0))
    const free = choices.find(c => !(typeof c.effects?.money === "number" && c.effects.money < 0))
    const pick = harmless ?? free ?? null
    const title = typeof dataOf(e).title === "string" ? String(dataOf(e).title) : "Decision"
    return {
        family: `other:${e.type}`,
        label: title,
        window: 2,
        cooldown: 0,
        defaultChoiceId: pick?.id ?? null,
        consequence: pick ? `goes with “${pick.text.replace(/\s*\([^()]*\)\s*$/, "")}”` : "lets it lapse",
    }
}

/** The rule for an event that asks for an answer, or null for anything else. */
export function decisionRuleFor(e: EventLike): DecisionRule | null {
    const type = String(e.type)
    if (type === "JOB_OFFER") return JOB_OFFER_RULE
    if (type === "TRANSFER_OFFER") return isTransferRumor(e) ? null : BID_RULE
    if (type === "CONTRACT" && dataOf(e).action === "TRANSFER_OFFER") return null
    if (!Array.isArray(e.choices) || e.choices.length === 0) return null
    if (e.id.startsWith("career_decision_")) {
        const key = e.id.slice(e.id.lastIndexOf("_") + 1)
        return CAREER_RULES[key] ?? fallbackRule(e)
    }
    if (type === "CONTRACT" && dataOf(e).action === "EXPIRING") return LEGACY_CONTRACT_RULE
    for (const [prefix, r] of PREFIX_RULES) if (e.id.startsWith(prefix)) return r
    return isPendingDecisionEvent(e) ? fallbackRule(e) : null
}

/** Still waiting on the manager (regardless of deadline). */
export function isOpenDecision(e: EventLike): boolean {
    if (e.selectedChoiceId !== undefined) return false
    const data = dataOf(e)
    if (data.isWithdrawn) return false
    const type = String(e.type)
    if (type === "JOB_OFFER") return true
    if (type === "TRANSFER_OFFER") return !isTransferRumor(e)
    return isPendingDecisionEvent(e)
}

/** Last week the manager can answer, or null if none is set. */
export function decisionDeadline(e: EventLike): number | null {
    const data = dataOf(e)
    if (String(e.type) === "TRANSFER_OFFER") {
        // acceptTransferOffer treats `currentWeek >= expiresWeek` as expired.
        const expires = typeof data.expiresWeek === "number" ? data.expiresWeek : e.week + 2
        return expires - 1
    }
    return typeof data.deadlineWeek === "number" && Number.isFinite(data.deadlineWeek) ? data.deadlineWeek : null
}

function subjectOf(e: EventLike): string {
    const data = dataOf(e)
    if (String(e.type) === "TRANSFER_OFFER") return `${data.teamId ?? ""}:${data.playerId ?? ""}`
    if (String(e.type) === "JOB_OFFER") return String(data.offeringTeamId ?? e.id)
    return data.playerId != null ? String(data.playerId) : "club"
}

interface NameSource { players: Array<{ id: string; nickname?: string }> }

function playerName(e: EventLike, save: NameSource): string | null {
    const id = dataOf(e).playerId
    if (id == null) return null
    return save.players.find(p => p.id === String(id))?.nickname || (typeof dataOf(e).playerName === "string" ? dataOf(e).playerName : null)
}

/** "If you don't answer by Week 9, the club skips the meetup …". */
export function unansweredNote(r: DecisionRule, deadline: number, name: string | null): string {
    return `If you don't answer by Week ${deadline}, the club ${r.consequence.replace("{name}", name ?? "the player")}.`
}

/** Report label for an unanswered decision: "Unhappy player (ace)". */
function reportLabel(r: DecisionRule, e: EventLike, save: NameSource): string {
    if (r === JOB_OFFER_RULE) return `Job offer from ${dataOf(e).offeringTeamName ?? "another club"}`
    if (r === BID_RULE) return `Bid for ${playerName(e, save) ?? "your player"}`
    const name = playerName(e, save)
    return name && r.consequence.includes("{name}") ? `${r.label} (${name})` : r.label
}

export interface NormalizeResult {
    /** Open requests that gained a deadline and default. */
    assigned: number
    /** Newer requests merged into the open one of the same family and subject. */
    refreshed: number
    /** New requests dropped because the family/subject was settled within its cooldown. */
    cooledDown: number
    /** New deferrable requests not raised because MAX_OPEN_DECISIONS were already waiting. */
    deferred: number
}

type DecisionSave = Pick<GameSave, "eventsLog" | "currentWeek" | "players">

/**
 * Give every open decision a deadline and default, merge same-family requests
 * into the oldest open one, and drop brand-new requests whose family/subject
 * was just settled (or deferrable ones while the desk is full). Idempotent.
 * Runs at the end of every week tick; on load with `arrivals: false` (older
 * saves have open requests without deadlines, and none of them is new).
 */
export function normalizeDecisions(save: DecisionSave, opts: { arrivals?: boolean } = {}): NormalizeResult {
    const result: NormalizeResult = { assigned: 0, refreshed: 0, cooledDown: 0, deferred: 0 }
    const log = save.eventsLog
    const order = new Map(log.map((e, i) => [e, i]))
    const arrivals = opts.arrivals !== false
    const isFresh = (e: EventLike) => arrivals && dataOf(e).ifUnanswered === undefined && e.week >= save.currentWeek
    // Requests already on the desk first, then new must-answer ones, then new
    // deferrable ones (which only open while fewer than MAX_OPEN_DECISIONS wait).
    const rank = (e: EventLike) => (!isFresh(e) ? 0 : decisionRuleFor(e)?.deferrable ? 2 : 1)
    const open = log.filter(isOpenDecision).sort((a, b) => rank(a) - rank(b) || a.week - b.week || order.get(a)! - order.get(b)!)
    let waiting = 0
    const remove = new Set<EventLike>()

    // Settled weeks per family/subject, for cooldowns.
    const settled = new Map<string, number>()
    for (const e of log) {
        if (isOpenDecision(e)) continue
        const r = decisionRuleFor(e)
        if (!r || r.cooldown <= 0) continue
        const data = dataOf(e)
        const week = typeof data.resolvedWeek === "number" ? data.resolvedWeek : e.week
        const key = `${r.family}|${subjectOf(e)}`
        settled.set(key, Math.max(settled.get(key) ?? -Infinity, week))
    }

    const canonical = new Map<string, EventLike>()
    for (const e of open) {
        const r = decisionRuleFor(e)
        if (!r) continue
        const key = `${r.family}|${subjectOf(e)}`
        const data = dataOf(e)
        const fresh = isFresh(e)
        if (fresh && r.cooldown > 0 && save.currentWeek - (settled.get(key) ?? -Infinity) < r.cooldown) {
            remove.add(e)
            result.cooledDown++
            continue
        }
        if (r.dedupe !== false) {
            const keep = canonical.get(key)
            if (keep) {
                // Refresh the open request with the newer one's content; its
                // deadline, default and "Continue already stopped" flag stay.
                const kept = dataOf(keep)
                const preserved = {
                    deadlineWeek: kept.deadlineWeek, defaultChoiceId: kept.defaultChoiceId,
                    ifUnanswered: kept.ifUnanswered, continueStopped: kept.continueStopped,
                }
                keep.data = { ...data, ...Object.fromEntries(Object.entries(preserved).filter(([, v]) => v !== undefined)), refreshedWeek: e.week }
                if (e.choices) keep.choices = e.choices
                remove.add(e)
                result.refreshed++
                continue
            }
            if (fresh && r.deferrable && waiting >= MAX_OPEN_DECISIONS) {
                remove.add(e)
                result.deferred++
                continue
            }
            canonical.set(key, e)
        }
        waiting++
        if (data.ifUnanswered === undefined) {
            let deadline = decisionDeadline(e)
            if (deadline == null) {
                deadline = Math.max(e.week + r.window, save.currentWeek + 1)
                data.deadlineWeek = deadline
            }
            const defaultChoiceId = r.defaultChoiceId && e.choices?.some(c => c.id === r.defaultChoiceId) ? r.defaultChoiceId : null
            data.defaultChoiceId = defaultChoiceId
            data.ifUnanswered = unansweredNote(defaultChoiceId || !r.defaultChoiceId ? r : { ...r, consequence: "lets it lapse" }, deadline, playerName(e, save))
            if (!e.data) e.data = data
            result.assigned++
        }
    }
    if (remove.size) save.eventsLog = log.filter(e => !remove.has(e))
    return result
}

export interface ExpiredDecision {
    eventId: string
    /** "Fan meetup request", "Unhappy player (ace)". */
    label: string
    /** The default applied ("Focus purely on practice (Morale +2)") or "Lapsed". */
    outcome: string
    /** True when the default's effects were applied. */
    applied: boolean
}

type ExpirySave = DecisionSave & ChoiceTarget & Pick<GameSave, "acknowledgedEventIds">

/**
 * Settle every open decision whose deadline has passed: apply its stated
 * default (same effects as answering by hand), or let it lapse when it has
 * none or the default can no longer apply (the player left, the club can't
 * pay). `each` runs after each one so the caller can attribute the change.
 */
export function expireDecisions(save: ExpirySave, each?: (expired: ExpiredDecision) => void): ExpiredDecision[] {
    const out: ExpiredDecision[] = []
    const roster = new Set(save.teams.find(t => t.id === save.playerTeamId)?.rosterIds ?? [])
    for (const e of [...save.eventsLog]) {
        if (!isOpenDecision(e)) continue
        const deadline = decisionDeadline(e)
        if (deadline == null || save.currentWeek <= deadline) continue
        const r = decisionRuleFor(e)
        const data = dataOf(e)
        const label = r ? reportLabel(r, e, save) : String(data.title ?? e.type)
        const choiceId: string | null = typeof data.defaultChoiceId === "string" ? data.defaultChoiceId : data.defaultChoiceId === null ? null : r?.defaultChoiceId ?? null
        const choice = choiceId ? e.choices?.find(c => c.id === choiceId) : undefined
        const type = String(e.type)
        // Same guards as resolveEventChoice: a player who left, or another
        // club's event, can no longer be answered for.
        const answerable = type !== "JOB_OFFER" && type !== "TRANSFER_OFFER"
            && !(data.playerId != null && !roster.has(String(data.playerId)))
            && !(typeof data.teamId === "string" && data.teamId !== save.playerTeamId)
        const applied = !!choice && answerable && applyChoiceEffects(save, e, choice.effects as ChoiceEffects, {
            id: () => `fin_unanswered_${e.id}`,
            description: `Unanswered: ${label}`,
        })
        e.selectedChoiceId = applied && choice ? choice.id : "expired"
        const outcome = applied && choice ? choice.text : "Lapsed"
        e.data = { ...data, resolvedWeek: save.currentWeek, unanswered: { week: save.currentWeek, label, outcome } }
        e.acknowledged = true
        if (!save.acknowledgedEventIds.includes(e.id)) save.acknowledgedEventIds.push(e.id)
        const expired = { eventId: e.id, label, outcome, applied }
        out.push(expired)
        each?.(expired)
    }
    return out
}
