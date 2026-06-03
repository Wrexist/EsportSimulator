"use client"

/**
 * Transfer & contract slice.
 *
 * Six actions managing roster moves and contracts:
 *
 *   - transferPlayer — the workhorse. Handles release-to-FA, full
 *     trades, and free-agent signings. Validates fees + contracts,
 *     enforces strategic-refusal (won't trade to a near-future opponent),
 *     destination-roster cap (7), source/destination team budget,
 *     destination-already-owns guards. Updates ledger, transfer history,
 *     news feed, synergy, and (if player team) Steam achievement.
 *
 *   - listPlayerForTransfer / unlistPlayerForTransfer — toggle the
 *     `forSale` flag with bounded listing price.
 *
 *   - acceptTransferOffer — AI is offering for one of our players. Computes
 *     a tier-scaled salary + tournament-OVR-aware contract length, then
 *     delegates to transferPlayer. Refuses on match-week. Detects
 *     "sold for more than bought" for PROFIT_MASTER achievement.
 *
 *   - renewContract — +10% salary, +52 weeks. Requires 26 weeks of
 *     runway against the delta.
 *
 *   - promotePlayer — academy → senior roster. Drops the academy entry,
 *     clears any roster-slot mapping, creates a basic contract.
 */

import type { SliceCreator } from "@/store/types"
import type { TeamSaveData } from "@/engine/save-types"
import { checkAchievements } from "@/engine/steam-service"
import { soundManager } from "@/lib/sound-manager"
import { applyRosterChangePenalty } from "@/engine/chemistry-engine"
import { recalculateTeamSynergy } from "@/engine/processors/team-synergy-recalc"
import {
    nextDeterministicId,
    parseBoundedInt,
    MAX_TRANSFER_FEE,
    MAX_PLAYER_SALARY_PER_WEEK,
    MAX_CONTRACT_LENGTH_WEEKS,
} from "@/store/utils/helpers"

const MAX_ROSTER_SIZE = 7
const STRATEGIC_REFUSAL_LOOKAHEAD_WEEKS = 3
const RENEWAL_RUNWAY_WEEKS = 26
const RENEWAL_SALARY_MULTIPLIER = 1.1
const RENEWAL_EXTENSION_WEEKS = 52
const NEWS_FEED_CAP = 50
const MAX_FUTURE_WEEK = 100_000

const PROMOTION_CONTRACT_WEEKS_REMAINING = 104
const PROMOTION_SALARY_RATIO = 20_000 / 100
const PROMOTION_BUYOUT_RATIO = 400_000 / 100

export interface TransferContractActions {
    transferPlayer: (
        playerId: string,
        fromTeamId: string | null,
        toTeamId: string,
        fee: number,
        newContract?: { salaryPerWeek: number; startWeek: number; endWeek: number; buyout: number },
    ) => { success: boolean; message?: string }
    listPlayerForTransfer: (playerId: string, price: number) => void
    unlistPlayerForTransfer: (playerId: string) => void
    acceptTransferOffer: (eventId: string) => void
    renewContract: (playerId: string) => void
    promotePlayer: (playerId: string) => void
}

