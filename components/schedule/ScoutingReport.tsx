"use client"
import { intlLocale, t } from "@/lib/i18n"

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

const pct = (fraction: number) => `${fraction > 0 ? "+" : ""}${Math.round(fraction * 100)}`
const pts = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString(intlLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

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
            title: t("sch.sc.star", { name: rated[0].player.nickname }),
            body: t("sch.sc.starBody", { ovr: rated[0].ovr, gap: rated[0].ovr - rated[2].ovr }),
        })
    }

    // Chemistry: -5% … +5% team strength around 50.
    const chemistry = typeof opponent.chemistry === "number" ? opponent.chemistry : null
    if (chemistry !== null) {
        const effect = ((Math.max(0, Math.min(100, chemistry)) - 50) / 50) * CHEMISTRY_EDGE_RANGE
        if (Math.abs(effect) >= 0.02) {
            findings.push({ title: t("sch.sc.chem", { n: Math.round(chemistry) }), body: effect > 0 ? t("sch.sc.chemUp") : t("sch.sc.chemDown"), effect })
        }
    }

    // Morale (condition): duel rating per player, form and energy held neutral.
    const avgMorale = active.reduce((s, p) => s + (p.morale ?? 70), 0) / active.length
    const neutral = { form: 55, energy: 100, fatigue: 0 }
    const moraleRating = conditionPoints({ ...neutral, morale: avgMorale })
    if (Math.abs(moraleRating) >= 0.7) {
        findings.push({ title: t("sch.sc.morale", { n: Math.round(avgMorale) }), body: moraleRating > 0 ? t("sch.sc.moraleUp") : t("sch.sc.moraleDown"), rating: moraleRating })
    }

    // Fatigue (condition).
    const avgFatigue = active.reduce((s, p) => s + (p.fatigue ?? 0), 0) / active.length
    const fatigueRating = conditionPoints({ ...neutral, morale: 65, fatigue: avgFatigue })
    if (fatigueRating <= -1) {
        findings.push({ title: t("sch.sc.fatigue", { n: Math.round(avgFatigue) }), body: t("sch.sc.fatigueBody"), rating: fatigueRating })
    }

    // Role coverage: -4% team strength per role missing from the five.
    const missing = missingRoles(active)
    if (missing >= 2) {
        findings.push({ title: t("sch.sc.roles", { n: 5 - missing }), body: t("sch.sc.rolesBody"), effect: -missing * ROLE_MISSING_EDGE })
    }

    return findings.slice(0, 4)
}

export function ScoutingReport({ opponent, opponentRoster }: ScoutingReportProps) {
    const findings = deriveFindings(opponent, opponentRoster)

    return (
        <section aria-labelledby="scouting-report-title">
            <p id="scouting-report-title" className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t("sch.sc.title")}</p>
            {findings.length === 0 ? (
                <p className="text-sm text-ink-3">{t("sch.sc.none")}</p>
            ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                    {findings.map(f => (
                        <li key={f.title} className="flex items-baseline justify-between gap-3 px-3 py-2">
                            <span className="min-w-0">
                                <span className="text-sm font-semibold text-ink-1">{f.title}</span>
                                <span className="ml-2 text-xs text-ink-3">{f.body}</span>
                            </span>
                            {f.effect !== undefined && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2" title={t("sch.sc.strengthTip")}>{t("sch.sc.strength", { n: pct(f.effect) })}</span>
                            )}
                            {f.rating !== undefined && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2" title={t("sch.sc.duelTip")}>{t("sch.sc.duel", { n: pts(f.rating) })}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
