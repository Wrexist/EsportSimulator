/**
 * Inbox drawer model (Phase 4.3) — pure: no React, no store.
 *
 * The inbox is a view over three store collections:
 *   - `eventsLog`  → messages addressed to the manager, decisions (events that
 *                    still need an answer) and wire news about other clubs;
 *   - `newsFeed`   → narrative headlines;
 *   - `socialFeed` → the social timeline (read-only; folded into News).
 *
 * Effect labels are derived from what the store actually applies
 * (`resolveEventChoice`, `acceptTransferOffer`, `JobOfferGenerator`), never
 * from the choice's marketing text — the Phase 0 truth rule.
 */

import type { GameEventSaveData, SocialPost } from "@/engine/save-types"
import type { InboxTab } from "@/lib/navigation"
import { getEventTitle, isPendingDecisionEvent } from "@/lib/event-format"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"

export type InboxKind = "decision" | "message" | "news"
export type DecisionKind = "choice" | "job_offer" | "transfer_offer"
export type InboxSource = "event" | "news" | "social"

/** Wire stories about the wider scene, not addressed to the manager. */
const NEWS_EVENT_TYPES = new Set(["AI_SIGNING", "AI_TRANSFER", "ROSTER_UPDATE", "TRANSFER_WINDOW", "RETIREMENT"])

export interface InboxContext {
    currentWeek: number
    playerTeamId: string | null
    /** Roster of the managed club — a player decision is only answerable for these. */
    rosterIds: ReadonlySet<string>
    playerName: (id: string) => string | undefined
}

export interface NewsFeedLike {
    id: string
    title: string
    content: string
    week: number
    category?: string
}

