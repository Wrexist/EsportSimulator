/**
 * Inbox drawer model (Phase 4.3) — pure: no React, no store.
 *
 * The inbox is a view over three store collections:
 *   - `eventsLog`  → messages addressed to the manager, decisions (events that
 *                    still need an answer) and wire news about other clubs;
 *   - `newsFeed`   → narrative headlines;
 *   - `socialFeed` → the social timeline (read-only; folded into News).
 *
 * Low-value notices are folded into one weekly round-up (lib/inbox-digest.ts):
 * the folded events stay in the log, hidden here, and are listed inside the
 * digest message. Every open decision states its deadline and the default
 * the club applies if it goes unanswered (engine/decision-deadlines.ts).
 *
 * Effect labels are derived from what the store actually applies
 * (`resolveEventChoice`, `acceptTransferOffer`, `JobOfferGenerator`), never
 * from the choice's marketing text — the Phase 0 truth rule.
 */

import type { GameEventSaveData, PromiseKind, SocialPost } from "@/engine/save-types"
import { PROMISE_LABEL, promiseWindow } from "@/engine/personality"
import type { InboxTab } from "@/lib/navigation"
import { getEventTitle, isPendingDecisionEvent, isTransferRumor } from "@/lib/event-format"
import { DIGEST_TYPE, digestItems, type DigestItem } from "@/lib/inbox-digest"
import { formatCurrency, formatSignedCurrency } from "@/lib/utils-extended"
import { PERSONALITY_TUNING, STORY_TUNING } from "@/lib/balance-tuning"
import { intlLocale, isTextRef, t, tn, tRef } from "@/lib/i18n"

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
        // A rumour carries no bid: nothing to accept.
        if (isTransferRumor(event)) return null
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
    return NEWS_EVENT_TYPES.has(event.type as string) || isWireStory(event, ctx) ? "news" : "message"
}

/**
 * Stories about other clubs that older saves still hold as events: another
 * club's injuries and trophies, transfer rumours. Wire news, not mail.
 */
function isWireStory(event: GameEventSaveData, ctx: InboxContext): boolean {
    const data = dataOf(event)
    if (isTransferRumor(event)) return true
    if (event.type === "INJURY" && data.playerId && !data.fatigue && !ctx.rosterIds.has(String(data.playerId))) return true
    if (event.type === "MEDIA" && event.id.startsWith("trophy_") && data.teamId && data.teamId !== ctx.playerTeamId) return true
    return false
}

/** Folded into a weekly round-up: listed inside the digest, not on its own. */
export function isFolded(event: GameEventSaveData): boolean {
    return !!dataOf(event).digestId
}

// ─── Copy ─────────────────────────────────────────────────────────────────

function playerLabel(data: AnyData, ctx: InboxContext): string {
    const id = data.playerId != null ? String(data.playerId) : ""
    return (id && ctx.playerName(id)) || data.playerName || t("ib.aPlayer")
}

/** Who the message is from — a person or department, not an event type. */
export function getEventSender(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    switch (event.type as string) {
        case "CONTRACT": return t("ib.from.contracts")
        case "MORALE": return data.playerId ? playerLabel(data, ctx) : t("ib.from.dressingRoom")
        case "INJURY":
        case "RECOVERY": return t("ib.from.medical")
        case "FINANCE":
        case "BUDGET_WARNING": return t("ib.from.finance")
        case "win_streak":
        case "loss_streak": return t("ib.from.assistantCoach")
        case "TRANSFER_OFFER": return data.teamName || t("ib.from.transferOffice")
        case "JOB_OFFER": return data.offeringTeamName || t("ib.from.board")
        case "CAREER_UPDATE": return t("ib.from.board")
        case "TOURNAMENT":
        case "TOURNAMENT_UPDATE": return data.tournamentName || t("ib.from.tournamentOffice")
        case "MEDIA": return data.outlet || (data.proAwards ? t("ib.from.proAwards") : t("ib.from.press"))
        case "FAN": return t("ib.from.fanClub")
        case "PRESS": return t("ib.from.press")
        case "STORYLINE":
            switch (data.storyKind) {
                case "CONTRACT_STANDOFF": return t("ib.from.agent", { name: playerLabel(data, ctx) })
                case "LAST_DANCE": return playerLabel(data, ctx)
                case "RIFT": return t("ib.from.dressingRoom")
                case "SLUMP":
                case "RISING_STAR": return t("ib.from.assistantManager")
                default: return t("ib.from.clubOffice")
            }
        case "SPONSOR":
        case "SPONSOR_OFFER": return data.brand || t("ib.from.commercial")
        case "TRAINING_START":
        case "TRAINING_COMPLETE":
        case "TRAINING_CANCEL":
        case "PLAYER_LEVEL_UP": return t("ib.from.training")
        case "STAFF_LEVEL_UP": return t("ib.from.staff")
        case "TEAM_UPDATE": return t("ib.from.teamManager")
        case "SCOUTING_COMPLETE":
        case "MARKET_ALERT": return t("ib.from.scouting")
        case "STAFF_REPORT": return t("ib.from.assistantManager")
        case "MILESTONE": return t("ib.from.records")
        case "AI_SIGNING":
        case "AI_TRANSFER":
        case "ROSTER_UPDATE":
        case "TRANSFER_WINDOW": return t("ib.from.transferWire")
        case "RETIREMENT": return t("ib.from.esportsWire")
        case DIGEST_TYPE: return t("ib.from.assistantManager")
        default: return t("ib.from.clubOffice")
    }
}

