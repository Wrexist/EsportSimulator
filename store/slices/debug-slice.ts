"use client"

/**
 * Debug slice.
 *
 * Holds all `debug*` actions that the DevTools panel calls. Every action
 * gates on `isDevToolsEnabled()` so production users never trigger them.
 *
 * Lookups inside set() go through state.teams.find() / state.players.find()
 * — see ARCHITECTURE.md on why Map-based index lookups inside producers
 * don't propagate mutations back to state.teams[i] / state.players[i].
 */

import type { DebugActions, SliceCreator } from "@/store/types"
import type { PlayerSaveData, GameSave } from "@/engine/save-types"
import { SeededRNG, generateSeed } from "@/engine/rng"
import { JobOfferGenerator } from "@/engine/job-offer-generator"
import { LEGENDARY_PLAYERS } from "@/engine/legendary-players-data"
import { isDevToolsEnabled } from "@/lib/runtime-flags"
import { nextDeterministicId, nextRandom } from "@/store/utils/helpers"

const debugToolsEnabled = () => isDevToolsEnabled()

export const createDebugSlice: SliceCreator<DebugActions> = (set, get) => ({
    debugAddFunds: (amount: number) => {
        if (!debugToolsEnabled()) return
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (team) {
                team.budget = (team.budget || 0) + amount
                state.financeLedger.push({
                    id: nextDeterministicId(state, "fin_debug", amount),
                    week: state.currentWeek,
                    teamId: team.id,
                    type: "INCOME",
                    category: "OTHER",
                    amount: amount,
                    description: "Dev Tools Injection",
                    balance: team.budget,
                })
            }
        })
    },

    debugHealAll: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            team.rosterIds.forEach(pid => {
                const player = state.players.find(p => p.id === pid)
                if (player) {
                    player.health = 100
                    player.fatigue = 0
                    player.form = 100
                    player.injury = undefined as any
                }
            })
        })
    },

    debugMaxMorale: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return
            team.rosterIds.forEach(pid => {
                const player = state.players.find(p => p.id === pid)
                if (player) {
                    player.morale = 100
                    player.loyalty = 100
                }
            })
            team.chemistry = 100
        })
    },

    debugTriggerJobOffer: () => {
        if (!debugToolsEnabled()) return
        set((state) => {
            const rng = new SeededRNG(state.lastRngSeed || generateSeed())
            JobOfferGenerator.forceJobOffer(state as unknown as GameSave, rng)
            state.lastRngSeed = rng.getState()
        })
    },

    debugFastForward: (weeks: number) => {
        if (!debugToolsEnabled()) return
        set((state) => {
            state.currentWeek += weeks
        })
    },

    debugTriggerCelebration: () => set((state) => {
        if (!debugToolsEnabled()) return
        state.pendingCelebration = {
            tournamentId: "major_copenhagen",
            tournamentName: "Copenhagen Major 2025",
            tier: "S_TIER",
            prize: 1250000,
            repGain: 25,
            fanGain: 250000,
            week: state.currentWeek,
            logoPath: "/assets/tournaments/logo_copenhagen_major.png",
            trophyPath: "/assets/tournaments/trophy_gold_new.png",
        }
    }),

    debugTriggerInjury: (playerId) => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        const targetId = playerId || myTeam?.rosterIds[0]
        const player = state.players.find(p => p.id === targetId)
        if (!player) return

        player.injury = {
            type: "RSI",
            name: "Debug Repetitive Strain",
            description: "Forced injury for testing purposes.",
            severity: "MINOR",
            weeksRemaining: 3,
            isRecovering: true,
        }
        state.toasts.push({
            id: nextDeterministicId(state, "toast_injury_debug", player.id),
            message: `${player.nickname} injured (DEBUG)`,
            type: "info",
        })
        state.eventsLog.unshift({
            id: nextDeterministicId(state, "evt_injury_debug", player.id),
            type: "INJURY" as any,
            week: state.currentWeek,
            acknowledged: false,
            data: {
                playerId: player.id,
                title: "Debug Injury",
                message: "Debug injury triggered.",
                severity: "error",
            },
        })
    }),

    debugTriggerLegendPick: () => set((state) => {
        if (!debugToolsEnabled()) return
        const alreadySigned = state.signedLegendIds || []
        const available = LEGENDARY_PLAYERS.filter(lp => !alreadySigned.includes(lp.id))
        if (available.length < 3) {
            state.toasts.push({
                id: nextDeterministicId(state, "toast_debug"),
                message: "Not enough unsigned legends remaining!",
                type: "info",
            })
            return
        }
        // Fisher-Yates shuffle using the state RNG for determinism.
        const shuffled = [...available]
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(nextRandom(state) * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        state.pendingLegendPick = {
            tournamentName: "Debug Major Test",
            candidates: shuffled.slice(0, 3).map(p => p.id),
            week: state.currentWeek,
        }
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: "Legend Pick triggered!",
            type: "info",
        })
    }),

    debugTriggerSeasonRecap: () => set((state) => {
        if (!debugToolsEnabled()) return
        state.pendingSeasonRecap = state.currentWeek
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: "Season Recap triggered!",
            type: "info",
        })
    }),

    debugTriggerRetirement: () => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return
        const rosterPlayers = myTeam.rosterIds
            .map(id => state.players.find(p => p.id === id))
            .filter(Boolean) as PlayerSaveData[]
        const candidate = rosterPlayers
            .filter(p => !p.isRetired && !p.isLegendary && p.age >= 20)
            .sort((a, b) => b.age - a.age)[0]
        if (!candidate) {
            state.toasts.push({
                id: nextDeterministicId(state, "toast_debug"),
                message: "No eligible player to retire!",
                type: "info",
            })
            return
        }
        candidate.isRetired = true
        candidate.retirementWeek = state.currentWeek
        myTeam.rosterIds = myTeam.rosterIds.filter(id => id !== candidate.id)
        if (myTeam.activeRoleTraining) {
            myTeam.activeRoleTraining = myTeam.activeRoleTraining.filter((t: any) => t.playerId !== candidate.id)
        }
        state.contracts = state.contracts.filter(c => c.playerId !== candidate.id)
        if (state.newsFeed) {
            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_retirement_debug", candidate.id),
                title: `${candidate.nickname} announces retirement (DEBUG)`,
                content: `${candidate.nickname} has retired from professional esports at age ${candidate.age}.`,
                category: "RETIREMENT",
                playerId: candidate.id,
                teamId: myTeam.id,
                week: state.currentWeek,
                engagement: { likes: 1000, views: 5000 },
            })
        }
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: `${candidate.nickname} (age ${candidate.age}) retired!`,
            type: "info",
        })
    }),

    debugBoostPlayerSkill: (playerId, amount = 5) => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = state.players.find(p => p.id === targetId)
        if (!player) return
        player.skill = Math.min(99, player.skill + amount)
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: `${player.nickname} skill +${amount} → ${player.skill}`,
            type: "level_up",
        })
    }),

    debugMaxAllSkills: () => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return
        let count = 0
        myTeam.rosterIds.forEach(id => {
            const player = state.players.find(p => p.id === id)
            if (player) {
                player.skill = 99
                count++
            }
        })
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: `${count} players set to skill 99!`,
            type: "level_up",
        })
    }),

    debugTriggerTransferOffer: () => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam || myTeam.rosterIds.length === 0) return
        const bestPlayer = myTeam.rosterIds
            .map(id => state.players.find(p => p.id === id))
            .filter(Boolean)
            .sort((a: any, b: any) => b.skill - a.skill)[0] as PlayerSaveData | undefined
        if (!bestPlayer) return
        const aiTeam = state.teams.find(t => t.id !== state.playerTeamId && t.tier === "ELITE")
        if (!aiTeam) return
        const offerAmount = Math.round(bestPlayer.skill * 5000 + 100000)
        state.eventsLog.unshift({
            id: nextDeterministicId(state, "evt_transfer_debug", bestPlayer.id),
            type: "TRANSFER_OFFER" as any,
            week: state.currentWeek,
            acknowledged: false,
            data: {
                playerId: bestPlayer.id,
                teamId: aiTeam.id,
                teamName: aiTeam.name,
                playerName: bestPlayer.nickname,
                title: `${aiTeam.name} wants to sign ${bestPlayer.nickname}`,
                message: `${aiTeam.name} has offered $${offerAmount.toLocaleString()} for ${bestPlayer.nickname} (skill ${bestPlayer.skill}).`,
                offerAmount,
                severity: "info",
            },
        } as any)
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: `Transfer offer for ${bestPlayer.nickname}!`,
            type: "info",
        })
    }),

    debugAddXP: (playerId, amount = 500) => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = state.players.find(p => p.id === targetId)
        if (!player) return
        player.xp = (player.xp || 0) + amount
        const xpNeeded = (player.level || 1) * 1000
        if (player.xp >= xpNeeded) {
            player.xp -= xpNeeded
            player.level = (player.level || 1) + 1
            player.talentPoints = (player.talentPoints || 0) + 1
            state.toasts.push({
                id: nextDeterministicId(state, "toast_debug"),
                message: `${player.nickname} LEVELED UP to ${player.level}!`,
                type: "level_up",
            })
        } else {
            state.toasts.push({
                id: nextDeterministicId(state, "toast_debug"),
                message: `${player.nickname} +${amount} XP (${player.xp}/${xpNeeded})`,
                type: "xp_gain",
            })
        }
    }),

    debugSetPlayerAge: (playerId, age = 37) => set((state) => {
        if (!debugToolsEnabled()) return
        const myTeam = state.teams.find(t => t.id === state.playerTeamId)
        if (!myTeam) return
        const targetId = playerId || myTeam.rosterIds[0]
        const player = state.players.find(p => p.id === targetId)
        if (!player) return
        player.age = age
        state.toasts.push({
            id: nextDeterministicId(state, "toast_debug"),
            message: `${player.nickname} age set to ${age}`,
            type: "info",
        })
    }),
})