export interface InboxItem {
    /** Unique across sources (`news:` / `social:` prefixes for non-events). */
    key: string
    source: InboxSource
    kind: InboxKind
    decision: DecisionKind | null
    week: number
    unread: boolean
    sender: string
    subject: string
    preview: string
    event?: GameEventSaveData
    news?: NewsFeedLike
    social?: SocialPost
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by event type
type AnyData = Record<string, any>
const dataOf = (event: GameEventSaveData): AnyData => (event.data ?? {}) as AnyData
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** The week an offer/decision stops being answerable, if it has one. */
export function answerByWeek(event: GameEventSaveData): number | null {
    const data = dataOf(event)
    if (event.type === "TRANSFER_OFFER") {
        // acceptTransferOffer treats `currentWeek >= expiresWeek` as expired.
        const expires = num(data.expiresWeek) ?? event.week + 2
        return expires - 1
    }
    return num(data.deadlineWeek)
}

/**
 * What still needs an answer. Mirrors the guards in the store actions so the
 * inbox never offers a button that would silently do nothing.
 */
export function getDecisionKind(event: GameEventSaveData, ctx: InboxContext): DecisionKind | null {
    if (event.selectedChoiceId !== undefined) return null
    const data = dataOf(event)
    if (data.isWithdrawn) return null
    const deadline = answerByWeek(event)
    if (deadline != null && ctx.currentWeek > deadline) return null

    if (event.type === "JOB_OFFER") {
        if (data.originTeamId && data.originTeamId !== ctx.playerTeamId) return null
        return "job_offer"
    }
    if (event.type === "TRANSFER_OFFER") {
        if (data.playerId && !ctx.rosterIds.has(String(data.playerId))) return null
        return "transfer_offer"
    }
    if (!isPendingDecisionEvent(event)) return null
    if (data.playerId && !ctx.rosterIds.has(String(data.playerId))) return null
    if (data.teamId && data.teamId !== ctx.playerTeamId) return null
    return "choice"
}

export function getInboxKind(event: GameEventSaveData, ctx: InboxContext): InboxKind {
    if (getDecisionKind(event, ctx)) return "decision"
    return NEWS_EVENT_TYPES.has(event.type as string) ? "news" : "message"
}

// ─── Copy ─────────────────────────────────────────────────────────────────

function playerLabel(data: AnyData, ctx: InboxContext): string {
    const id = data.playerId != null ? String(data.playerId) : ""
    return (id && ctx.playerName(id)) || data.playerName || "A player"
}

/** Who the message is from — a person or department, not an event type. */
export function getEventSender(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    switch (event.type as string) {
        case "CONTRACT": return "Contracts office"
        case "MORALE": return data.playerId ? playerLabel(data, ctx) : "Dressing room"
        case "INJURY":
        case "RECOVERY": return "Medical team"
        case "FINANCE":
        case "BUDGET_WARNING": return "Finance director"
        case "win_streak":
        case "loss_streak": return "Assistant coach"
        case "TRANSFER_OFFER": return data.teamName || "Transfer office"
        case "JOB_OFFER": return data.offeringTeamName || "Club board"
        case "CAREER_UPDATE": return "Club board"
        case "TOURNAMENT":
        case "TOURNAMENT_UPDATE": return data.tournamentName || "Tournament office"
        case "MEDIA": return data.outlet || (data.proAwards ? "Pro awards" : "Press office")
        case "FAN": return "Fan club"
        case "SPONSOR":
        case "SPONSOR_OFFER": return data.brand || "Commercial team"
        case "TRAINING_START":
        case "TRAINING_COMPLETE":
        case "TRAINING_CANCEL":
        case "PLAYER_LEVEL_UP": return "Training staff"
        case "STAFF_LEVEL_UP": return "Staff"
        case "TEAM_UPDATE": return "Team manager"
        case "SCOUTING_COMPLETE": return "Scouting department"
        case "MILESTONE": return "Club records"
        case "AI_SIGNING":
        case "AI_TRANSFER":
        case "ROSTER_UPDATE":
        case "TRANSFER_WINDOW": return "Transfer wire"
        case "RETIREMENT": return "Esports wire"
        default: return "Club office"
    }
}

/** A specific subject line ("ace's contract ends in 3 weeks"), not just the type. */
export function getEventSubject(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    const who = playerLabel(data, ctx)
    switch (event.type as string) {
        case "CONTRACT":
            return num(data.weeksLeft) != null ? `${who}'s contract ends in ${data.weeksLeft} week${data.weeksLeft === 1 ? "" : "s"}` : data.title || `${who}'s contract`
        case "MORALE": return data.title || `${who} is unhappy`
        case "INJURY":
            if (data.fatigue) return `${who} is close to burnout`
            if (event.id.startsWith("recovery_")) return `${who} is fit again`
            return num(data.weeksOut) != null ? `${who} out for ${data.weeksOut} week${data.weeksOut === 1 ? "" : "s"}` : `${who} injured`
        case "win_streak": return `${data.streak ?? 3}-match win streak`
        case "loss_streak": return `${data.streak ?? 3}-match losing run`
        case "TRANSFER_OFFER":
            return num(data.offerAmount) != null ? `Bid for ${who}: ${formatCurrency(data.offerAmount, "$", false)}` : `Bid for ${who}`
        case "JOB_OFFER": return `${data.offeringTeamName || "A club"} want you as manager`
        case "FAN": return data.title || "Fans want a meetup"
        case "SPONSOR": return data.title || "Sponsor progress review"
        case "AI_SIGNING": return `${data.teamName || "A club"} sign ${data.playerName || "a free agent"}`
        case "AI_TRANSFER": return `${data.playerName || "A player"} joins ${data.toTeamName || "a new club"}`
        case "RETIREMENT": return `${who} retires`
        case "MEDIA":
            if (data.proAwards?.year != null) return `Pro Top 20 of ${data.proAwards.year}`
            return data.title || "Media update"
        default: {
            const title = data.title || getEventTitle(event)
            return stripEmoji(String(title)).trim() || "Notification"
        }
    }
}

/** Plain-text body of an event message. */
export function getEventBody(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    const who = playerLabel(data, ctx)
    switch (event.type as string) {
        case "CONTRACT":
            if (num(data.weeksLeft) != null) return `${who}'s contract runs out in ${data.weeksLeft} week${data.weeksLeft === 1 ? "" : "s"}. Offer new terms on the player's page, or plan for their departure.`
            return data.message || data.description || "Contract update."
        case "MORALE":
            if (num(data.morale) != null) return `${who} is unhappy (morale ${Math.round(data.morale)}%).${data.reason && data.reason !== "Player unhappy" ? ` Reason: ${data.reason}.` : ""}`
            return data.message || `${who} is unhappy.`
        case "INJURY":
            if (data.fatigue) return `${who} is exhausted (fatigue ${Math.round(data.fatigue)}). Pushing on raises the injury risk.`
            return data.message || data.description || `${who} is injured${data.weeksOut ? ` and out for ${data.weeksOut} week${data.weeksOut === 1 ? "" : "s"}` : ""}.`
        case "FAN": return data.message || "Fans are asking to see more of the team. Pick how the club responds."
        case "SPONSOR": {
            const n = num(data.currentSponsors)
            return data.message || `Your sponsors want a progress review${n != null ? ` (${n} active deal${n === 1 ? "" : "s"})` : ""}. Pick how to handle it.`
        }
        case "win_streak": return `The team has won ${data.streak ?? 3} in a row.`
        case "loss_streak": return `The team has lost ${data.streak ?? 3} in a row.`
        case "TRANSFER_OFFER": {
            const fee = num(data.offerAmount) != null ? formatCurrency(data.offerAmount, "$", false) : "an undisclosed fee"
            return `${data.teamName || "A club"} has bid ${fee} for ${who}.`
        }
        case "JOB_OFFER": {
            const where = [data.offeringTeamRegion, data.offeringTeamRank ? `world #${data.offeringTeamRank}` : null].filter(Boolean).join(", ")
            const deadline = num(data.deadlineWeek)
            return `${data.offeringTeamName || "A club"}${where ? ` (${where})` : ""} want you as their manager.${deadline != null ? ` The offer stands until the end of week ${deadline}.` : ""}`
        }
        case "AI_SIGNING": return `${data.teamName || "A club"} has signed ${data.playerName || "a player"} from the free-agent pool.`
        case "AI_TRANSFER": return `${data.toTeamName || "A club"} has signed ${data.playerName || "a player"}${data.fromTeamName ? ` from ${data.fromTeamName}` : ""}${num(data.fee) != null ? ` for ${formatCurrency(data.fee, "$", false)}` : " for an undisclosed fee"}.`
        case "RETIREMENT": return data.message || `${who} has retired from professional play.`
        case "MEDIA":
            if (data.proAwards) {
                const top = data.proAwards.top20?.[0]?.nickname
                const ours = (data.proAwards.top20 ?? []).filter((p: AnyData) => p.isPlayerTeam).length
                return `${top ? `${top} is the world's #1.` : "The world's best players have been ranked."}${ours > 0 ? ` ${ours} of your players made the Top 20.` : ""}`
            }
            return data.message || data.text || data.description || "Media update."
        default:
            return data.message || data.content || data.text || data.description || "No further details."
    }
}

// ─── Message body formatting ─────────────────────────────────────────────

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu
export function stripEmoji(text: string): string {
    return text.replace(EMOJI, "")
}

export type BodyBlock =
    | { kind: "heading"; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "list"; items: string[] }

/**
 * Long-form messages (the welcome mail) use "EMOJI HEADING\n• bullet" text.
 * Turn that into headings, paragraphs and lists, without the emoji.
 */
export function parseMessageBody(text: string): BodyBlock[] {
    const blocks: BodyBlock[] = []
    for (const chunk of stripEmoji(text).split(/\n\s*\n/)) {
        const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean)
        if (lines.length === 0) continue
        let i = 0
        // A short all-caps first line is a section heading.
        if (lines[0].length <= 32 && /[A-Z]/.test(lines[0]) && lines[0] === lines[0].toUpperCase()) {
            blocks.push({ kind: "heading", text: lines[0] })
            i = 1
        }
        let para: string[] = []
        let list: string[] = []
        const flushPara = () => { if (para.length) { blocks.push({ kind: "paragraph", text: para.join(" ") }); para = [] } }
        const flushList = () => { if (list.length) { blocks.push({ kind: "list", items: list }); list = [] } }
        for (; i < lines.length; i++) {
            const bullet = lines[i].match(/^[•\-*]\s*(.+)$/)
            if (bullet) { flushPara(); list.push(bullet[1]) } else { flushList(); para.push(lines[i]) }
        }
        flushPara()
        flushList()
    }
    return blocks
}

