/**
 * What a staff member actually does in the game, computed from the engine's
 * own functions so the Staff screen can't promise effects that aren't applied:
 *  - match strength: engine/match/team-strength.ts staffStrengthBonus via the
 *    runtime staff built in engine/match/live-staff-adapter.ts (first staffer
 *    per role only; capped together with the playstyle counter)
 *  - training / recovery: engine/organization-effects.ts staffDevelopmentEffects
 *  - map veto: engine/match/map-veto.ts (analyst level cuts veto noise)
 *  - scouting: engine/processors/scouting-mission-processor.ts (accuracy → tier)
 */

import type { StaffSaveData } from "@/engine/save-types"
import { intlLocale, t } from "@/lib/i18n"
import { staffDevelopmentEffects } from "@/engine/organization-effects"
import { buildRuntimeStaff } from "@/engine/match/live-staff-adapter"
import { NON_PLAYER_BONUS_CAP, staffStrengthBonus } from "@/engine/match/team-strength"
import { getSpecializationMultiplier, normalizeSpecialization } from "@/engine/staff-specialization"
import { scoutTierFromAccuracy } from "@/engine/scouting-system"

/** Translated staff role name (staffRole.*). */
export function roleLabel(role: StaffSaveData["role"]): string {
    return t(`staffRole.${role}`)
}

/** Translated specialization, collapsed to the focus the engine actually uses. */
export function specializationLabel(spec: string | null | undefined): string {
    return t(`st.focus.${normalizeSpecialization(spec)}`)
}

const STAFF_STAT_KEYS = new Set(["development", "strategy", "analysis", "preparation", "prep", "stressResistance", "mentalRecovery", "scoutingSpeed", "accuracy", "leadership", "manManagement", "metaReading", "tactical"])

/** Translated staff attribute name; unknown keys fall back to a spaced-out version of the key. */
export function staffStatLabel(key: string): string {
    return STAFF_STAT_KEYS.has(key) ? t(`st.stat.${key}`) : key.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())
}

/** Per-level match strength from types/team.ts STAFF_EFFECTS + staffStrengthBonus. */
const MATCH_PCT_PER_LEVEL: Partial<Record<StaffSaveData["role"], number>> = { coach: 2, analyst: 2, psychologist: 1.5 }

/** Locale-formatted decimal (fixed digits when given). */
function fmt1(n: number, digits?: number): string {
    return n.toLocaleString(intlLocale(), digits == null ? { maximumFractionDigits: 1 } : { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function clampLevel(level: number) {
    return Math.min(5, Math.max(1, Math.round(level || 1)))
}

/** Raw match-strength percentage a staffer contributes before the shared cap. */
export function staffMatchPct(s: StaffSaveData): number {
    return (MATCH_PCT_PER_LEVEL[s.role] ?? 0) * clampLevel(s.level)
}

/**
 * @param countsInMatch false when another staffer of the same role is already
 * the one the match engine uses.
 * @param matchPct what they would actually add after the shared cap (market rows).
 */
export function staffEffects(s: StaffSaveData, countsInMatch = true, matchPct?: number): string[] {
    const lines: string[] = []
    const perLevel = MATCH_PCT_PER_LEVEL[s.role]
    if (perLevel) {
        const pct = matchPct ?? staffMatchPct(s)
        lines.push(!countsInMatch ? t("st.eff.noMatch")
            : pct <= 0.05 ? t("st.eff.capReached", { cap: NON_PLAYER_BONUS_CAP * 100 })
                : t(matchPct != null && matchPct < staffMatchPct(s) - 0.05 ? "st.eff.matchCapped" : "st.eff.match", { pct: fmt1(Math.round(pct * 10) / 10) }))
    }
    const dev = staffDevelopmentEffects([s])
    if (s.role === "coach") {
        lines.push(t("st.eff.training", { pct: Math.round((dev.trainingMultiplier - 1) * 100) }))
    } else if (s.role === "analyst") {
        lines.push(countsInMatch ? t("st.eff.veto", { n: clampLevel(s.level) }) : "")
    } else if (s.role === "psychologist") {
        lines.push(t("st.eff.recovery", { fatigue: fmt1(dev.recovery, 1), energy: fmt1(dev.recovery * 2, 1) }))
        lines.push(t("st.eff.morale"))
    } else if (s.role === "scout") {
        const tier = scoutTierFromAccuracy((s.stats?.accuracy ?? 50) * getSpecializationMultiplier(s))
        lines.push(t(`st.eff.scout.${tier}`))
    }
    return lines.filter(Boolean)
}

/** Ids of the staffers the match engine actually reads (first per role, like buildRuntimeStaff). */
export function matchCountedIds(staff: StaffSaveData[]): Set<string> {
    const seen = new Set<string>()
    const ids = new Set<string>()
    for (const s of staff) {
        if (s.role === "scout" || seen.has(s.role)) continue
        seen.add(s.role)
        ids.add(s.id)
    }
    return ids
}

export function teamStaffSummary(staff: StaffSaveData[]) {
    const strength = staffStrengthBonus(buildRuntimeStaff(staff))
    const dev = staffDevelopmentEffects(staff)
    return {
        matchPct: Math.min(NON_PLAYER_BONUS_CAP, strength) * 100,
        uncappedMatchPct: strength * 100,
        capPct: NON_PLAYER_BONUS_CAP * 100,
        trainingPct: (dev.trainingMultiplier - 1) * 100,
        recovery: dev.recovery,
    }
}
