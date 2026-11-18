/**
 * View model for the weekly report: groups the report's change entries into
 * the rows the modal and the Home panel show. Pure; no numbers are made up,
 * every row is a sum of recorded entries.
 */

import type { ChangeEntry } from "@/lib/week-changes"
import { causeText, fmtDelta, formatMoney, moneyNet, signedDelta, weekHeadline, type WeekReport } from "@/lib/week-report"
import { choiceLabel } from "@/components/inbox/inbox-model"
import { getLocale, isTextRef, t, tn, tRef } from "@/lib/i18n"
import { storedText } from "@/lib/stored-text"

export type Tone = "up" | "down" | "neutral"

export interface ChangeRow {
    change: string
    cause: string
    tone: Tone
    /** Same text split by value, each with its own tone (condition rows sharing a cause). */
    parts?: { text: string; tone: Tone }[]
}

export interface PlayerGroup {
    id: string
    name: string
    rows: ChangeRow[]
    /**
     * NEWPLAYER-23: the row the short view shows for this player: an injury or
     * contract, else his condition (morale, form, energy), else his stats.
     */
    lead: number
}

const CONDITION_ORDER = ["morale", "form", "energy", "fatigue"] as const
const conditionLabel = (kind: string) => t(`svd.${kind}`)

/** Positive is good, except fatigue. */
function toneOf(kind: string, delta: number): Tone {
    if (Math.abs(delta) < 1e-9) return "neutral"
    const good = kind === "fatigue" ? delta < 0 : delta > 0
    return good ? "up" : "down"
}

