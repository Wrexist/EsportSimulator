"use client"

import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"

interface ScoutingReportProps {
    opponent: TeamSaveData
    opponentRoster: PlayerSaveData[]
}

interface Finding {
    title: string
    body: string
    /** Signed share of team strength, when the match engine applies one. */
    effect?: number
}

const pct = (fraction: number) => `${fraction > 0 ? "+" : ""}${Math.round(fraction * 100)}%`

/**
 * Pre-match read on the opponent. Only reports what the match engine actually
 * uses (engine/match/team-strength.ts): chemistry, morale and role coverage
 * add to strength, fatigue multiplies it, and the lineup's ratings. Play-style
 * attributes (AWP, leadership, clutch, entry) are not modelled yet, so they
 * are not claimed here.
 */
function deriveFindings(opponent: TeamSaveData, roster: PlayerSaveData[]): Finding[] {
    const active = roster.slice(0, 5)
    if (active.length === 0) return []
    const findings: Finding[] = []

    // Star dependency (ratings).
    const rated = active.map(p => ({ player: p, ovr: evaluatePlayer(p).overallRating })).sort((a, b) => b.ovr - a.ovr)
    if (rated.length >= 5 && rated[0].ovr - rated[2].ovr >= 12) {
        findings.push({
            title: `Built around ${rated[0].player.nickname}`,
            body: `Rated ${rated[0].ovr}, ${rated[0].ovr - rated[2].ovr} above the middle of the lineup.`,
        })
    }

    // Chemistry: 0.85–1.15 additive.
    const chemistry = typeof opponent.chemistry === "number" ? opponent.chemistry : null
    if (chemistry !== null) {
        const effect = 0.85 + (chemistry / 100) * 0.3 - 1
        if (Math.abs(effect) >= 0.05) {
            findings.push({ title: `Chemistry ${Math.round(chemistry)}`, body: effect > 0 ? "A settled lineup." : "The lineup has not gelled yet.", effect })
        }
    }

    // Morale: 0.8–1.2 additive.
    const avgMorale = active.reduce((s, p) => s + (p.morale ?? 50), 0) / active.length
    const moraleEffect = 0.8 + (avgMorale / 100) * 0.4 - 1
    if (Math.abs(moraleEffect) >= 0.06) {
        findings.push({ title: `Morale ${Math.round(avgMorale)}`, body: moraleEffect > 0 ? "Confident going in." : "Low confidence.", effect: moraleEffect })
    }

    // Fatigue: 1.0–0.7 multiplier.
    const avgFatigue = active.reduce((s, p) => s + (p.fatigue ?? 0), 0) / active.length
    const fatigueEffect = -(avgFatigue / 100) * 0.3
    if (fatigueEffect <= -0.06) {
        findings.push({ title: `Fatigue ${Math.round(avgFatigue)}`, body: "Tired legs.", effect: fatigueEffect })
    }

    // Role coverage: 0.8 + distinct/5 × 0.2.
    const roles = new Set(active.map(p => p.role)).size
    if (roles < 4) {
        findings.push({ title: `${roles} distinct roles`, body: "Overlapping roles in the starting five.", effect: (roles / 5) * 0.2 - 0.2 })
    }

    return findings.slice(0, 4)
}

export function ScoutingReport({ opponent, opponentRoster }: ScoutingReportProps) {
    const findings = deriveFindings(opponent, opponentRoster)

    return (
        <section aria-labelledby="scouting-report-title">
            <p id="scouting-report-title" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">Opponent read</p>
            {findings.length === 0 ? (
                <p className="text-sm text-ink-3">Nothing stands out: no star dependency, and chemistry, morale and fatigue are near neutral.</p>
            ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                    {findings.map(f => (
                        <li key={f.title} className="flex items-baseline justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                                <span className="text-sm font-semibold text-ink-1">{f.title}</span>
                                <span className="ml-2 text-xs text-ink-3">{f.body}</span>
                            </span>
                            {f.effect !== undefined && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2" title="Effect on their team strength">{pct(f.effect)} strength</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
