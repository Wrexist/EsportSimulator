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
import type { GameSave } from "@/engine/save-types"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import { applyChoiceEffects, type ChoiceEffects, type ChoiceTarget } from "@/engine/event-choice"
import { answerPressConference, type PressTarget } from "@/engine/storylines/press"
import { getArchetype } from "@/engine/personality"
import { PERSONALITY_TUNING } from "@/lib/balance-tuning"
import { generateSocialPosts } from "@/lib/social-generator"
import { nextDeterministicId } from "@/store/utils/helpers"

import { formatCurrency } from "@/lib/utils-extended"
const NEWS_FEED_CAP = 50
// ~7-8 in-game weeks of timeline at ~8 posts/week; bounds multi-season saves.
const SOCIAL_FEED_CAP = 60

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
            if (!event || event.selectedChoiceId || event.data.isWithdrawn || state.gameOverReason) return
            if (event.type === "JOB_OFFER") return
            if (typeof event.data.deadlineWeek === 'number' && state.currentWeek > event.data.deadlineWeek) return
            if (event.data.playerId && !state.teams.find(t => t.id === state.playerTeamId)?.rosterIds.includes(String(event.data.playerId))) return
            if (event.type === "TRANSFER_OFFER") {
                // Accepting a bid goes through acceptTransferOffer (fee, contract,
                // roster move); only the effect-free "reject" resolves here. The
                // own-club guard below would block it: a bid's teamId is the
                // bidding club, which made Reject a dead button.
                if (choiceId !== "reject") return
            } else if (event.data.teamId && event.data.teamId !== state.playerTeamId) return

            // Apply the standard effect bundle (engine/event-choice.ts — the
            // same code applies an unanswered decision's default). A team
            // event (no playerId) moves the whole roster; an unaffordable
            // answer is refused and the event stays open.
            if (event.choices) {
                const choice = event.choices.find(c => c.id === choiceId)
                if (!choice || !choice.effects) return
                const applied = applyChoiceEffects(state as unknown as ChoiceTarget, event, choice.effects as ChoiceEffects, {
                    id: () => nextDeterministicId(state, "fin_event", eventId),
                    description: choice.text || "Event resolution",
                })
                if (!applied) return
            }

            // Legend-Coach Hire — special-case event handler that replaces
            // (or appends) the team's coach with a max-level legend.
            if (eventId.startsWith("legend_coach_opportunity_") && choiceId === "hire") {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const legendData = event.data as any
                const team = state.teams.find(t => t.id === state.playerTeamId)
                if (team && legendData) {
                    const salaryCost = legendData.salaryCost || 15000
                    // Refuse without consuming the choice — the event stays
                    // answerable once the team can actually pay. This was the
                    // one player-facing debit with no affordability guard
                    // (budget went straight negative on a $15k hire).
                    if (team.budget < salaryCost) {
                        state.toasts.push({
                            id: nextDeterministicId(state, "toast_legend_coach_funds"),
                            message: `Insufficient funds — hiring requires ${formatCurrency(salaryCost, "$", false)} up front`,
                            type: "warning",
                        })
                        return
                    }
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
                        const replacedId = state.staff[existingCoachIdx].id
                        team.staffIds = team.staffIds.filter(id => id !== replacedId)
                        state.staff[existingCoachIdx] = legendCoach
                    } else {
                        state.staff.push(legendCoach)
                    }
                    // Weekly wages are paid from team.staffIds (EconomyEngine);
                    // without this the legend's salary was never charged.
                    if (!team.staffIds.includes(legendCoach.id)) team.staffIds.push(legendCoach.id)
                    // Deduct first week's salary up-front and boost team buffs.
                    team.budget -= salaryCost
                    state.financeLedger.push({
                        id: nextDeterministicId(state, "fin_legend_coach", team.id),
                        week: state.currentWeek,
                        teamId: team.id,
                        type: "EXPENSE",
                        category: "WAGES_STAFF",
                        amount: salaryCost,
                        description: `Legend coach signing — ${legendData.legendName || "Legend Coach"}`,
                        balance: team.budget,
                    })
                    team.chemistry = Math.min(100, (team.chemistry ?? 50) + 10)
                    team.reputation = Math.min(100, team.reputation + 5)
                }
            }

            // Phase 5.2: a Mercenary follows the money — turning a bid down costs him morale.
            if (event.type === "TRANSFER_OFFER" && choiceId === "reject") {
                const bidFor = state.players.find(p => p.id === String(event.data.playerId ?? ""))
                if (bidFor && getArchetype(bidFor) === "MERCENARY") {
                    bidFor.morale = Math.max(0, Math.min(100, bidFor.morale + PERSONALITY_TUNING.MERCENARY_BID_REJECT_MORALE))
                }
            }

            event.selectedChoiceId = choiceId
            // When it was settled: a settled family stays quiet for a few
            // weeks (engine/decision-deadlines.ts cooldowns).
            event.data.resolvedWeek = state.currentWeek
            event.acknowledged = true
            if (!state.acknowledgedEventIds.includes(eventId)) {
                state.acknowledgedEventIds.push(eventId)
            }
        })
    },

    // Phase 5.3: every chosen answer applies through the shared effect code
    // (engine/event-choice.ts); refused once the match has been played.
    answerPressConference: (eventId, answers) => {
        let result = { ok: false, message: "Press conference not found." }
        set((state) => {
            const r = answerPressConference(state as unknown as PressTarget, eventId, answers)
            result = { ok: r.ok, message: r.message }
        })
        return result
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

    syncSocialFeed: () => set((state) => {
        const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!playerTeam) return

        const generated = generateSocialPosts({
            playerTeam,
            teams: state.teams,
            players: state.players,
            staff: state.staff,
            completedMatches: state.completedMatches,
            scheduledMatches: state.scheduledMatches,
            currentWeek: state.currentWeek,
            saveId: state.saveId || "local",
        })

        if (!state.socialFeed) state.socialFeed = []
        // Deterministic ids → merging by id is idempotent within a week and
        // never clobbers player-authored posts (distinct id prefix).
        const existing = new Set(state.socialFeed.map(p => p.id))
        const fresh = generated.filter(p => !existing.has(p.id))
        if (fresh.length === 0) return

        state.socialFeed.unshift(...fresh)
        // Keep newest by week, capped, so multi-season feeds stay lean.
        if (state.socialFeed.length > SOCIAL_FEED_CAP) {
            state.socialFeed = [...state.socialFeed]
                .sort((a, b) => b.week - a.week)
                .slice(0, SOCIAL_FEED_CAP)
        }
    }),

    publishSocialPost: (content) => set((state) => {
        const trimmed = content.trim().slice(0, 280)
        if (!trimmed) return
        const playerTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!playerTeam) return

        if (!state.socialFeed) state.socialFeed = []

        // NPC engagement on the player's own post scales with their following.
        const followers = playerTeam.followers || playerTeam.fanbase || 5000
        const reach = Math.max(1, Math.log10(Math.max(10, followers)) / 2)
        const likes = Math.floor(followers * 0.04 * reach)

        state.socialFeed.unshift({
            id: nextDeterministicId(state, "social_post"),
            week: state.currentWeek,
            teamId: playerTeam.id,
            authoredByPlayer: true,
            user: {
                name: playerTeam.name,
                handle: `@${playerTeam.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 15) || "myteam"}`,
                avatar: playerTeam.name.substring(0, 2).toUpperCase(),
                isVerified: true,
            },
            content: trimmed,
            timestamp: "now",
            likes,
            retweets: Math.floor(likes * 0.2),
            replies: Math.floor(likes * 0.1),
        })
        if (state.socialFeed.length > SOCIAL_FEED_CAP) {
            state.socialFeed = [...state.socialFeed]
                .sort((a, b) => b.week - a.week)
                .slice(0, SOCIAL_FEED_CAP)
        }
    }),

    acceptJobOffer: (eventId) => {
        let result = { success: false, message: "Offer not found" }
        set(state => { result = JobOfferGenerator.acceptJobOffer(state as unknown as GameSave, eventId) })
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
