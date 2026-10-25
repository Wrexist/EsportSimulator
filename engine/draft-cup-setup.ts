/**
 * G7: turns a freshly built world into a Draft Cup career.
 *
 * Called by initializeNewGame after the world is built and the regional
 * league is drawn (so the drafted team plays no league). Adds the drafted
 * team, moves the five picks onto it from their clubs, and starts the cup:
 * the seven opponents plus the drafted team in an 8-team bracket, one round
 * a week from this week.
 */

import { TournamentManager } from "./tournament-manager"
import { SeededRNG } from "./rng"
import { SynergyCalculator } from "./synergy-calculator"
import { DRAFT_CUP_TEAM_PREFIX } from "./world-ranking"
import { clubStrength, DRAFT_CUP_DIFFICULTY, draftComplete, draftSpent, type DraftCupDifficulty, type DraftCupState, type DraftPick, type DraftRole } from "./draft-cup"
import type { GameSave, TeamSaveData, TournamentSaveData } from "./save-types"

export interface DraftCupSetup {
    teamName: string
    shortName: string
    primaryColor: string
    secondaryColor: string
    difficulty: DraftCupDifficulty
    budget: number
    picks: DraftPick[]
    opponentIds: string[]
}

/** Contract length for the drafted five (the cup lasts three weeks). */
const DRAFT_CONTRACT_WEEKS = 12
const DRAFT_WAGE_PER_WEEK = 2_000
/** Cash for the run: wages and match-week costs, nothing to spend on the market. */
const DRAFT_CUP_BUDGET_CASH = 150_000
const CUP_PRIZE_POOL = 250_000

export function draftCupTeamId(saveId: string): string {
    return `${DRAFT_CUP_TEAM_PREFIX}${saveId}`
}

/** Elo for seeding: the field's Elo scale mapped from starting-five strength. */
function eloFromStrength(save: GameSave, strength: number, fieldIds: string[]): number {
    const byId = new Map(save.players.map(p => [p.id, p]))
    const points = fieldIds
        .map(id => save.teams.find(t => t.id === id))
        .filter((t): t is TeamSaveData => !!t)
        .map(t => ({ s: clubStrength(t, byId as never), elo: t.elo }))
        .filter(p => p.s > 0 && Number.isFinite(p.elo))
    if (points.length < 2) return 1500
    const ms = points.reduce((a, p) => a + p.s, 0) / points.length
    const me = points.reduce((a, p) => a + p.elo, 0) / points.length
    let cov = 0, varS = 0
    for (const p of points) { cov += (p.s - ms) * (p.elo - me); varS += (p.s - ms) ** 2 }
    const slope = varS > 0 ? Math.max(0, cov / varS) : 0
    return Math.round(me + slope * (strength - ms))
}

