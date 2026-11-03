/**
 * Legacy goals: long-term aims for a career that keep counting after the
 * first titles, across every club the manager runs.
 *
 * Each goal has rising levels (a bronze, silver and gold step). Progress is a
 * pure read of the save (stints, trophies, season honours, the world ranking,
 * the squad), so it can be shown at any time. Reaching a level fires once per
 * career: the store dedups by the level's stable id in acknowledgedEventIds,
 * the same way career milestones do, and the manager's reputation rises by the
 * level's reward (manager-timeline adjustManagerReputation, with its cause).
 */

import type { GameSave, TeamSaveData } from "./save-types"
import type { ManagerStint } from "./records-types"
import { isMajorTournament } from "./official-stats"
import { evaluatePlayer } from "./player-evaluation"

export interface LegacyGoal {
    id: string
    name: string
    /** One line on what counts, for the level target n. */
    describe: (n: number) => string
    /** Targets for each level, rising. */
    levels: readonly number[]
    /** Manager reputation for reaching each level. */
    reputation: readonly number[]
    progress: (save: LegacyView) => number
}

/** The parts of a save the goals read. */
export type LegacyView = Pick<GameSave, "managerDetails" | "teams" | "players" | "playerTeamId" | "currentWeek" | "recordBook" | "gameOverReason" | "proCareer">

const STEP_REPUTATION = [2, 3, 5] as const

/** Clubs managed with their window; a save from before stints were tracked counts the current spell. */
function spells(save: LegacyView): Array<{ team: TeamSaveData | undefined; from: number; to?: number }> {
    const stints: ManagerStint[] = save.managerDetails?.stints ?? []
    if (stints.length) return stints.map(s => ({ team: save.teams.find(t => t.id === s.teamId), from: s.fromWeek, to: s.toWeek }))
    const team = save.teams.find(t => t.id === save.playerTeamId)
    return team ? [{ team, from: save.managerDetails?.tenureStartWeek ?? 1 }] : []
}

function trophiesWon(save: LegacyView) {
    return spells(save).flatMap(({ team, from, to }) => (team?.trophies ?? [])
        .filter(t => t.week >= from && (to == null || t.week <= to))
        .map(t => ({ ...t, clubId: team!.id })))
}

/** The club the manager runs now (none between jobs). */
function currentClub(save: LegacyView): TeamSaveData | undefined {
    if (save.gameOverReason) return undefined
    return save.teams.find(t => t.id === save.playerTeamId)
}

export const LEGACY_GOALS: readonly LegacyGoal[] = [
    {
        id: "silverware",
        name: "Silverware",
        describe: n => `Win ${n} trophies as a manager`,
        levels: [1, 10, 25],
        reputation: STEP_REPUTATION,
        progress: save => trophiesWon(save).length,
    },
    {
        id: "majors",
        name: "Major champion",
        describe: n => n === 1 ? "Win a Major" : `Win ${n} Majors`,
        levels: [1, 3, 5],
        reputation: [3, 5, 8],
        progress: save => trophiesWon(save).filter(t => isMajorTournament(t.tournamentId)).length,
    },
    {
        id: "everywhere",
        name: "Winner everywhere",
        describe: n => `Win a trophy with ${n} different clubs`,
        levels: [2, 3, 4],
        reputation: [3, 4, 6],
        progress: save => new Set(trophiesWon(save).map(t => t.clubId)).size,
    },
    {
        id: "climb",
        name: "The climb",
        describe: n => n === 1 ? "Win promotion to a higher division" : `Win ${n} promotions`,
        levels: [1, 3, 5],
        reputation: STEP_REPUTATION,
        progress: save => (save.recordBook?.honours ?? []).filter(h => h.userClub?.tierMove === "promoted").length,
    },
    {
        id: "summit",
        name: "The summit",
        describe: n => n === 1 ? "Take your club to world number one" : `Take your club into the world top ${n}`,
        levels: [10, 3, 1],
        reputation: STEP_REPUTATION,
        // The club's world ranking now (lower is better; see reached()).
        progress: save => currentClub(save)?.worldRanking ?? 0,
    },
    {
        id: "loyalty",
        name: "One-club legacy",
        describe: n => `Manage one club for ${n} seasons`,
        levels: [3, 5, 10],
        reputation: STEP_REPUTATION,
        progress: save => {
            const open = spells(save).filter(s => s.to == null && s.team && !save.gameOverReason)
            return open.length ? Math.floor((save.currentWeek - open[open.length - 1].from + 1) / 52) : 0
        },
    },
    {
        id: "homegrown",
        name: "Homegrown star",
        describe: n => `Have an academy graduate rated ${n} or more in your squad`,
        levels: [70, 80, 90],
        reputation: STEP_REPUTATION,
        progress: save => {
            const club = currentClub(save)
            if (!club) return 0
            const year = 2025 + Math.floor(((save.currentWeek || 1) - 1) / 52)
            return club.rosterIds.reduce((best, id) => {
                const p = save.players.find(pl => pl.id === id)
                return p?.isAcademyGraduate ? Math.max(best, evaluatePlayer(p, undefined, year, save.currentWeek).overallRating) : best
            }, 0)
        },
    },
]

/** "summit" counts down (rank 10, then 3, then 1); every other goal counts up. */
function reached(goal: LegacyGoal, value: number, target: number): boolean {
    return goal.id === "summit" ? value > 0 && value <= target : value >= target
}

/** Recorded once a career's legacy has been checked (older careers then mark held levels without a reward). */
export const LEGACY_INIT_ID = "legacy:init"

export const legacyLevelId = (goalId: string, level: number) => `legacy:${goalId}:${level + 1}`

export interface LegacyRow {
    goal: LegacyGoal
    value: number
    /** Levels reached (0 to levels.length). */
    level: number
    /** Next target, when one is left. */
    next?: number
    /** 0..1 toward the next level (1 when all are done). */
    toward: number
}

/** Progress on every goal, for the career screen. */
export function legacyProgress(save: LegacyView): LegacyRow[] {
    return LEGACY_GOALS.map(goal => {
        const value = goal.progress(save)
        const level = goal.levels.filter(t => reached(goal, value, t)).length
        const next = goal.levels[level]
        let toward = 1
        if (next != null) {
            if (goal.id === "summit") toward = value > 0 ? Math.max(0, Math.min(1, (30 - value) / (30 - next))) : 0
            else toward = Math.max(0, Math.min(1, value / next))
        }
        return { goal, value, level, next, toward }
    })
}

export interface LegacyHit {
    id: string
    goalId: string
    level: number
    reputation: number
    message: string
}

/** Levels reached that have not fired yet in this career (pro careers have no manager legacy). */
export function checkLegacyGoals(save: LegacyView, firedIds: Set<string>): LegacyHit[] {
    if (save.proCareer && save.proCareer.retiredWeek == null) return []
    const hits: LegacyHit[] = []
    for (const row of legacyProgress(save)) {
        for (let i = 0; i < row.level; i++) {
            const id = legacyLevelId(row.goal.id, i)
            if (firedIds.has(id)) continue
            hits.push({
                id,
                goalId: row.goal.id,
                level: i + 1,
                reputation: row.goal.reputation[i] ?? 0,
                message: `Legacy: ${row.goal.name} (${["bronze", "silver", "gold"][i] ?? `level ${i + 1}`}). ${row.goal.describe(row.goal.levels[i])}.`,
            })
        }
    }
    return hits
}
