import { t } from "@/lib/i18n"

const CLUB_DIFFICULTIES = new Set(["easy", "normal", "hard"])
const CREATED_DIFFICULTIES = new Set(["story", "normal", "hard", "impossible"])

/**
 * Audit 17 MODES-17: the difficulty behind the club's recurring-income
 * multiplier (engine/economy-engine.ts applies `difficultySettings.incomeMultiplier`
 * to sponsor and fan/merch income), in the names the new-career pickers use.
 * Null when income is not changed (Normal, or a club joined later).
 */
export function incomeDifficulty(
    team: { difficultySettings?: { incomeMultiplier?: number }; customTeamData?: { difficulty?: string } },
    careerDifficulty: string | undefined,
): { label: string; factor: number } | null {
    const factor = team.difficultySettings?.incomeMultiplier
    if (typeof factor !== "number" || !Number.isFinite(factor) || factor === 1) return null
    const created = team.customTeamData?.difficulty
    const label = created
        ? (CREATED_DIFFICULTIES.has(created) ? t(`ct.diff.${created}`) : null)
        : careerDifficulty && CLUB_DIFFICULTIES.has(careerDifficulty) ? t(`ng.diff.${careerDifficulty}`) : null
    return label ? { label, factor } : null
}
