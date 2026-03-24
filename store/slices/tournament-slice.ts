"use client"

import type { TournamentState, TournamentActions, SliceCreator } from "@/store/types"
import {
  nextDeterministicId,
} from "@/store/utils/helpers"
import { FULL_TOURNAMENT_CALENDAR, CIRCUIT_POINTS } from "@/data/tournament-calendar"
import {
  buildInstanceId,
  getSeasonFromTournamentId,
  getSeasonFromWeek,
  getSeriesIdFromTournamentId,
  isQualificationForTournament,
  normalizeQualificationStatus,
  resolveTournamentIdentity,
} from "@/engine/circuit-engine"
import { checkAchievements, steamService as steamAchievements } from "@/engine/steam-service"

export const tournamentInitialState: TournamentState = {
  tournaments: [],
  selectedRegions: ["EU", "NA"],
  circuitPoints: [],
  tournamentQualifications: [],
}

export const createTournamentSlice: SliceCreator<TournamentActions> = (set, get) => ({
  registerForTournament: (tournamentId: string) => {
    const state = get()
    const identity = resolveTournamentIdentity(tournamentId, state.currentWeek)
    const baseId = identity.seriesId || getSeriesIdFromTournamentId(tournamentId)
    const definition = FULL_TOURNAMENT_CALENDAR.find(t => t.id === baseId)
    if (!definition) return { success: false, message: "Tournament not found" }

    if (!state.playerTeamId) return { success: false, message: "No player team" }

    let seasonNumber = getSeasonFromTournamentId(tournamentId) ?? identity.seasonNumber
    if (!getSeasonFromTournamentId(tournamentId)) {
      let absoluteStart = ((seasonNumber - 1) * 52) + definition.startWeek
      while (absoluteStart < state.currentWeek) {
        seasonNumber += 1
        absoluteStart += 52
      }
    }

    const instanceId = buildInstanceId(baseId, seasonNumber)

    // Check if already registered for this series + season
    const existing = state.tournamentQualifications.find(
      q => q.teamId === state.playerTeamId && isQualificationForTournament(q, instanceId, state.currentWeek)
    )
    if (existing) return { success: false, message: "Already registered or qualified" }

    // Check if this is a qualifier and player is already in main tournament
    if (definition.qualifierFor) {
      const mainTournamentId = buildInstanceId(definition.qualifierFor, seasonNumber)
      const isInMain = state.tournamentQualifications.some(q =>
        isQualificationForTournament(q, mainTournamentId, state.currentWeek) &&
        q.teamId === state.playerTeamId &&
        (q.status === "QUALIFIED" || q.status === "REGISTERED")
      )
      if (isInMain) {
        const mainTournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === definition.qualifierFor)
        return {
          success: false,
          message: `Already qualified for ${mainTournament?.name || "main tournament"}. Cannot enter qualifier.`
        }
      }

      // Check if already registered for another qualifier for the same main event
      const siblingQualifiers = FULL_TOURNAMENT_CALENDAR.filter(
        t => t.qualifierFor === definition.qualifierFor && t.id !== baseId
      )
      for (const sibling of siblingQualifiers) {
        const siblingInstanceId = buildInstanceId(sibling.id, seasonNumber)
        const isInSibling = state.tournamentQualifications.some(q =>
          isQualificationForTournament(q, siblingInstanceId, state.currentWeek) &&
          q.teamId === state.playerTeamId &&
          (q.status === "QUALIFIED" || q.status === "REGISTERED")
        )
        if (isInSibling) {
          return {
            success: false,
            message: `Already registered for ${sibling.name || sibling.shortName}. Cannot enter multiple qualifiers for the same tournament.`
          }
        }
      }
    }

    set(state => {
      const registration = normalizeQualificationStatus({
        tournamentId: instanceId,
        seriesId: baseId,
        instanceId,
        seasonNumber,
        teamId: state.playerTeamId!,
        status: "REGISTERED"
      }, state.currentWeek)

      state.tournamentQualifications.push(registration)

      // Log confirmation event
      state.eventsLog.push({
        id: nextDeterministicId(state, "evt_reg", instanceId),
        type: "TOURNAMENT_UPDATE",
        week: state.currentWeek,
        acknowledged: false,
        data: {
          tournamentId: instanceId,
          title: "Registration Confirmed",
          message: `Your team has successfully registered for ${definition.name}. Check your schedule for upcoming qualification matches.`,
          sender: "Tournament Ops",
          severity: "success"
        }
      })
    })
    return { success: true, message: `Registered for ${definition.name}` }
  },

  checkTournamentEligibility: (tournamentId: string) => {
    const state = get()
    const { QualificationEngine } = require("@/engine/tournament-qualification")
    const seriesId = getSeriesIdFromTournamentId(tournamentId)
    let tournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === seriesId)
    if (!tournament) return { eligible: false, reason: "Tournament not found" }

    const myTeam = state.teams.find(t => t.id === state.playerTeamId)
    if (!myTeam) return { eligible: false, reason: "Team not found" }

    const seasonNumber = getSeasonFromTournamentId(tournamentId) ?? getSeasonFromWeek(state.currentWeek)

    // Check if this is a qualifier and player is already in main tournament
    if (tournament.qualifierFor) {
      const mainTournamentId = buildInstanceId(tournament.qualifierFor, seasonNumber)
      const isInMain = state.tournamentQualifications.some(q =>
        isQualificationForTournament(q, mainTournamentId, state.currentWeek) &&
        q.teamId === state.playerTeamId &&
        (q.status === "QUALIFIED" || q.status === "REGISTERED")
      )
      if (isInMain) {
        const mainTournament = FULL_TOURNAMENT_CALENDAR.find(t => t.id === mainTournamentId)
        return {
          eligible: false,
          reason: `Already qualified for ${mainTournament?.name || "main tournament"}`
        }
      }
    }

    const eligibility = QualificationEngine.checkEligibility(
      tournament,
      myTeam,
      myTeam.worldRanking || 999,
      state.circuitPoints,
      state.tournamentQualifications
    )

    return {
      eligible: eligibility.canRegister,
      reason: eligibility.reason
    }
  },

  qualifyForTournament: (tournamentId, via) => {
    set((state) => {
      const identity = resolveTournamentIdentity(tournamentId, state.currentWeek)
      const exists = state.tournamentQualifications.find(q =>
        q.teamId === state.playerTeamId &&
        isQualificationForTournament(q, identity.instanceId, state.currentWeek)
      )
      if (!exists && state.playerTeamId) {
        state.tournamentQualifications.push(normalizeQualificationStatus({
          tournamentId: identity.instanceId,
          seriesId: identity.seriesId,
          instanceId: identity.instanceId,
          seasonNumber: identity.seasonNumber,
          teamId: state.playerTeamId,
          status: "QUALIFIED",
          qualifiedVia: via
        }, state.currentWeek))
      }
    })
  },

  awardCircuitPoints: (teamId: string, tournamentId: string, placement: number) => {
    set(state => {
      // Use canonical circuit points table, keyed by tournament tier
      const tournamentDef = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)
      const tier = (tournamentDef?.tier || "C_TIER") as keyof typeof CIRCUIT_POINTS
      const tierPoints = CIRCUIT_POINTS[tier] || CIRCUIT_POINTS.C_TIER
      const points = (tierPoints as Record<number, number>)[placement] || 0

      if (points === 0) return

      let entry = state.circuitPoints.find(cp => cp.teamId === teamId)
      if (entry) {
        entry.points += points
        entry.results.push({
          tournamentId,
          tournamentName: FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "Unknown Tournament",
          placement,
          points,
          week: state.currentWeek
        })
      } else {
        state.circuitPoints.push({
          teamId,
          points,
          results: [{
            tournamentId,
            tournamentName: FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "Unknown Tournament",
            placement,
            points,
            week: state.currentWeek
          }]
        })
      }

      // Phase 21: Career Narrative - Tournament Win News
      if (placement === 1) {
        const team = state.teams.find(t => t.id === teamId)
        const tournamentName = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.name || "The Tournament"

        // Phase 40: Major Tracking
        if (teamId === state.playerTeamId) {
          // Determine if it was a Major (S-Tier)
          const isMajor = FULL_TOURNAMENT_CALENDAR.find((t: any) => t.id === tournamentId)?.tier === "S_TIER"
          if (isMajor) {
            state.managerDetails.championships = (state.managerDetails.championships || 0) + 1
            steamAchievements.pushLeaderboardStats({ majorWins: state.managerDetails.championships })
          }

          // Steam Achievement: Tournament Win
          try {
            checkAchievements({ wonTournament: true })
          } catch (e) {
            // Silent fail for achievements
          }
        }

        const newsId = nextDeterministicId(state, "news_win", tournamentId, teamId)
        state.newsFeed.unshift({
          id: newsId,
          title: `${team?.name || "Team"} win ${tournamentName}!`,
          content: `${team?.name || "Team"} have been crowned champions of ${tournamentName} after a hard-fought battle. This victory marks a significant milestone in their season history.`,
          category: "TOURNAMENT",
          teamId: teamId,
          week: state.currentWeek
        })
        if (state.newsFeed.length > 50) state.newsFeed.pop()
      }
    })
  },
})