export const createTransferContractSlice: SliceCreator<TransferContractActions> = (set, get) => ({
    transferPlayer: (playerId, fromTeamId, toTeamId, fee, newContract) => {
        let result: { success: boolean; message?: string } = { success: false, message: "Unknown error" }
        set((state) => {
            // === Release-to-Free-Agency path ===
            // Triggered by the UI passing toTeamId === "FA".
            if (toTeamId === "FA") {
                const sourceTeam = fromTeamId && fromTeamId !== "FA"
                    ? (state.teams.find(t => t.id === fromTeamId))
                    : state.teams.find(t => t.rosterIds.includes(playerId))
                if (sourceTeam) {
                    sourceTeam.rosterIds = sourceTeam.rosterIds.filter(id => id !== playerId)
                    // Released player can't be in active role training.
                    if (sourceTeam.activeRoleTraining) {
                        const hadTraining = sourceTeam.activeRoleTraining.some(t => t.playerId === playerId)
                        sourceTeam.activeRoleTraining = sourceTeam.activeRoleTraining.filter(t => t.playerId !== playerId)
                        if (hadTraining) {
                            sourceTeam.trainingSlotsUsed = Math.max(0, (sourceTeam.trainingSlotsUsed || 0) - 1)
                        }
                    }
                    recalculateTeamSynergy(sourceTeam, state.players)
                }
                state.contracts = state.contracts.filter(c => c.playerId !== playerId)
                const releasedPlayer = state.players.find(p => p.id === playerId)
                if (releasedPlayer) {
                    releasedPlayer.forSale = false
                }
                result = { success: true, message: "Player released to free agency" }
                return
            }

            // === Trade / Signing path ===
            const toTeam = state.teams.find(t => t.id === toTeamId)
            if (!toTeam) {
                result = { success: false, message: "Target team not found" }
                return
            }

            const feeValidation = parseBoundedInt(fee, "Transfer fee", 0, MAX_TRANSFER_FEE)
            if (!feeValidation.ok) {
                result = { success: false, message: feeValidation.message }
                return
            }
            const normalizedFee = feeValidation.value

            const transferPlayerRecord = state.players.find(p => p.id === playerId)
            if (!transferPlayerRecord) {
                result = { success: false, message: "Player not found" }
                return
            }

            if (fromTeamId && fromTeamId !== "FA" && fromTeamId === toTeamId) {
                result = { success: false, message: "Cannot transfer a player to the same team" }
                return
            }

            if (toTeam.rosterIds.includes(playerId)) {
                result = { success: false, message: "Player is already on the destination team" }
                return
            }
            if (toTeam.rosterIds.length >= MAX_ROSTER_SIZE) {
                result = { success: false, message: `${toTeam.name} roster is full (max ${MAX_ROSTER_SIZE} players)` }
                return
            }

            // FA-signing of a player who's actually owned: refuse with the owner's name.
            let fromTeam: TeamSaveData | null = null
            if (!fromTeamId || fromTeamId === "FA") {
                const currentOwner = state.teams.find(t => t.rosterIds.includes(playerId))
                if (currentOwner) {
                    result = { success: false, message: `${currentOwner.name} currently owns this player` }
                    return
                }
            } else {
                // Real source team — also run the strategic-refusal check.
                fromTeam = state.teams.find(t => t.id === fromTeamId)
                    ?? null
                if (!fromTeam) {
                    result = { success: false, message: "Source team not found" }
                    return
                }
                if (!fromTeam.rosterIds.includes(playerId)) {
                    result = { success: false, message: "Player is not on the source team roster" }
                    return
                }

                // Strategic refusal: won't trade to a team we're playing in the next 3 weeks.
                const matches = state.scheduledMatches.filter(m =>
                    m.week >= state.currentWeek &&
                    m.week <= state.currentWeek + STRATEGIC_REFUSAL_LOOKAHEAD_WEEKS &&
                    ((m.homeTeamId === fromTeamId && m.awayTeamId === toTeamId)
                        || (m.homeTeamId === toTeamId && m.awayTeamId === fromTeamId))
                )
                if (matches.length > 0) {
                    const week = matches[0].week
                    result = {
                        success: false,
                        message: `Offer Rejected: "We play you in Week ${week}! We won't strengthen a rival before the match."`,
                    }
                    return
                }
            }

            // Validate any inbound contract.
            let normalizedContract: {
                salaryPerWeek: number; startWeek: number; endWeek: number; buyout: number
            } | undefined
            if (newContract) {
                const salaryValidation = parseBoundedInt(newContract.salaryPerWeek, "Contract salary", 1, MAX_PLAYER_SALARY_PER_WEEK)
                if (!salaryValidation.ok) { result = { success: false, message: salaryValidation.message }; return }
                const startWeekValidation = parseBoundedInt(newContract.startWeek, "Contract start week", 0, MAX_FUTURE_WEEK)
                if (!startWeekValidation.ok) { result = { success: false, message: startWeekValidation.message }; return }
                const endWeekValidation = parseBoundedInt(newContract.endWeek, "Contract end week", 1, MAX_FUTURE_WEEK)
                if (!endWeekValidation.ok) { result = { success: false, message: endWeekValidation.message }; return }
                const buyoutValidation = parseBoundedInt(newContract.buyout, "Contract buyout", 0, MAX_TRANSFER_FEE)
                if (!buyoutValidation.ok) { result = { success: false, message: buyoutValidation.message }; return }

                if (endWeekValidation.value <= startWeekValidation.value) {
                    result = { success: false, message: "Contract end week must be after start week" }
                    return
                }
                if (endWeekValidation.value - startWeekValidation.value > MAX_CONTRACT_LENGTH_WEEKS) {
                    result = { success: false, message: "Contract length exceeds maximum allowed duration" }
                    return
                }

                normalizedContract = {
                    salaryPerWeek: salaryValidation.value,
                    startWeek: startWeekValidation.value,
                    endWeek: endWeekValidation.value,
                    buyout: buyoutValidation.value,
                }
            }

            // Destination must be able to afford the fee.
            if (toTeam.budget < normalizedFee) {
                result = { success: false, message: `${toTeam.name} cannot afford this transfer fee.` }
                return
            }

            // Apply from-team side: drop roster entry, credit fee, clean training.
            if (fromTeam) {
                fromTeam.rosterIds = fromTeam.rosterIds.filter(id => id !== playerId)
                fromTeam.budget += normalizedFee

                if (fromTeam.activeRoleTraining) {
                    const hadTraining = fromTeam.activeRoleTraining.some(t => t.playerId === playerId)
                    fromTeam.activeRoleTraining = fromTeam.activeRoleTraining.filter(t => t.playerId !== playerId)
                    if (hadTraining) {
                        fromTeam.trainingSlotsUsed = Math.max(0, (fromTeam.trainingSlotsUsed || 0) - 1)
                    }
                }
            }

            // Apply to-team side: add to roster, debit fee.
            toTeam.rosterIds.push(playerId)
            toTeam.budget -= normalizedFee

            // Contract write — drop any existing contracts for this player first
            // so we never end up with two active contracts on the same ID.
            if (normalizedContract) {
                state.contracts = state.contracts.filter(c => c.playerId !== playerId)
                state.contracts.push({
                    playerId,
                    teamId: toTeamId,
                    salaryPerWeek: normalizedContract.salaryPerWeek,
                    startWeek: normalizedContract.startWeek,
                    endWeek: normalizedContract.endWeek,
                    buyout: normalizedContract.buyout,
                })
            }

            // Always clear the listing flag on a successful move.
            const updatedPlayer = state.players.find(p => p.id === playerId)
            if (updatedPlayer) {
                updatedPlayer.forSale = false
            }

            // Ledger entries (paired EXPENSE/INCOME on real trades).
            if (normalizedFee > 0) {
                const playerName = transferPlayerRecord.nickname || playerId
                state.financeLedger.push({
                    id: nextDeterministicId(state, "fin_transfer_out", playerId, toTeamId),
                    week: state.currentWeek,
                    teamId: toTeamId,
                    type: "EXPENSE",
                    category: "TRANSFER_OUT",
                    amount: normalizedFee,
                    description: `Transfer Fee: ${playerName}`,
                    balance: toTeam.budget,
                })

                if (fromTeamId && fromTeamId !== "FA" && fromTeam) {
                    state.financeLedger.push({
                        id: nextDeterministicId(state, "fin_transfer_in", playerId, fromTeamId),
                        week: state.currentWeek,
                        teamId: fromTeamId,
                        type: "INCOME",
                        category: "TRANSFER_IN",
                        amount: normalizedFee,
                        description: `Transfer Received: ${playerName}`,
                        balance: fromTeam.budget,
                    })
                }
            }

            // Transfer history + news headline.
            if (state.transferHistory) {
                const player = state.players.find(p => p.id === playerId)
                let fromName = "Free Agent"
                if (fromTeamId && fromTeamId !== "FA") {
                    const fTeam = state.teams.find(t => t.id === fromTeamId)
                    if (fTeam) fromName = fTeam.name
                }

                state.transferHistory.push({
                    id: `transfer_${state.currentWeek}_${playerId}_${toTeamId}_${state.transferHistory.length}`,
                    week: state.currentWeek,
                    type: "TRANSFER",
                    playerId,
                    playerName: player?.nickname || "Unknown",
                    fromTeamId: fromTeamId || null,
                    fromTeamName: fromName,
                    toTeamId,
                    toTeamName: toTeam.name,
                    fee: normalizedFee,
                })

                state.newsFeed.unshift({
                    id: nextDeterministicId(state, "news_tr", playerId, toTeamId),
                    title: `${player?.nickname || "Player"} joins ${toTeam.name}`,
                    content: `${player?.nickname || "Player"} has officially completed a move from ${fromName} to ${toTeam.name}. ${normalizedFee > 0 ? `The deal is estimated to be worth $${normalizedFee.toLocaleString()}.` : "The player joins as a free agent."}`,
                    category: "TRANSFER",
                    playerId,
                    teamId: toTeamId,
                    week: state.currentWeek,
                })
                if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
            }

            // Synergy + roster-change chemistry penalty for both teams.
            const recalcTeams: TeamSaveData[] = [toTeam]
            if (fromTeam) recalcTeams.push(fromTeam)
            for (const team of recalcTeams) {
                recalculateTeamSynergy(team, state.players)
                applyRosterChangePenalty(team, state.currentWeek, 1)
            }

            // Steam: First Transfer achievement (player-team only).
            if (toTeamId === state.playerTeamId || (fromTeamId && fromTeamId === state.playerTeamId)) {
                try {
                    checkAchievements({ completedTransfer: true })
                } catch {
                    // Silent fail for achievements — cosmetic only.
                }
            }

            result = { success: true, message: "Transfer successful" }
        })
        return result
    },

    listPlayerForTransfer: (playerId, price) => {
        set((state) => {
            const player = state.players.find(p => p.id === playerId)
            const normalizedPrice = parseBoundedInt(price, "Transfer listing price", 0, MAX_TRANSFER_FEE)
            if (!normalizedPrice.ok || !player) return

            player.forSale = true
            player.transferListingPrice = normalizedPrice.value
        })
    },

    unlistPlayerForTransfer: (playerId) => {
        set((state) => {
            const player = state.players.find(p => p.id === playerId)
            if (!player) return
            player.forSale = false
            player.transferListingPrice = undefined
        })
    },

    acceptTransferOffer: (eventId) => {
        const currentState = get()
        const event = currentState.eventsLog.find(e => e.id === eventId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!event || !event.data || event.type !== "TRANSFER_OFFER" || event.selectedChoiceId) return

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { playerId, teamId, offerAmount } = event.data as any
        const playerTeamId = get().playerTeamId

        // Refuse if we have a match this week — we need the roster intact.
        const freshState = get()
        const hasMatchThisWeek = freshState.scheduledMatches.some(m =>
            m.week === freshState.currentWeek &&
            (m.homeTeamId === playerTeamId || m.awayTeamId === playerTeamId)
        )
        if (hasMatchThisWeek) {
            get().addToast({
                message: "Cannot sell player! You have a match scheduled this week.",
                type: "info",
            })
            return
        }

        // Generate the AI's contract offer based on player OVR + buying
        // team tier. Snapshot state once so the three reads come from a
        // consistent point in time + use the O(1) indexes when available.
        const snapshot = get()
        const player = snapshot.players.find(p => p.id === playerId)
        const buyingTeam = snapshot.teams.find(t => t.id === teamId)
        const currentWeek = snapshot.currentWeek

        const playerOvr = player
            ? Math.round(
                ((player.rifle ?? 50) + (player.pistol ?? 50) + (player.awp ?? 50) +
                 (player.clutch ?? 50) + (player.creativity ?? 50) + (player.tactic ?? 50) +
                 (player.teamwork ?? 50)) / 7,
            )
            : 50
        const tierMult = buyingTeam?.leagueTier === "S_TIER" ? 1.5
            : buyingTeam?.leagueTier === "A_TIER" ? 1.2
            : buyingTeam?.leagueTier === "B_TIER" ? 1.0
            : 0.8
        const baseSalary = Math.round((playerOvr / 100) * 2000 * tierMult)
        const newSalary = Math.max(200, Math.min(baseSalary, (buyingTeam?.budget ?? 50000) / 52))
        // 2yr / 1.5yr / 1yr based on OVR.
        const contractLength = playerOvr >= 80 ? 104 : playerOvr >= 60 ? 78 : 52

        const transferResult = get().transferPlayer(
            playerId,
            playerTeamId,
            teamId,
            offerAmount,
            {
                salaryPerWeek: newSalary,
                startWeek: currentWeek,
                endWeek: currentWeek + contractLength,
                buyout: Math.round(newSalary * contractLength * 1.5),
            },
        )

        if (!transferResult.success) {
            get().addToast({
                message: transferResult.message || "Transfer failed.",
                type: "info",
            })
            return
        }

        // PROFIT_MASTER: sold for more than we originally paid.
        const latestTransferHistory = get().transferHistory
        const originalBuy = [...latestTransferHistory]
            .reverse()
            .find(r => r.playerId === playerId && r.toTeamId === playerTeamId && r.fee > 0)
        if (originalBuy && offerAmount > originalBuy.fee) {
            checkAchievements({ profitableSale: true })
        }

        // Mark the event resolved.
        set((draft) => {
            const liveEvent = draft.eventsLog.find(e => e.id === eventId)
            if (!liveEvent || liveEvent.selectedChoiceId) return
            liveEvent.selectedChoiceId = "accept"
            liveEvent.acknowledged = true
            if (!draft.acknowledgedEventIds.includes(eventId)) {
                draft.acknowledgedEventIds.push(eventId)
            }
        })

        // Audio cue lands after the state commit so the visual roster +
        // budget changes paint together with the sound.
        if (typeof window !== "undefined") {
            soundManager.play("contractSign")
        }
    },

    renewContract: (playerId) => {
        let toastMsg = ""
        let toastType: "info" | "warning" = "info"
        set((state) => {
            const contract = state.contracts.find(c => c.playerId === playerId)
            if (!contract) {
                toastMsg = "Contract not found."
                toastType = "warning"
                return
            }
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return

            // +10% salary, +52 weeks. Require at least 26 weeks of runway
            // against the *delta* (not the full salary) so renewals aren't
            // gated by absolute wage levels.
            const newSalary = Math.round(contract.salaryPerWeek * RENEWAL_SALARY_MULTIPLIER)
            const weeklyCost = newSalary - contract.salaryPerWeek
            const minBudgetNeeded = weeklyCost * RENEWAL_RUNWAY_WEEKS
            if (team.budget < minBudgetNeeded) {
                toastMsg = "Insufficient budget to renew this contract."
                toastType = "warning"
                return
            }

            contract.salaryPerWeek = newSalary
            contract.endWeek += RENEWAL_EXTENSION_WEEKS
            // NOTE: `minBudgetNeeded` is an affordability GATE (require runway
            // against the salary delta), not an upfront fee. It must not be
            // deducted — the raised weekly salary is already charged every week
            // by the finance processor. Deducting it here double-charged the
            // team 26× the delta with no ledger entry.
            toastMsg = "Contract renewed successfully."
            toastType = "info"
        })
        if (toastMsg) {
            get().addToast({ message: toastMsg, type: toastType })
        }
    },

    promotePlayer: (playerId) => {
        set((state) => {
            const team = state.teams.find(t => t.id === state.playerTeamId)
            if (!team) return

            // Phase 70 academy first: drop entry, clear slot binding, attach contract.
            const academyIdx = state.academyPlayers?.findIndex(p => p.playerId === playerId) ?? -1
            if (academyIdx >= 0 && state.academyPlayers) {
                const academyEntry = state.academyPlayers[academyIdx]
                if (team.rosterIds.length < MAX_ROSTER_SIZE) {
                    state.academyPlayers.splice(academyIdx, 1)

                    if (state.academyRoster) {
                        for (const role of Object.keys(state.academyRoster) as Array<keyof typeof state.academyRoster>) {
                            if (state.academyRoster[role] === academyEntry.id) {
                                state.academyRoster[role] = null
                            }
                        }
                    }
                    team.rosterIds.push(playerId)

                    // Basic contract scaled to player's potential.
                    const playerData = state.players.find(p => p.id === playerId)
                    const potential = playerData?.potential ?? 50
                    state.contracts.push({
                        playerId,
                        teamId: team.id,
                        salaryPerWeek: Math.floor(potential * PROMOTION_SALARY_RATIO),
                        // ContractSaveData uses startWeek/endWeek — the finance
                        // processor expires contracts on `endWeek <= currentWeek`.
                        // Previously this wrote a non-schema `weeksRemaining` with
                        // no endWeek, so promoted players had an undefined endWeek
                        // and their contract never expired (and payroll showed NaN).
                        startWeek: state.currentWeek,
                        endWeek: state.currentWeek + PROMOTION_CONTRACT_WEEKS_REMAINING,
                        buyout: Math.floor(potential * PROMOTION_BUYOUT_RATIO),
                    })
                }
                return
            }

            // Legacy: youthAcademyIds path (pre-Phase 70 saves).
            if (team.youthAcademyIds?.includes(playerId)) {
                team.youthAcademyIds = team.youthAcademyIds.filter(id => id !== playerId)
                if (team.rosterIds.length < MAX_ROSTER_SIZE) {
                    team.rosterIds.push(playerId)
                }
            }
        })
    },
})
