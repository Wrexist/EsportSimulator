/**
 * View model for the weekly report: groups the report's change entries into
 * the rows the modal and the Home panel show. Pure; no numbers are made up,
 * every row is a sum of recorded entries.
 */

import type { ChangeEntry } from "@/lib/week-changes"
import { fmtDelta, formatMoney, moneyNet, signedDelta, type WeekReport } from "@/lib/week-report"
import { choiceLabel } from "@/components/inbox/inbox-model"

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
}

const CONDITION_ORDER = ["morale", "form", "energy", "fatigue"] as const
const CONDITION_LABEL: Record<string, string> = { morale: "Morale", form: "Form", energy: "Energy", fatigue: "Fatigue" }

/** Positive is good, except fatigue. */
function toneOf(kind: string, delta: number): Tone {
    if (Math.abs(delta) < 1e-9) return "neutral"
    const good = kind === "fatigue" ? delta < 0 : delta > 0
    return good ? "up" : "down"
}

function causeParts(entries: ChangeEntry[], withDelta: boolean, max = 3): string {
    const byCause = new Map<string, number>()
    for (const e of entries) byCause.set(e.cause.label, (byCause.get(e.cause.label) ?? 0) + e.delta)
    const parts = [...byCause.entries()].filter(([, d]) => Math.abs(d) >= 0.05).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    const shown = parts.slice(0, max).map(([label, d]) => (withDelta ? `${label} ${signedDelta(d)}` : label))
    return shown.join(" · ") + (parts.length > max ? ` · +${parts.length - max} more` : "")
}

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
                ? { change: `${e.label} · out ${e.delta} week${e.delta === 1 ? "" : "s"}`, cause: e.cause.label, tone: "down" }
                : { change: e.label.startsWith("Recovered") ? e.label : `${e.label} · ${fmtDelta(e.delta)} week${Math.abs(e.delta) === 1 ? "" : "s"} closer`, cause: e.cause.label, tone: "up" })
        }
        for (const e of entries.filter(x => x.kind === "contract")) {
            rows.push({ change: e.label, cause: e.cause.label, tone: e.delta < 0 ? "down" : "up" })
        }
        // Attributes: one row per cause, listing every stat it moved.
        const attrByCause = new Map<string, ChangeEntry[]>()
        for (const e of entries.filter(x => x.kind === "attribute")) {
            const list = attrByCause.get(e.cause.label) ?? []
            list.push(e)
            attrByCause.set(e.cause.label, list)
        }
        for (const [cause, list] of attrByCause) {
            const sorted = [...list].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
            const total = sorted.reduce((s, e) => s + e.delta, 0)
            rows.push({ change: sorted.map(e => `${e.label} ${signedDelta(e.delta)}`).join(" · "), cause, tone: toneOf("attribute", total) })
        }
        // Condition values: net change with its causes; values that share
        // exactly the same causes (e.g. morale and form both drifting) share a row.
        const conditionRows: ChangeRow[] = []
        for (const kind of CONDITION_ORDER) {
            const list = entries.filter(x => x.kind === kind)
            if (list.length === 0) continue
            const net = list.reduce((s, e) => s + e.delta, 0)
            if (!list.some(e => Math.abs(e.delta) >= 0.5) && Math.abs(net) < 0.5) continue
            const text = `${CONDITION_LABEL[kind]} ${Math.abs(net) < 0.05 ? "±0" : signedDelta(net)}`
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
        rows.push(...conditionRows)
        if (rows.length) groups.push({ id, name: report.names[id] ?? "Player", rows })
    }
    return groups
}

export interface MoneyLine { label: string; cause: string; amount: number }

export function moneyLines(report: WeekReport): { income: MoneyLine[]; expenses: MoneyLine[]; net: number } {
    const lines = new Map<string, MoneyLine>()
    for (const e of report.changes) {
        if (e.kind !== "money") continue
        const key = `${e.label}|${e.cause.label}|${e.delta >= 0 ? "+" : "-"}`
        const prev = lines.get(key)
        if (prev) prev.amount += e.delta
        else lines.set(key, { label: e.label, cause: e.cause.label, amount: e.delta })
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
        rows.push({ label: "World rank", change: `#${r0} → #${r1}`, cause: causeParts(rank, false), tone: r1 < r0 ? "up" : "down" })
    }
    const elo = group("ranking", "Elo")
    if (elo.length) {
        const net = elo.reduce((s, e) => s + e.delta, 0)
        rows.push({ label: "Elo", change: Math.abs(net) < 0.5 ? "±0" : signedDelta(Math.round(net)), cause: causeParts(elo, elo.length > 1), tone: toneOf("elo", net) })
    }
    for (const [kind, label] of [["board", "Board confidence"], ["chemistry", "Chemistry"], ["reputation", "Reputation"]] as const) {
        const list = group(kind, label)
        if (!list.length) continue
        const net = list.reduce((s, e) => s + e.delta, 0)
        if (Math.abs(net) < 0.05 && !list.some(e => Math.abs(e.delta) >= 0.5)) continue
        rows.push({ label, change: signedDelta(net), cause: causeParts(list, list.length > 1), tone: toneOf(kind, net) })
    }
    const [m0, m1] = report.kpis.morale
    if (m0 != null && m1 != null && Math.abs(m1 - m0) >= 0.5) {
        rows.push({ label: "Morale (avg)", change: `${Math.round(m0)} → ${Math.round(m1)}`, cause: "See player changes", tone: m1 > m0 ? "up" : "down" })
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
        name: report.names[e.subjectId] ?? "Player",
        change: e.kind === "injury" ? `Injured · ${e.delta} wk` : `${e.label} ${signedDelta(e.delta)}`,
        cause: e.cause.label,
        tone: e.kind === "injury" ? "down" : toneOf(e.kind, e.delta),
    }))
}

/** Unanswered decisions with the default the club applied, without the inline effect note. */
export function unansweredRows(report: WeekReport): { label: string; outcome: string }[] {
    return (report.unanswered ?? []).map(u => ({
        label: u.label,
        outcome: u.outcome === "Lapsed" ? "Lapsed, no effect" : choiceLabel({ id: "", text: u.outcome }),
    }))
}

export function resultsLabel(report: WeekReport): string {
    if (report.matches.length === 0) return "No matches"
    const w = report.matches.filter(m => m.won).length
    return `${w}–${report.matches.length - w}`
}

export { formatMoney, signedDelta }