/** A specific subject line ("ace's contract ends in 3 weeks"), not just the type. */
export function getEventSubject(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    const who = playerLabel(data, ctx)
    switch (event.type as string) {
        case "CONTRACT":
            return num(data.weeksLeft) != null ? tn("ib.subj.contractEnds", data.weeksLeft, { name: who }) : data.title || t("ib.subj.contract", { name: who })
        case "MORALE": return data.title || t("ib.subj.unhappy", { name: who })
        case "INJURY":
            if (data.title && (event.id.startsWith("workload_") || event.id.startsWith("knock_"))) return stripEmoji(String(data.title)).trim()
            if (data.fatigue) return t("ib.subj.burnout", { name: who })
            if (event.id.startsWith("recovery_")) return t("ib.subj.fit", { name: who })
            return num(data.weeksOut) != null ? tn("ib.subj.out", data.weeksOut, { name: who }) : t("ib.subj.injured", { name: who })
        case "win_streak": return t("ib.subj.winStreak", { n: data.streak ?? 3 })
        case "loss_streak": return t("ib.subj.lossStreak", { n: data.streak ?? 3 })
        case "TRANSFER_OFFER":
            return num(data.offerAmount) != null ? t("ib.subj.bidAmount", { name: who, amount: formatCurrency(data.offerAmount, "$", false) }) : t("ib.subj.bid", { name: who })
        case "JOB_OFFER": return t("ib.subj.jobOffer", { club: data.offeringTeamName || t("ib.aClub") })
        case "FAN": return data.title || t("ib.subj.fans")
        case "SPONSOR": return data.title || t("ib.subj.sponsor")
        case "AI_SIGNING": return t("ib.subj.aiSigning", { club: data.teamName || t("ib.aClub"), name: data.playerName || t("ib.aFreeAgent") })
        case "AI_TRANSFER": return t("ib.subj.aiTransfer", { name: data.playerName || t("ib.aPlayer"), club: data.toTeamName || t("ib.aNewClub") })
        case "RETIREMENT": return t("ib.subj.retires", { name: who })
        case "MEDIA":
            if (data.proAwards?.year != null) return (typeof data.proAwards.minMaps === "number" ? t("ib.subj.proTop20Season", { n: data.proAwards.year }) : t("ib.subj.proTop20Year", { n: data.proAwards.year }))
            return data.title || t("ib.subj.media")
        case DIGEST_TYPE: {
            const items = digestItems(event)
            const weeks = [...new Set(items.map(i => i.week))].sort((a, b) => a - b)
            const span = weeks.length > 1 ? t("ib.weeksSpan", { from: weeks[0], to: weeks[weeks.length - 1] }) : weeks.length ? t("ib.weekOne", { n: weeks[0] }) : ""
            return span ? tn("ib.subj.digestSpan", items.length, { span }) : tn("ib.subj.digest", items.length)
        }
        default: {
            const title = isTextRef(data.titleRef) ? tRef(data.titleRef) : data.title || getEventTitle(event)
            return stripEmoji(String(title)).trim() || t("ib.subj.notification")
        }
    }
}

/**
 * Plain-text body of an event message. An open decision ends with what the
 * club does if it goes unanswered ("If you don't answer by Week 9, ...").
 */
export function getEventBody(event: GameEventSaveData, ctx: InboxContext): string {
    const body = eventBodyText(event, ctx)
    const note = dataOf(event).ifUnanswered
    return typeof note === "string" && event.selectedChoiceId === undefined && !dataOf(event).isWithdrawn ? `${body}\n\n${note}` : body
}