// ─── Effect labels ───────────────────────────────────────────────────────

export type EffectTone = "positive" | "negative" | "neutral"
export interface EffectChip { label: string; tone: EffectTone }
export interface ChoiceOutcome { chips: EffectChip[]; blockedReason?: string }

export interface ChoiceLike {
    id: string
    text: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose runtime bundle (fatigue/chemistry are not in the save type)
    effects?: Record<string, any>
}

// Same sign glyphs as formatSignedCurrency so money and stat chips read alike.
const signed = (n: number) => `${n > 0 ? "+" : "-"}${Math.abs(n)}`
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Labels for a choice resolved through `resolveEventChoice`. Mirrors that
 * function: player-scoped stats hit the event's player, otherwise the whole
 * roster; fatigue clamps to ±10 and chemistry to ±5; an unaffordable cost
 * is refused (so the button is disabled with the reason).
 */
export function describeChoice(event: GameEventSaveData, choice: ChoiceLike, budget: number): ChoiceOutcome {
    const data = dataOf(event)
    if (event.id.startsWith("legend_coach_opportunity_") && choice.id === "hire") {
        const cost = num(data.salaryCost) ?? 15000
        return {
            chips: [
                { label: `${formatSignedCurrency(-cost, "$", false)} now`, tone: "negative" },
                { label: `${formatCurrency(cost, "$", false)}/wk wages`, tone: "negative" },
                { label: "+10 chemistry", tone: "positive" },
                { label: "+5 reputation", tone: "positive" },
                { label: "Replaces your coach", tone: "neutral" },
            ],
            blockedReason: budget < cost ? `Needs ${formatCurrency(cost, "$", false)} up front` : undefined,
        }
    }

    const fx = choice.effects ?? {}
    const squad = !data.playerId
    const scope = squad ? " (squad)" : ""
    const chips: EffectChip[] = []
    let blockedReason: string | undefined
    const money = num(fx.money)
    if (money) {
        chips.push({ label: formatSignedCurrency(money, "$", false), tone: money > 0 ? "positive" : "negative" })
        if (money < 0 && budget < -money) blockedReason = "Not enough funds"
    }
    const morale = num(fx.morale)
    if (morale) chips.push({ label: `${signed(morale)} morale${scope}`, tone: morale > 0 ? "positive" : "negative" })
    const loyalty = num(fx.loyalty)
    if (loyalty) chips.push({ label: `${signed(loyalty)} loyalty${scope}`, tone: loyalty > 0 ? "positive" : "negative" })
    const fatigue = num(fx.fatigue) != null ? clamp(fx.fatigue, -10, 10) : 0
    if (fatigue) chips.push({ label: `${signed(fatigue)} fatigue${scope}`, tone: fatigue < 0 ? "positive" : "negative" })
    const chemistry = num(fx.chemistry) != null ? clamp(fx.chemistry, -5, 5) : 0
    if (chemistry) chips.push({ label: `${signed(chemistry)} chemistry`, tone: chemistry > 0 ? "positive" : "negative" })
    const reputation = num(fx.reputation)
    if (reputation) chips.push({ label: `${signed(reputation)} reputation`, tone: reputation > 0 ? "positive" : "negative" })
    if (chips.length === 0) chips.push({ label: "No effect", tone: "neutral" })
    return { chips, blockedReason }
}

