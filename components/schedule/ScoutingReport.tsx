"use client"

import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { CHEMISTRY_EDGE_RANGE, missingRoles, ROLE_MISSING_EDGE } from "@/engine/match/round-sim/team-edge"
import { conditionPoints } from "@/engine/match/round-sim/profile"

interface ScoutingReportProps {
    opponent: TeamSaveData
    opponentRoster: PlayerSaveData[]
}

interface Finding {
    title: string
    body: string
    /** Signed share of team strength (non-player edge), when the match engine applies one. */
    effect?: number
    /** Signed duel-rating change per player (condition), when the match engine applies one. */
    rating?: number
}

const pct = (fraction: number) => `${fraction > 0 ? "+" : ""}${Math.round(fraction * 100)}%`
const pts = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`

/**
 * Pre-match read on the opponent. Only reports what the match engine
 * (script-v1, engine/match/round-sim) actually uses: chemistry and role
 * coverage are team strength (non-player edge, team-edge.ts); morale and
 * fatigue are part of each player's duel condition (profile.ts); and the
 * lineup's ratings.
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

    // Chemistry: -5% … +5% team strength around 50.
    const chemistry = typeof opponent.chemistry === "number" ? opponent.chemistry : null
    if (chemistry !== null) {
        const effect = ((Math.max(0, Math.min(100, chemistry)) - 50) / 50) * CHEMISTRY_EDGE_RANGE
        if (Math.abs(effect) >= 0.02) {
            findings.push({ title: `Chemistry ${Math.round(chemistry)}`, body: effect > 0 ? "A settled lineup." : "The lineup has not gelled yet.", effect })
        }
    }

    // Morale (condition): duel rating per player, form and energy held neutral.
    const avgMorale = active.reduce((s, p) => s + (p.morale ?? 70), 0) / active.length
    const neutral = { form: 55, energy: 100, fatigue: 0 }
    const moraleRating = conditionPoints({ ...neutral, morale: avgMorale })
    if (Math.abs(moraleRating) >= 0.7) {
        findings.push({ title: `Morale ${Math.round(avgMorale)}`, body: moraleRating > 0 ? "Confident going in." : "Low confidence.", rating: moraleRating })
    }

    // Fatigue (condition).
    const avgFatigue = active.reduce((s, p) => s + (p.fatigue ?? 0), 0) / active.length
    const fatigueRating = conditionPoints({ ...neutral, morale: 65, fatigue: avgFatigue })
    if (fatigueRating <= -1) {
        findings.push({ title: `Fatigue ${Math.round(avgFatigue)}`, body: "Tired legs.", rating: fatigueRating })
    }

    // Role coverage: -4% team strength per role missing from the five.
    const missing = missingRoles(active)
    if (missing >= 2) {
        findings.push({ title: `${5 - missing} of 5 roles`, body: "Overlapping roles in the starting five.", effect: -missing * ROLE_MISSING_EDGE })
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
                            {f.rating !== undefined && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2" title="Effect on each of their duels (rating points; 30 points is a 73/27 duel)">{pts(f.rating)} duel rating</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