/** Applies the Draft Cup to `save` and returns the drafted team's id. Throws on an invalid draft. */
export function setupDraftCup(save: GameSave, setup: DraftCupSetup): string {
    if (!draftComplete(setup.picks, setup.budget)) throw new Error("The draft needs one player per role inside the budget.")
    const opponents = [...new Set(setup.opponentIds)].filter(id => save.teams.some(t => t.id === id))
    if (opponents.length !== 7) throw new Error("The cup needs seven opponents.")
    const week = save.currentWeek
    const teamId = draftCupTeamId(save.saveId)
    const template = save.teams.find(t => !opponents.includes(t.id)) ?? save.teams[0]

    // Move the picks onto the new team.
    const pickedIds = setup.picks.map(p => p.playerId)
    for (const t of save.teams) {
        if (!t.rosterIds.some(id => pickedIds.includes(id))) continue
        if (opponents.includes(t.id)) throw new Error("A drafted player plays for a cup opponent.")
        t.rosterIds = t.rosterIds.filter(id => !pickedIds.includes(id))
        t.lastRosterChangeWeek = week
    }
    save.contracts = save.contracts.filter(c => !pickedIds.includes(c.playerId))
    for (const pick of setup.picks) {
        const p = save.players.find(x => x.id === pick.playerId)
        if (!p) throw new Error(`Drafted player ${pick.playerId} is not in the world.`)
        p.role = pick.role satisfies DraftRole
        p.isRetired = false
        p.fatigue = 0
        p.morale = Math.max(p.morale ?? 70, 70)
        save.contracts.push({ playerId: p.id, teamId, salaryPerWeek: DRAFT_WAGE_PER_WEEK, startWeek: week, endWeek: week + DRAFT_CONTRACT_WEEKS, buyout: 0 })
    }
    const roster = setup.picks.map(pick => save.players.find(p => p.id === pick.playerId)!)
    const byId = new Map(save.players.map(p => [p.id, p]))

    // Facilities feed match strength: give the drafted side the field's average, not the template club's.
    const field = opponents.map(id => save.teams.find(t => t.id === id)!)
    const fieldFacilities = Math.round(field.reduce((n, t) => n + (t.facilitiesLevel ?? 0), 0) / field.length)
    const team: TeamSaveData = {
        ...structuredClone(template),
        id: teamId,
        name: setup.teamName.trim() || "Draft Five",
        shortName: (setup.shortName.trim() || "DRF").toUpperCase().slice(0, 5),
        tier: "PRO",
        rosterIds: pickedIds,
        staffIds: [],
        reputation: 40,
        fanbase: 1000,
        followers: 5000,
        // New together, but picked to play together: below a settled side (70).
        chemistry: 60,
        lastRosterChangeWeek: week,
        facilitiesLevel: fieldFacilities,
        facilities: [],
        academyFacility: undefined,
        leagueTier: "C_TIER",
        financialState: undefined,
        runwayWeeks: undefined,
        weeklyNet: undefined,
        financeSettlement: undefined,
        consecutiveInsolventWeeks: undefined,
        administrations: undefined,
        lastAdministrationWeek: undefined,
        aiWageSwapWeek: undefined,
        prepPenalty: undefined,
        economyStyle: undefined,
        targetPlayerId: undefined,
        merchStoreLevel: undefined,
        activeMerchItems: [],
        difficultySettings: undefined,
        trainingSlotsUsed: 0,
        maxTrainingSlots: 3,
        budget: DRAFT_CUP_BUDGET_CASH,
        startingBudget: DRAFT_CUP_BUDGET_CASH,
        elo: 1500,
        worldRanking: undefined,
        peakWorldRanking: undefined,
        rankedElo: undefined,
        ratedMatches: 0,
        leagueDivisionId: undefined,
        leagueDivisionLevel: undefined,
        startingLeagueTier: undefined,
        sponsors: [],
        sponsorCooldowns: {},
        trophies: [],
        recentForm: [],
        rivalries: [],
        activeRoleTraining: [],
        equipment: [],
        youthAcademyIds: [],
        playbook: undefined,
        playstyle: "default",
        tacticalPrep: 0,
        dressingRoom: undefined,
        managementState: undefined,
        logoPath: undefined,
        branding: undefined,
        description: "A side drafted for one cup.",
        customTeam: true,
        customTeamData: { difficulty: "normal", logoIndex: 0, primaryColor: setup.primaryColor, secondaryColor: setup.secondaryColor },
        synergyMatrix: SynergyCalculator.calculateTeamMatrix(roster),
    } as TeamSaveData
    team.elo = eloFromStrength(save, clubStrength(team, byId as never), opponents)
    save.teams.push(team)
    save.playerTeamId = teamId
    save.circuitPoints = [...(save.circuitPoints ?? []), { teamId, points: 0, results: [] }]

    // The cup itself.
    const tournamentId = `draft_cup_${save.saveId}`
    const tournament = {
        id: tournamentId,
        seriesId: "draft_cup",
        instanceId: tournamentId,
        seasonNumber: 1,
        name: "Draft Cup",
        shortName: "Draft Cup",
        tier: "C_TIER",
        region: "INTERNATIONAL",
        teamIds: [],
        format: "bracket",
        currentStage: "Registration",
        standings: [],
        prizePool: CUP_PRIZE_POOL,
        startWeek: week,
        duration: 3,
        endWeek: week + 3,
        isCompleted: false,
        rewardsGranted: false,
    } as unknown as TournamentSaveData
    save.tournaments.push(tournament)
    const fieldIds = [teamId, ...opponents]
    TournamentManager.initializeTournament(save, tournamentId, fieldIds, new SeededRNG((save.lastRngSeed ?? 1) ^ 0xd2af7))
    tournament.standings = fieldIds.map(id => ({ teamId: id, matchesPlayed: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 }))
    save.tournamentQualifications = [...(save.tournamentQualifications ?? []), ...fieldIds.map(id => ({ tournamentId, teamId: id, status: "QUALIFIED", qualifiedVia: "Draft Cup" }))] as GameSave["tournamentQualifications"]

    const state: DraftCupState = {
        tournamentId,
        teamId,
        difficulty: setup.difficulty,
        budget: setup.budget,
        picks: setup.picks.map(p => ({ ...p })),
        startWeek: week,
    }
    save.draftCup = state

    const spent = draftSpent(setup.picks)
    const opponentNames = opponents.map(id => save.teams.find(t => t.id === id)?.name ?? id)
    save.eventsLog.unshift({
        id: `evt_draft_cup_${save.saveId}`,
        type: "CAREER_UPDATE",
        week,
        acknowledged: false,
        data: {
            title: `${team.name} are in the Draft Cup`,
            message: `You drafted ${roster.map(p => p.nickname).join(", ")} for ${spent} of ${setup.budget} draft points.\n\n` +
                `The cup is eight teams, single elimination: a best-of-three quarter-final this week, a best-of-three semi-final next week and a best-of-five grand final the week after. One loss ends the run.\n\n` +
                `Your opponents (${DRAFT_CUP_DIFFICULTY[setup.difficulty].label}): ${opponentNames.join(", ")}.\n\n` +
                `Between matches you can train, set the playbook and prepare for the next opponent. The run score counts how far you go, maps won, round difference, the difficulty and draft points left unspent.`,
            severity: "success",
        },
    })
    return teamId
}