/** One line per folded notice. */
export function digestLine(item: DigestItem, ctx: InboxContext): string {
    const d = item.data as AnyData
    const text = (v: unknown) => (typeof v === "string" ? stripEmoji(v).trim() : "")
    const asEvent = (): GameEventSaveData => ({ id: item.id, type: item.type, week: item.week, data: d, acknowledged: true })
    switch (item.type) {
        case "PLAYER_LEVEL_UP": {
            if (text(d.message)) return text(d.message)
            const name = d.playerName || playerLabel(d, ctx)
            return num(d.breakthroughPotential) != null
                ? t("ib.digest.levelPotential", { name, level: d.newLevel ?? "?", potential: d.breakthroughPotential })
                : t("ib.digest.level", { name, level: d.newLevel ?? "?" })
        }
        case "STAFF_LEVEL_UP": return t("ib.digest.level", { name: d.staffName || t("ib.aStaffMember"), level: d.newLevel ?? "?" })
        case "FAN": return text(d.title) || text(d.message) || t("ib.digest.fan")
        case "INJURY": return getEventSubject(asEvent(), ctx)
        default: {
            const line = text(d.description) || text(d.message) || text(d.title) || getEventSubject(asEvent(), ctx)
            return line.length > 160 ? `${line.slice(0, 157)}...` : line
        }
    }
}

