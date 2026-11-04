/**
 * What a new career will start with, computed by the same functions the
 * career uses (START-01, START-02, START-11).
 *
 * The club picker builds one world with snapshotLoader.createCareerFromSnapshot
 * (the call initializeNewGame makes), rates and prices every club from it, and
 * hands that same world to initializeNewGame, so the numbers in the picker are
 * the numbers on Home: no second formula, no second random draw.
 */

import type { GameSave, PlayerSaveData } from "@/engine/save-types"
import { evaluatePlayer } from "@/engine/player-evaluation"
import { initialClubBudget } from "@/engine/season/club-finances"
import { CAREER_DIFFICULTY, type CareerDifficulty } from "@/lib/balance-tuning"
import { teamOvr } from "@/lib/team-ovr"

/** Starting cash after the career difficulty (initializeNewGame applies exactly this). */
export function difficultyStartingCash(base: number, difficulty: CareerDifficulty = "normal"): number {
    const d = Object.hasOwn(CAREER_DIFFICULTY, difficulty) ? CAREER_DIFFICULTY[difficulty] : CAREER_DIFFICULTY.normal
    return difficulty === "normal" ? base : Math.round(base * d.cash)
}

export interface ClubStartPreview {
    /** Team OVR of the starting five (Home's "Team OVR"). */
    ovr: number
    /** Cash the career starts with at this difficulty. */
    budget: number
    /** Sum of the roster's market values. */
    value: number
    /** The roster, best first, with each player's OVR. */
    roster: { player: PlayerSaveData; ovr: number }[]
}

/**
 * The club as the career would start it when managed: the runway rule of
 * initialClubBudget with this club as the managed one (no implicit gear
 * costs), then the difficulty multiplier.
 */
export function previewClubStart(
    world: Pick<GameSave, "players" | "contracts" | "staff" | "currentWeek" | "teams">,
    teamId: string,
    difficulty: CareerDifficulty = "normal",
    playerMap: Map<string, PlayerSaveData> = new Map(world.players.map(p => [p.id, p])),
): ClubStartPreview | null {
    const team = world.teams.find(t => t.id === teamId)
    if (!team) return null
    const base = initialClubBudget({ ...world, playerTeamId: team.id }, team)
    const roster = team.rosterIds
        .map(id => playerMap.get(id))
        .filter((p): p is PlayerSaveData => !!p && !p.isRetired)
        .map(player => ({ player, evaluation: evaluatePlayer(player) }))
    return {
        ovr: teamOvr(team, world.players, playerMap) ?? 0,
        budget: difficultyStartingCash(base, difficulty),
        value: roster.reduce((sum, r) => sum + r.evaluation.transferValue, 0),
        roster: roster
            .map(r => ({ player: r.player, ovr: r.evaluation.overallRating }))
            .sort((a, b) => b.ovr - a.ovr),
    }
}

/**
 * World rank a created club starts at: it enters at Elo 800, below every
 * snapshot club (their Elo starts at 1000 or more), so it ranks last.
 */
export function createdClubStartRank(existingClubCount: number): number {
    return Math.max(0, Math.floor(existingClubCount)) + 1
}

/** A created club's name or tag clashes with a club already in the world (START-10). */
export { clubIdentityClash } from "@/engine/team-creator"

/**
 * Give clubs with no tag the tag of the same club in the snapshot (START-10:
 * careers created before snapshotTeamToSaveTeam copied it). Never overwrites
 * a tag the save has, including one set in the sandbox editor.
 */
export function backfillTeamTags(
    teams: Array<{ id: string; shortName?: string }>,
    snapshotTeams: ReadonlyArray<{ id: string; shortName?: string }>,
): number {
    const tags = new Map(snapshotTeams.filter(t => !!t.shortName).map(t => [t.id, t.shortName as string]))
    let filled = 0
    for (const team of teams) {
        if (team.shortName !== undefined) continue
        const tag = tags.get(team.id)
        if (tag) { team.shortName = tag; filled++ }
    }
    return filled
}