function causeParts(entries: ChangeEntry[], withDelta: boolean, max = 3): string {
    const byCause = new Map<string, number>()
    for (const e of entries) {
        const label = causeText(e.cause)
        byCause.set(label, (byCause.get(label) ?? 0) + e.delta)
    }
    const parts = [...byCause.entries()].filter(([, d]) => Math.abs(d) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    const shown = parts.slice(0, max).map(([label, d]) => (withDelta ? `${label} ${signedDelta(d)}` : label))
    return shown.join(" · ") + (parts.length > max ? ` · ${t("wr.more", { n: parts.length - max })}` : "")
}

/** Smallest stat move the report lists on its own row (NEWPLAYER-23). */
export const REPORT_MIN_STAT_CHANGE = 0.5

export function playerGroups(report: WeekReport): PlayerGroup[] {
    const byPlayer = new Map<string, ChangeEntry[]>()
    for (const e of report.changes) {
        if (e.subjectId === report.teamId) continue
        const list = byPlayer.get(e.subjectId) ?? []
        list.push(e)
        byPlayer.set(e.subjectId, list)
    }
    // Roster order as recorded in the names map, then anyone else.
    const order = [...Object.keys(report.names).filter(id => byPlayer.has(id)), ...[...byPlayer.keys()].filter(id => !(id in report.names))]
    const groups: PlayerGroup[] = []
    for (const id of order) {
        const entries = byPlayer.get(id) ?? []
        const rows: ChangeRow[] = []
        for (const e of entries.filter(x => x.kind === "injury")) {
            rows.push(e.delta > 0
                ? { change: `${storedText(e.label)} · ${tn("wr.outWeeks", e.delta)}`, cause: causeText(e.cause), tone: "down" }
                : { change: e.label.startsWith("Recovered") ? storedText(e.label) : `${storedText(e.label)} · ${tn("wr.weeksCloser", Math.abs(e.delta), { n: fmtDelta(e.delta) })}`, cause: causeText(e.cause), tone: "up" })
        }
        for (const e of entries.filter(x => x.kind === "contract")) {
            rows.push({ change: storedText(e.label), cause: causeText(e.cause), tone: e.delta < 0 ? "down" : "up" })
        }
        // Attributes: one row per cause, listing every stat it moved.
        // NEWPLAYER-23: moves under REPORT_MIN_STAT_CHANGE are counted, not listed.
        const attrByCause = new Map<string, ChangeEntry[]>()
        const attributes = entries.filter(x => x.kind === "attribute")
        const smallStats = attributes.filter(x => Math.abs(x.delta) < REPORT_MIN_STAT_CHANGE).length
        for (const e of attributes.filter(x => Math.abs(x.delta) >= REPORT_MIN_STAT_CHANGE)) {
            const list = attrByCause.get(e.cause.label) ?? []
            list.push(e)
            attrByCause.set(e.cause.label, list)
        }
        for (const list of attrByCause.values()) {
            const sorted = [...list].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            const total = sorted.reduce((s, e) => s + e.delta, 0)
            rows.push({ change: sorted.map(e => `${storedText(e.label)} ${signedDelta(e.delta)}`).join(" · "), cause: causeText(list[0].cause), tone: toneOf("attribute", total) })
        }
        // Condition values: net change with its causes; values that share
        // exactly the same causes (e.g. morale and form both drifting) share a row.
        const conditionRows: ChangeRow[] = []
        for (const kind of CONDITION_ORDER) {
            const list = entries.filter(x => x.kind === kind)
            if (list.length === 0) continue
            const net = list.reduce((s, e) => s + e.delta, 0)
            if (!list.some(e => Math.abs(e.delta) >= 0.5) && Math.abs(net) < 0.5) continue
            const text = `${conditionLabel(kind)} ${Math.abs(net) < 0.05 ? "±0" : signedDelta(net)}`
            const tone = toneOf(kind, net)
            const cause = causeParts(list, list.length > 1)
            const same = conditionRows.find(r => r.cause === cause && list.length === 1)
            if (same) {
                same.parts = [...(same.parts ?? [{ text: same.change, tone: same.tone }]), { text, tone }]
                same.change = same.parts.map(p => p.text).join(" · ")
                same.tone = same.parts.every(p => p.tone === same.parts![0].tone) ? same.parts[0].tone : "neutral"
            } else {
                conditionRows.push({ change: text, cause, tone })
            }
        }
        const firstCondition = rows.length
        rows.push(...conditionRows)
        if (smallStats > 0) rows.push({ change: tn("wr.smallStats", smallStats), cause: t("wr.smallStatsCause"), tone: "neutral" })
        const injuryOrContract = entries.some(x => x.kind === "injury" || x.kind === "contract")
        const lead = !injuryOrContract && conditionRows.length ? firstCondition : 0
        if (rows.length) groups.push({ id, name: report.names[id] ?? t("wr.player"), rows, lead })
    }
    return groups
}

/** `week`: the ledger week of the line when it is not the report's week (MARKET-08: the closing settlement is booked under the next week). */
export interface MoneyLine { label: string; cause: string; amount: number; week?: number }

export function moneyLines(report: WeekReport): { income: MoneyLine[]; expenses: MoneyLine[]; net: number } {
    const lines = new Map<string, MoneyLine>()
    for (const e of report.changes) {
        if (e.kind !== "money") continue
        const week = typeof e.week === "number" && e.week !== report.week ? e.week : undefined
        const key = `${e.label}|${e.cause.label}|${e.delta >= 0 ? "+" : "-"}|${week ?? ""}`
        const prev = lines.get(key)
        if (prev) prev.amount += e.delta
        else lines.set(key, { label: storedText(e.label), cause: causeText(e.cause), amount: e.delta, ...(week !== undefined ? { week } : {}) })
    }
    const all = [...lines.values()]
    return {
        income: all.filter(l => l.amount > 0).sort((a, b) => b.amount - a.amount),
        expenses: all.filter(l => l.amount < 0).sort((a, b) => a.amount - b.amount),
        net: moneyNet(report),
    }
}

export interface TeamRow { label: string; change: string; cause: string; tone: Tone }

export function teamRows(report: WeekReport): TeamRow[] {
    const club = report.changes.filter(e => e.subjectId === report.teamId && e.kind !== "money")
    const rows: TeamRow[] = []
    const group = (kind: string, label: string) => club.filter(e => e.kind === kind && e.label === label)

    const rank = group("ranking", "World rank")
    const [r0, r1] = report.kpis.rank
    if (rank.length && r0 != null && r1 != null && r0 !== r1) {
        rows.push({ label: t("svd.worldRank"), change: `#${r0} → #${r1}`, cause: causeParts(rank, false), tone: r1 < r0 ? "up" : "down" })
    }
    const elo = group("ranking", "Elo")
    if (elo.length) {
        const net = elo.reduce((s, e) => s + e.delta, 0)
        rows.push({ label: t("svd.elo"), change: Math.abs(net) < 0.5 ? "±0" : signedDelta(Math.round(net)), cause: causeParts(elo, elo.length > 1), tone: toneOf("elo", net) })
    }
    for (const [kind, label, key] of [["board", "Board confidence", "svd.boardConfidence"], ["chemistry", "Chemistry", "svd.chemistry"], ["reputation", "Reputation", "svd.reputation"]] as const) {
        const list = group(kind, label)
        if (!list.length) continue
        const net = list.reduce((s, e) => s + e.delta, 0)
        if (Math.abs(net) < 0.05 && !list.some(e => Math.abs(e.delta) >= 0.5)) continue
        rows.push({ label: t(key), change: signedDelta(net), cause: causeParts(list, list.length > 1), tone: toneOf(kind, net) })
    }
    const [m0, m1] = report.kpis.morale
    // Shown when the printed (rounded) values differ: "83 → 83" in red read as a drop (HOME-18).
    if (m0 != null && m1 != null && Math.round(m0) !== Math.round(m1)) {
        rows.push({ label: t("wr.moraleAvg"), change: `${Math.round(m0)} → ${Math.round(m1)}`, cause: t("wr.seePlayers"), tone: m1 > m0 ? "up" : "down" })
    }
    return rows
}

/** The few biggest player changes, for the compact Home panel. */
export function topPlayerChanges(report: WeekReport, max = 3): { name: string; change: string; cause: string; tone: Tone }[] {
    const attr = report.changes
        .filter(e => e.kind === "attribute" && e.subjectId !== report.teamId)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    const injuries = report.changes.filter(e => e.kind === "injury" && e.delta > 0)
    // One line per player: their biggest change.
    const seen = new Set<string>()
    const picked: ChangeEntry[] = [...injuries, ...attr].filter(e => !seen.has(e.subjectId) && !!seen.add(e.subjectId)).slice(0, max)
    return picked.map(e => ({
        name: report.names[e.subjectId] ?? t("wr.player"),
        change: e.kind === "injury" ? t("wr.injuredWk", { n: e.delta }) : `${storedText(e.label)} ${signedDelta(e.delta)}`,
        cause: causeText(e.cause),
        tone: e.kind === "injury" ? "down" : toneOf(e.kind, e.delta),
    }))
}

/** Unanswered decisions with the default the club applied, without the inline effect note. */
export function unansweredRows(report: WeekReport): { label: string; outcome: string }[] {
    // SMOKE-B-01/02: the keys the decision stored; older reports keep only the English.
    return (report.unanswered ?? []).map(u => ({
        label: isTextRef(u.labelRef) ? tRef(u.labelRef) : storedText(u.label),
        outcome: u.outcome === "Lapsed" ? t("wr.lapsed") : isTextRef(u.outcomeRef) ? tRef(u.outcomeRef) : storedText(choiceLabel({ id: "", text: u.outcome })),
    }))
}

export function resultsLabel(report: WeekReport): string {
    if (report.matches.length === 0) return t("lastWeek.noMatches")
    const w = report.matches.filter(m => m.won).length
    return `${w}–${report.matches.length - w}`
}

/** The report's headline in the active language (the save keeps the English one). */
export function reportHeadline(report: WeekReport): string {
    return getLocale() === "en" ? report.headline : weekHeadline(report)
}

/** A warning line in the active language. */
export const warningText = (label: string) => storedText(label)

export { formatMoney, signedDelta }