const EFFECT_TOKEN = String.raw`(?:[+-]?\$[\d,.]+k?|[a-z]+ [+-]\d+|free)`
const EFFECT_SUFFIX = new RegExp(String.raw`:\s*${EFFECT_TOKEN}(?:\s*,\s*${EFFECT_TOKEN})*\s*$`, "i")

/**
 * The choice text without its inline effect note — "Throw a Party (-$1k,
 * Morale +10)" or "Support session: $500, morale +8" — because the chips
 * state the effect the store really applies.
 */
export function choiceLabel(choice: ChoiceLike): string {
    const trimmed = choice.text.replace(/\s*\([^()]*\)\s*$/, "").replace(EFFECT_SUFFIX, "").trim()
    return trimmed || choice.text
}

// ─── Assembly & counts ───────────────────────────────────────────────────

function sortNewestFirst(a: InboxItem, b: InboxItem): number {
    return b.week - a.week
}

export interface InboxSources {
    eventsLog: readonly GameEventSaveData[]
    newsFeed?: readonly NewsFeedLike[]
    socialFeed?: readonly SocialPost[]
}

export function eventToItem(event: GameEventSaveData, ctx: InboxContext): InboxItem {
    const decision = getDecisionKind(event, ctx)
    return {
        key: event.id,
        source: "event",
        kind: decision ? "decision" : getInboxKind(event, ctx),
        decision,
        week: event.week,
        unread: !event.acknowledged,
        sender: getEventSender(event, ctx),
        subject: getEventSubject(event, ctx),
        preview: getEventBody(event, ctx).split("\n")[0],
        event,
    }
}

