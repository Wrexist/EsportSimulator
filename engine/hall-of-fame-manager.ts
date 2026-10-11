import type { HallOfFameEntry, PlayerSaveData } from "./save-types"
import { HALL_OF_FAME_TUNING as HOF } from "@/lib/balance-tuning"

/**
 * Hall of Fame (Phase 5.1: one path, real career numbers).
 *
 * At retirement (and the age-38 legend check) a career is judged on what the
 * engine recorded: official maps and the rounds-weighted rating, official
 * kills, titles won on a club's roster, Majors, season awards (season MVP,
 * Top 20 placements) and career matches (which include a player's
 * pre-career record). Two achievements induct; a few standout careers induct
 * on one (HALL_OF_FAME_TUNING).
 *
 * The induction itself is written by EventProcessor.processRetirements /
 * processMidSeasonRetirements through hallOfFameEntry().
 */

export type CareerTotals = Pick<PlayerSaveData, "majorWins" | "totalKills" | "avgRating" | "matchesPlayed">
    & Partial<Pick<PlayerSaveData, "mapsPlayed" | "careerTrophies" | "honours" | "totalMVPs">>

type Reason = HallOfFameEntry["inductionReasons"][number]

const seasonMvps = (p: CareerTotals) => (p.honours ?? []).filter(h => h.award === "MVP").length
const top20Placements = (p: CareerTotals) => (p.honours ?? []).filter(h => h.award === "TOP20").length
const ratedCareer = (p: CareerTotals) => (p.mapsPlayed ?? 0) >= HOF.RATING_MIN_MAPS

/** Each achievement with its Hall of Fame badge. */
export function hallOfFameReasons(player: CareerTotals): Reason[] {
    const reasons: Reason[] = []
    const majors = player.majorWins || 0
    const titles = player.careerTrophies || 0
    const mvps = seasonMvps(player)
    const top20 = top20Placements(player)
    const matches = player.matchesPlayed || 0
    if (majors >= 1) reasons.push({ type: "CHAMPION", label: `${majors}x Major champion`, icon: "Trophy" })
    if (titles >= HOF.CAREER_TITLES) reasons.push({ type: "CHAMPION", label: `${titles} titles`, icon: "Award" })
    if (mvps >= 1) reasons.push({ type: "MVP", label: mvps === 1 ? "Season MVP" : `${mvps}x Season MVP`, icon: "Crown" })
    if (top20 >= HOF.TOP20_PLACEMENTS) reasons.push({ type: "IMPACT", label: `${top20}x Top 20`, icon: "Star" })
    if ((player.avgRating || 0) >= HOF.CAREER_RATING && ratedCareer(player)) reasons.push({ type: "MVP", label: `${player.avgRating.toFixed(2)} rating over ${player.mapsPlayed} maps`, icon: "Activity" })
    if ((player.totalKills || 0) >= HOF.CAREER_KILLS) reasons.push({ type: "IMPACT", label: `${player.totalKills} official kills`, icon: "Crosshair" })
    if (matches >= HOF.CAREER_MATCHES) reasons.push({ type: "LONGEVITY", label: `${matches} career matches`, icon: "Clock" })
    return reasons
}

/** Achievement labels (also stored on legendary players). */
export function hallOfFameAchievements(player: CareerTotals): string[] {
    return hallOfFameReasons(player).map(r => r.label)
}

/** Two achievements, or a standalone multi-Major, multi-MVP or elite-rating career. */
export function qualifiesForHallOfFame(player: CareerTotals): boolean {
    return hallOfFameReasons(player).length >= HOF.ACHIEVEMENTS_REQUIRED
        || (player.majorWins || 0) >= HOF.AUTO_MAJOR_WINS
        || seasonMvps(player) >= HOF.AUTO_SEASON_MVPS
        || ((player.avgRating || 0) >= HOF.AUTO_RATING && ratedCareer(player))
}

/** The Hall of Fame entry for a qualifying player (with the career that earned it). */
export function hallOfFameEntry(player: PlayerSaveData, currentWeek: number, lastClubId?: string): HallOfFameEntry {
    const season = Math.max(1, Math.ceil(currentWeek / 52))
    const reasons = hallOfFameReasons(player)
    const seasons = (player.seasonLines ?? []).map(l => l.season)
    return {
        id: player.id,
        name: player.nickname,
        portraitPath: player.portraitPath || "",
        eraStart: seasons.length ? Math.min(...seasons) : (player.debutSeason ?? season),
        eraEnd: season,
        primaryRole: player.role || "RIFLER",
        category: "INDUCTED",
        inductionReasons: reasons.length ? reasons : [{ type: "IMPACT", label: "Career achievement", icon: "Award" }],
        nationality: player.nationality || "",
        career: {
            maps: player.mapsPlayed ?? 0,
            rating: Math.round((player.avgRating || 0) * 100) / 100,
            kills: player.totalKills ?? 0,
            trophies: player.careerTrophies ?? 0,
            majors: player.majorWins ?? 0,
            seasonMvps: seasonMvps(player),
            top20: top20Placements(player),
            matches: player.matchesPlayed || 0,
            ...(lastClubId ? { lastClubId } : {}),
        },
    }
}