function eventBodyText(event: GameEventSaveData, ctx: InboxContext): string {
    const data = dataOf(event)
    const who = playerLabel(data, ctx)
    switch (event.type as string) {
        case "CONTRACT":
            if (num(data.weeksLeft) != null) return tn("ib.body.contractEnds", data.weeksLeft, { name: who })
            return data.message || data.description || t("ib.body.contract")
        case "MORALE":
            if (num(data.morale) != null) {
                const base = t("ib.body.unhappyMorale", { name: who, morale: Math.round(data.morale) })
                return data.reason && data.reason !== "Player unhappy" ? `${base} ${t("ib.body.reason", { reason: data.reason })}` : base
            }
            return data.message || t("ib.body.unhappy", { name: who })
        case "INJURY":
            if (data.fatigue) return t("ib.body.exhausted", { name: who, fatigue: Math.round(data.fatigue) })
            return data.message || data.description || (data.weeksOut ? tn("ib.body.injuredOut", data.weeksOut, { name: who }) : t("ib.body.injured", { name: who }))
        case "FAN": return data.message || t("ib.body.fans")
        case "SPONSOR": {
            const n = num(data.currentSponsors)
            return data.message || (n != null ? tn("ib.body.sponsorDeals", n) : t("ib.body.sponsor"))
        }
        case "win_streak": return t("ib.body.winStreak", { n: data.streak ?? 3 })
        case "loss_streak": return t("ib.body.lossStreak", { n: data.streak ?? 3 })
        case "TRANSFER_OFFER": {
            const club = data.teamName || t("ib.aClub")
            return num(data.offerAmount) != null
                ? t("ib.body.bid", { club, amount: formatCurrency(data.offerAmount, "$", false), name: who })
                : t("ib.body.bidUndisclosed", { club, name: who })
        }
        case "JOB_OFFER": {
            const where = [data.offeringTeamRegion, data.offeringTeamRank ? t("ib.worldRank", { rank: data.offeringTeamRank }) : null].filter(Boolean).join(", ")
            const deadline = num(data.deadlineWeek)
            const club = data.offeringTeamName || t("ib.aClub")
            const head = where ? t("ib.body.jobWhere", { club, where }) : t("ib.body.job", { club })
            return deadline != null ? `${head} ${t("ib.body.jobDeadline", { week: deadline })}` : head
        }
        case "AI_SIGNING": return t("ib.body.aiSigning", { club: data.teamName || t("ib.aClub"), name: data.playerName || t("ib.aPlayerLower") })
        case "AI_TRANSFER": {
            const vars = { club: data.toTeamName || t("ib.aClub"), name: data.playerName || t("ib.aPlayerLower"), from: data.fromTeamName ?? "", fee: num(data.fee) != null ? formatCurrency(data.fee, "$", false) : "" }
            const key = data.fromTeamName ? (vars.fee ? "ib.body.aiTransferFromFee" : "ib.body.aiTransferFrom") : (vars.fee ? "ib.body.aiTransferFee" : "ib.body.aiTransfer")
            return t(key, vars)
        }
        case "RETIREMENT": return data.message || t("ib.body.retired", { name: who })
        case DIGEST_TYPE: {
            const items = digestItems(event)
            if (items.length === 0) return t("ib.body.nothingNew")
            const blocks: string[] = [t("ib.body.digestIntro")]
            for (const week of [...new Set(items.map(i => i.week))]) {
                blocks.push([t("ib.body.digestWeek", { n: week }).toUpperCase(), ...items.filter(i => i.week === week).map(i => `• ${digestLine(i, ctx)}`)].join("\n"))
            }
            return blocks.join("\n\n")
        }
        case "MEDIA":
            if (data.proAwards) {
                const top = data.proAwards.top20?.[0]?.nickname
                const ours = (data.proAwards.top20 ?? []).filter((p: AnyData) => p.isPlayerTeam).length
                const lead = top ? t("ib.body.worldNumberOne", { name: top }) : t("ib.body.ranked")
                return ours > 0 ? `${lead} ${tn("ib.body.oursTop20", ours)}` : lead
            }
            return data.message || data.text || data.description || t("ib.body.media")
        default:
            if (isTextRef(data.messageRef)) return tRef(data.messageRef)
            return data.message || data.content || data.text || data.description || t("ib.body.noDetails")
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
        if (lines[0].length <= 32 && /\p{Lu}/u.test(lines[0]) && lines[0] === lines[0].toUpperCase()) {
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
                { label: t("ib.fx.now", { amount: formatSignedCurrency(-cost, "$", false) }), tone: "negative" },
                { label: t("ib.fx.wages", { amount: formatCurrency(cost, "$", false) }), tone: "negative" },
                { label: t("ib.fx.chemistry", { n: "+10" }), tone: "positive" },
                { label: t("ib.fx.reputation", { n: "+5" }), tone: "positive" },
                { label: t("ib.fx.replacesCoach"), tone: "neutral" },
            ],
            blockedReason: budget < cost ? t("ib.fx.needsUpFront", { amount: formatCurrency(cost, "$", false) }) : undefined,
        }
    }

    const fx = choice.effects ?? {}
    const squad = !data.playerId
    const scoped = (key: string, n: string) => squad ? t(`${key}Squad`, { n }) : t(key, { n })
    const chips: EffectChip[] = []
    let blockedReason: string | undefined
    const money = num(fx.money)
    if (money) {
        chips.push({ label: formatSignedCurrency(money, "$", false), tone: money > 0 ? "positive" : "negative" })
        if (money < 0 && budget < -money) blockedReason = t("ib.fx.noFunds")
    }
    const morale = num(fx.morale)
    if (morale) chips.push({ label: scoped("ib.fx.morale", signed(morale)), tone: morale > 0 ? "positive" : "negative" })
    const loyalty = num(fx.loyalty)
    if (loyalty) chips.push({ label: scoped("ib.fx.loyalty", signed(loyalty)), tone: loyalty > 0 ? "positive" : "negative" })
    const fatigue = num(fx.fatigue) != null ? clamp(fx.fatigue, -10, 10) : 0
    if (fatigue) chips.push({ label: scoped("ib.fx.fatigue", signed(fatigue)), tone: fatigue < 0 ? "positive" : "negative" })
    const chemistry = num(fx.chemistry) != null ? clamp(fx.chemistry, -5, 5) : 0
    if (chemistry) chips.push({ label: t("ib.fx.chemistry", { n: signed(chemistry) }), tone: chemistry > 0 ? "positive" : "negative" })
    const reputation = num(fx.reputation)
    if (reputation) chips.push({ label: t("ib.fx.reputation", { n: signed(reputation) }), tone: reputation > 0 ? "positive" : "negative" })
    // Phase 5.2 (engine/event-choice.ts): transfer list, promise.
    if (fx.transferList) chips.push({ label: t("ib.fx.transferListed"), tone: "neutral" })
    if (fx.promise === "START" || fx.promise === "COMPETE") {
        const kind = fx.promise as PromiseKind
        chips.push({ label: t("ib.fx.promise", { promise: PROMISE_LABEL[kind].promise, weeks: promiseWindow(kind) }), tone: "neutral" })
    }
    // Phase 5.3 (engine/event-choice.ts): named players, board, fans, renewal, bench, retirement, mentor.
    for (const p of Array.isArray(fx.players) ? fx.players : []) {
        const who = typeof p?.name === "string" ? p.name : t("ib.playerLower")
        const m = num(p?.morale), l = num(p?.loyalty)
        if (m) chips.push({ label: t("ib.fx.moraleWho", { n: signed(m), name: who }), tone: m > 0 ? "positive" : "negative" })
        if (l) chips.push({ label: t("ib.fx.loyaltyWho", { n: signed(l), name: who }), tone: l > 0 ? "positive" : "negative" })
    }
    const board = num(fx.board)
    if (board) chips.push({ label: t("ib.fx.board", { n: signed(board) }), tone: board > 0 ? "positive" : "negative" })
    const fans = num(fx.fans)
    if (fans) chips.push({ label: t("ib.fx.fans", { n: `${fans > 0 ? "+" : "-"}${Math.abs(fans).toLocaleString(intlLocale())}` }), tone: fans > 0 ? "positive" : "negative" })
    const renew = fx.renew as { salary?: unknown; weeks?: unknown; current?: unknown } | undefined
    if (renew && num(renew.salary) && num(renew.weeks)) {
        chips.push({ label: t("ib.fx.newDeal", { wage: formatCurrency(renew.salary as number, "$", false), weeks: renew.weeks as number }), tone: "neutral" })
        const raise = Math.max(0, (renew.salary as number) - (num(renew.current) ?? 0)) * STORY_TUNING.STANDOFF_RUNWAY_WEEKS
        if (num(renew.current) != null && budget < raise) blockedReason = t("ib.fx.needsInBank", { amount: formatCurrency(raise, "$", false) })
    }
    if (fx.bench) chips.push({ label: t("ib.fx.bench"), tone: "negative" })
    const persuade = fx.persuade as { from?: unknown; to?: unknown } | undefined
    if (persuade && num(persuade.from) != null && num(persuade.to) != null) chips.push({ label: t("ib.fx.retireChance", { from: persuade.from as number, to: persuade.to as number }), tone: "positive" })
    const mentor = fx.mentor as { name?: unknown } | undefined
    if (mentor) chips.push({ label: t("ib.fx.mentor", { name: typeof mentor.name === "string" ? mentor.name : t("ib.aTeammate"), pct: Math.round((PERSONALITY_TUNING.MENTOR_TRAINING - 1) * 100) }), tone: "positive" })
    // C5 (engine/workload.ts): rest week, play through a knock.
    const rest = fx.rest as { fatigue?: unknown; morale?: unknown } | undefined
    if (rest && num(rest.fatigue)) {
        chips.push({ label: t("ib.fx.fatigue", { n: `-${Math.abs(rest.fatigue as number)}` }), tone: "positive" })
        if (num(rest.morale)) chips.push({ label: t("ib.fx.morale", { n: signed(rest.morale as number) }), tone: "positive" })
        chips.push({ label: t("ib.fx.sitsOut"), tone: "neutral" })
    }
    const through = fx.playThrough as { escalateChance?: unknown; form?: unknown } | undefined
    if (through && num(through.escalateChance) != null) {
        chips.push({ label: t("ib.fx.backNext"), tone: "positive" })
        if (num(through.form)) chips.push({ label: t("ib.fx.form", { n: signed(through.form as number) }), tone: "negative" })
        chips.push({ label: t("ib.fx.worsens", { pct: Math.round((through.escalateChance as number) * 100) }), tone: "negative" })
    }
    if (typeof fx.follows === "string" && fx.follows) chips.push({ label: fx.follows, tone: "neutral" })
    if (chips.length === 0) chips.push({ label: t("ib.fx.none"), tone: "neutral" })
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
    const items: InboxItem[] = sources.eventsLog.filter(e => !isFolded(e)).map(e => eventToItem(e, ctx))
    for (const n of sources.newsFeed ?? []) {
        items.push({ key: `news:${n.id}`, source: "news", kind: "news", decision: null, week: n.week, unread: false, sender: t("ib.from.esportsWire"), subject: n.title, preview: n.content, news: n })
    }
    for (const p of sources.socialFeed ?? []) {
        items.push({ key: `social:${p.id}`, source: "social", kind: "news", decision: null, week: p.week, unread: false, sender: p.user?.handle || p.user?.name || t("ib.social"), subject: p.user?.name || t("ib.socialPost"), preview: p.content, social: p })
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
        if (isFolded(event)) continue
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
    if (week === currentWeek) return t("ib.thisWeek")
    if (week === currentWeek - 1) return t("ib.lastWeek")
    return t("common.week", { n: week })
}