/** Every inbox item, newest first. Decisions are not pinned here — see `itemsForTab`. */
export function buildInboxItems(sources: InboxSources, ctx: InboxContext): InboxItem[] {
    const items: InboxItem[] = sources.eventsLog.map(e => eventToItem(e, ctx))
    for (const n of sources.newsFeed ?? []) {
        items.push({ key: `news:${n.id}`, source: "news", kind: "news", decision: null, week: n.week, unread: false, sender: "Esports wire", subject: n.title, preview: n.content, news: n })
    }
    for (const p of sources.socialFeed ?? []) {
        items.push({ key: `social:${p.id}`, source: "social", kind: "news", decision: null, week: p.week, unread: false, sender: p.user?.handle || p.user?.name || "Social", subject: p.user?.name || "Social post", preview: p.content, social: p })
    }
    return items.sort(sortNewestFirst)
}

/** Items shown on a tab. All pins open decisions first; Messages also keeps answered decisions as history. */
export function itemsForTab(items: readonly InboxItem[], tab: InboxTab): InboxItem[] {
    switch (tab) {
        case "decisions": return items.filter(i => i.kind === "decision")
        case "messages": return items.filter(i => i.kind === "message")
        case "news": return items.filter(i => i.kind === "news")
        default: return [...items.filter(i => i.kind === "decision"), ...items.filter(i => i.kind !== "decision")]
    }
}

export interface InboxCounts {
    /** Events still waiting on an answer (read or not). */
    decisions: number
    /** Unread messages addressed to the manager (not decisions, not wire news). */
    unreadMessages: number
    unreadNews: number
}

export function countInbox(eventsLog: readonly GameEventSaveData[], ctx: InboxContext): InboxCounts {
    const counts: InboxCounts = { decisions: 0, unreadMessages: 0, unreadNews: 0 }
    for (const event of eventsLog) {
        const kind = getInboxKind(event, ctx)
        if (kind === "decision") counts.decisions++
        else if (!event.acknowledged) {
            if (kind === "news") counts.unreadNews++
            else counts.unreadMessages++
        }
    }
    return counts
}

/** Top-bar badge: what needs the manager — open decisions plus unread messages. */
export function inboxBadgeCount(counts: InboxCounts): number {
    return counts.decisions + counts.unreadMessages
}

export function weekLabel(week: number, currentWeek: number): string {
    if (week === currentWeek) return "This week"
    if (week === currentWeek - 1) return "Last week"
    return `Week ${week}`
}
