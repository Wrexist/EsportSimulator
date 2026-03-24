"use client"

import type { EventsState, EventsActions, SliceCreator } from "@/store/types"
import type { TeamSaveData } from "@/engine/save-types"
import { GameSave } from "@/engine"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import {
  nextDeterministicId,
  parseBoundedInt,
  MAX_TRANSFER_FEE,
} from "@/store/utils/helpers"

export const eventsInitialState: EventsState = {
  eventsLog: [],
  acknowledgedEventIds: [],
  newsFeed: [],
  financeLedger: [],
  transferHistory: [],
}

export const createEventsSlice: SliceCreator<EventsActions> = (set, get) => ({
  acknowledgeEvent: (eventId) => {
    set((state) => {
      const event = state.eventsLog.find(e => e.id === eventId)
      if (event) event.acknowledged = true
      if (!state.acknowledgedEventIds.includes(eventId)) {
        state.acknowledgedEventIds.push(eventId)
      }
    })
  },

  markAllEventsAsRead: () => {
    set((state) => {
      state.eventsLog.forEach(e => {
        e.acknowledged = true
        if (!state.acknowledgedEventIds.includes(e.id)) {
          state.acknowledgedEventIds.push(e.id)
        }
      })
    })
  },

  resolveEventChoice: (eventId, choiceId) => {
    set((state) => {
      const event = state.eventsLog.find(e => e.id === eventId)
      if (!event || event.selectedChoiceId) return

      // Apply Effects
      const runtimeEvent = event as any
      if (runtimeEvent.choices) {
        const choice = runtimeEvent.choices.find((c: any) => c.id === choiceId)
        if (!choice || !choice.effects) return

        const { morale, money, loyalty, reputation } = choice.effects
        const playerId = (event.data as any).playerId
        const teamId = (event.data as any).teamId || state.playerTeamId

        let resolvedTeam: TeamSaveData | undefined
        let normalizedMoney = 0

        if (teamId && (money || reputation)) {
          resolvedTeam = state.teams.find(t => t.id === teamId)
          if (!resolvedTeam) return

          const moneyValidation = parseBoundedInt(money || 0, "Event money effect", -MAX_TRANSFER_FEE, MAX_TRANSFER_FEE)
          if (!moneyValidation.ok) return
          normalizedMoney = moneyValidation.value

          if (normalizedMoney < 0 && resolvedTeam.budget < Math.abs(normalizedMoney)) {
            // Keep event unresolved so player can choose a different branch they can afford.
            return
          }
        }

        if (playerId && (morale || loyalty)) {
          const player = state.players.find(p => p.id === playerId)
          if (player) {
            if (morale) player.morale = Math.max(0, Math.min(100, player.morale + morale))
            if (loyalty) player.loyalty = Math.max(0, Math.min(100, player.loyalty + loyalty))
          }
        }

        if (resolvedTeam) {
          if (normalizedMoney !== 0) {
            resolvedTeam.budget += normalizedMoney
            state.financeLedger.push({
              id: nextDeterministicId(state, "fin_event", eventId),
              week: state.currentWeek,
              teamId: resolvedTeam.id,
              type: normalizedMoney > 0 ? "INCOME" : "EXPENSE",
              category: "OTHER",
              amount: Math.abs(normalizedMoney),
              description: choice.text || "Event resolution",
              balance: resolvedTeam.budget
            })
          }
          if (reputation) resolvedTeam.reputation = Math.max(0, Math.min(100, resolvedTeam.reputation + reputation))
        }
      }

      // Legend Coach Hire — special handling
      if (eventId.startsWith("legend_coach_opportunity_") && choiceId === "hire") {
        const legendData = event.data as any
        const team = state.teams.find(t => t.id === state.playerTeamId)
        if (team && legendData) {
          const salaryCost = legendData.salaryCost || 15000
          // Replace existing coach or add new one
          const existingCoachIdx = state.staff.findIndex(s => s.teamId === team.id && s.role === "coach")
          const legendCoach: any = {
            id: `legend_coach_${legendData.legendId}_${state.currentWeek}`,
            name: legendData.legendName || "Legend Coach",
            role: "coach" as const,
            level: 5, // Max level
            specialization: "legendary",
            salaryPerWeek: salaryCost,
            teamId: team.id,
            yearsRemaining: 2,
            portraitPath: legendData.legendPortrait,
            description: `Legendary coach ${legendData.legendName}`,
            nationality: "",
            rarity: "LEGENDARY",
            contractEndWeek: state.currentWeek + 104,
            xp: 0,
            xpToNextLevel: 1000,
            talentPoints: 0,
            unlockedTalentIds: [],
          }
          if (existingCoachIdx >= 0) {
            state.staff[existingCoachIdx] = legendCoach
          } else {
            state.staff.push(legendCoach)
          }
          // Deduct first week's salary and boost chemistry
          team.budget -= salaryCost
          team.chemistry = Math.min(100, (team.chemistry ?? 50) + 10)
          team.reputation = Math.min(100, team.reputation + 5)
        }
      }

      event.selectedChoiceId = choiceId
      event.acknowledged = true
      if (!state.acknowledgedEventIds.includes(eventId)) {
        state.acknowledgedEventIds.push(eventId)
      }
    })
  },

  addNewsItem: (item) => set(state => {
    const id = nextDeterministicId(state, "news")
    state.newsFeed.unshift({
      ...item,
      id,
      week: state.currentWeek
    })
    // Keep feed manageable
    if (state.newsFeed.length > 50) {
      state.newsFeed.pop()
    }
  }),

  acceptJobOffer: (eventId) => {
    let result = { success: false, message: "Unknown error" }
    set((state) => {
      // Find the event
      const event = state.eventsLog.find(e => e.id === eventId)
      if (!event || event.type !== "JOB_OFFER") {
        result = { success: false, message: "Job offer not found" }
        return
      }

      const offerData = event.data as any
      const newTeam = state.teams.find(t => t.id === offerData.offeringTeamId)
      if (!newTeam) {
        result = { success: false, message: "Team no longer exists" }
        return
      }

      // Check deadline
      if (state.currentWeek > offerData.deadlineWeek) {
        result = { success: false, message: "Offer has expired" }
        return
      }

      // === CRITICAL: Switch teams ===
      state.playerTeamId = newTeam.id

      // Mark event as acknowledged
      event.acknowledged = true
      event.selectedChoiceId = "ACCEPT"

      // Create a notification event
      state.eventsLog.unshift({
        id: nextDeterministicId(state, "job_transition", newTeam.id),
        week: state.currentWeek,
        type: "CAREER_UPDATE" as any,
        acknowledged: false,
        data: {
          title: `Welcome to ${newTeam.name}!`,
          message: `You have accepted the position as manager of ${newTeam.name}.`,
          severity: "success"
        }
      })

      result = {
        success: true,
        message: `Welcome to ${newTeam.name}!`
      }
    })
    return result
  },

  declineJobOffer: (eventId) => {
    set((state) => {
      JobOfferGenerator.declineJobOffer(state as unknown as GameSave, eventId)
    })
  },

  negotiateJobOffer: (eventId) => {
    let result = { success: false, message: "Unknown error" }
    set((state) => {
      result = JobOfferGenerator.negotiateJobOffer(state as unknown as GameSave, eventId)
    })
    return result
  },
})
