"use client"

/**
 * Events slice.
 *
 * Holds the seven event-driven store actions:
 *   - acknowledgeEvent / markAllEventsAsRead — read state bookkeeping
 *   - resolveEventChoice — applies a choice's effects (morale, money,
 *     loyalty, reputation) plus special-case Legend-Coach hire path
 *   - addNewsItem — push to newsFeed with capped length
 *   - acceptJobOffer / declineJobOffer / negotiateJobOffer — career-move
 *     handlers (last two delegate to JobOfferGenerator)
 *
 * All entity lookups inside set() go through state.teams.find() /
 * state.players.find() — see ARCHITECTURE.md on why _teamIndex.get()
 * mutations don't propagate to state.teams[i] under Immer.
 */

import type { EventsActions, SliceCreator } from "@/store/types"
import type { GameSave, TeamSaveData } from "@/engine/save-types"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import {
    nextDeterministicId,
    parseBoundedInt,
    MAX_TRANSFER_FEE,
} from "@/store/utils/helpers"

const NEWS_FEED_CAP = 50

export const createEventsSlice: SliceCreator<EventsActions> = (set) => ({
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
            // O(1) membership via a Set rather than `.includes` inside the
            // loop (was O(events × acknowledged) on long campaigns).
            const acked = new Set(state.acknowledgedEventIds)
            state.eventsLog.forEach(e => {
                e.acknowledged = true
                if (!acked.has(e.id)) {
                    acked.add(e.id)
                    state.acknowledgedEventIds.push(e.id)
                }
            })
        })
    },

    resolveEventChoice: (eventId, choiceId) => {
        set((state) => {
            const event = state.eventsLog.find(e => e.id === eventId)
            if (!event || event.selectedChoiceId) return

            // Apply standard effect bundle (morale / money / loyalty / reputation)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- event data shape varies by event type
            const runtimeEvent = event as any
            if (runtimeEvent.choices) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const choice = runtimeEvent.choices.find((c: any) => c.id === choiceId)
                if (!choice || !choice.effects) return

                const { morale, money, loyalty, reputation } = choice.effects
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const playerId = (event.data as any).playerId
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const teamId = (event.data as any).teamId || state.playerTeamId

                let resolvedTeam: TeamSaveData | undefined
                let normalizedMoney = 0

                if (teamId && (money || reputation)) {
                    resolvedTeam = state.teams.find(t => t.id === teamId)
                    if (!resolvedTeam) return

                    const moneyValidation = parseBoundedInt(
                        money || 0,
                        "Event money effect",
                        -MAX_TRANSFER_FEE,
                        MAX_TRANSFER_FEE,
                    )
                    if (!moneyValidation.ok) return
                    normalizedMoney = moneyValidation.value

                    // Refuse choices that would overdraw — keep the event
                    // unresolved so the player can pick a different branch.
                    if (normalizedMoney < 0 && resolvedTeam.budget < Math.abs(normalizedMoney)) {
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
                            balance: resolvedTeam.budget,
                        })
                    }
                    if (reputation) {
                        resolvedTeam.reputation = Math.max(0, Math.min(100, resolvedTeam.reputation + reputation))
                    }
                }
            }

            // Legend-Coach Hire — special-case event handler that replaces
            // (or appends) the team's coach with a max-level legend.
            if (eventId.startsWith("legend_coach_opportunity_") && choiceId === "hire") {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const legendData = event.data as any
                const team = state.teams.find(t => t.id === state.playerTeamId)
                if (team && legendData) {
                    const salaryCost = legendData.salaryCost || 15000
                    const existingCoachIdx = state.staff.findIndex(s => s.teamId === team.id && s.role === "coach")
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const legendCoach: any = {
                        id: `legend_coach_${legendData.legendId}_${state.currentWeek}`,
                        name: legendData.legendName || "Legend Coach",
                        role: "coach" as const,
                        level: 5,
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
                    // Deduct first week's salary up-front and boost team buffs.
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

    addNewsItem: (item) => set((state) => {
        const id = nextDeterministicId(state, "news")
        state.newsFeed.unshift({
            ...item,
            id,
            week: state.currentWeek,
        })
        // Bound the feed so long campaigns don't bloat the save.
        if (state.newsFeed.length > NEWS_FEED_CAP) {
            state.newsFeed.pop()
        }
    }),

    acceptJobOffer: (eventId) => {
        let result = { success: false, message: "Unknown error" }
        set((state) => {
            const event = state.eventsLog.find(e => e.id === eventId)
            if (!event || event.type !== "JOB_OFFER") {
                result = { success: false, message: "Job offer not found" }
                return
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const offerData = event.data as any
            const newTeam = state.teams.find(t => t.id === offerData.offeringTeamId)
            if (!newTeam) {
                result = { success: false, message: "Team no longer exists" }
                return
            }

            if (state.currentWeek > offerData.deadlineWeek) {
                result = { success: false, message: "Offer has expired" }
                return
            }

            // === CRITICAL: switch the player's team ===
            state.playerTeamId = newTeam.id

            event.acknowledged = true
            event.selectedChoiceId = "ACCEPT"

            state.eventsLog.unshift({
                id: nextDeterministicId(state, "job_transition", newTeam.id),
                week: state.currentWeek,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: "CAREER_UPDATE" as any,
                acknowledged: false,
                data: {
                    title: `Welcome to ${newTeam.name}!`,
                    message: `You have accepted the position as manager of ${newTeam.name}.`,
                    severity: "success",
                },
            })

            result = {
                success: true,
                message: `Welcome to ${newTeam.name}!`,
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
        let result: { success: boolean; message: string; newOffer?: number; withdrew?: boolean } =
            { success: false, message: "Unknown error" }
        set((state) => {
            result = JobOfferGenerator.negotiateJobOffer(state as unknown as GameSave, eventId)
        })
        return result
    },
})
