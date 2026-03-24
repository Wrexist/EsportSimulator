import { GameSave, FinanceLedgerEntry } from "../save-types"
import { EconomyEngine } from "../economy-engine" // You might need to check this path relative to processors
import { SeededRNG, generateSeed } from "../rng"
import { Team, EventType } from "@/types"

export interface FinanceProcessorResult {
    income: number
    expenses: number
    net: number
}

export class FinanceProcessor {
    static processFinance(
        save: GameSave,
        playerTeamId: string
    ): FinanceProcessorResult {
        let totalIncome = 0
        let totalExpenses = 0
        const rng = new SeededRNG(save.lastRngSeed || generateSeed())

        save.teams.forEach(team => {
            const report = EconomyEngine.processWeeklyFinances(
                team,
                save.players,
                save.contracts,
                save.staff
            )

            // Update Team State
            team.budget = report.newBalance
            team.financialState = report.state
            team.runwayWeeks = report.runwayWeeks
            team.weeklyNet = report.net

            // Deduct equipment weekly maintenance costs
            let equipmentCosts = 0
            if (team.equipment && team.equipment.length > 0) {
                for (const item of team.equipment) {
                    if (item.weeklyCost && item.weeklyCost > 0) {
                        equipmentCosts += item.weeklyCost
                    }
                }
                if (equipmentCosts > 0) {
                    team.budget -= equipmentCosts
                    if (team.id === playerTeamId) {
                        totalExpenses += equipmentCosts
                        save.financeLedger.push({
                            id: `exp_equip_${save.currentWeek}_${team.id}`,
                            week: save.currentWeek,
                            teamId: team.id,
                            type: "EXPENSE",
                            category: "FACILITIES",
                            amount: equipmentCosts,
                            description: "Equipment maintenance",
                            balance: team.budget
                        })
                    }
                }
            }

            // Apply Consequences based on State (Phase 8)
            if (report.state === "CRISIS" || report.state === "INSOLVENT") {
                // Morale Penalty for Crisis
                team.rosterIds.forEach(pid => {
                    const p = save.players.find(pl => pl.id === pid)
                    if (p) p.morale = Math.max(0, p.morale - 2)
                })
            }

            // Track consecutive insolvency for game-over (player team only)
            if (team.id === playerTeamId) {
                if (report.state === "INSOLVENT") {
                    team.consecutiveInsolventWeeks = (team.consecutiveInsolventWeeks ?? 0) + 1
                    // 8 consecutive weeks of insolvency = team dissolved
                    if (team.consecutiveInsolventWeeks >= 8) {
                        save.gameOverReason = "BANKRUPTCY"
                        save.gameOverWeek = save.currentWeek
                    }
                } else {
                    team.consecutiveInsolventWeeks = 0
                }
            }

            // Generate budget warning events for player team
            if (team.id === playerTeamId) {
                const prevState = team._prevFinancialState
                if (report.state !== "STABLE" && report.state !== prevState) {
                    const runway = Math.round(report.runwayWeeks);
                    const messages: Record<string, { desc: string; importance: string }> = {
                        TIGHT: { desc: `Budget is getting tight. You have ${runway} weeks of runway remaining. Consider reducing expenses.`, importance: "MEDIUM" },
                        RISK: { desc: `Financial warning! Only ${runway} weeks of runway left. Cut costs or find new income sources urgently.`, importance: "HIGH" },
                        CRISIS: { desc: `CRITICAL: Team finances in crisis! ${runway} weeks until insolvency. Players are losing morale.`, importance: "HIGH" },
                        INSOLVENT: { desc: `Team is INSOLVENT. Budget is depleted. Immediate action required to avoid collapse.`, importance: "HIGH" },
                    }
                    const msg = messages[report.state]
                    if (msg) {
                        save.eventsLog.unshift({
                            id: `budget_warning_${save.currentWeek}_${report.state}`,
                            week: save.currentWeek,
                            type: "BUDGET_WARNING",
                            data: { description: msg.desc, importance: msg.importance },
                            acknowledged: false,
                        })
                    }
                }
                team._prevFinancialState = report.state
            }

            if (team.id === playerTeamId) {
                totalIncome = report.income.total
                totalExpenses = report.expenses.total

                // Income Entries
                if (report.income.sponsors > 0) {
                    save.financeLedger.push({
                        id: `inc_spon_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "INCOME",
                        category: "SPONSOR",
                        amount: report.income.sponsors,
                        description: "Sponsorship payouts",
                        balance: team.budget
                    })
                }
                if (report.income.fanbase > 0) {
                    save.financeLedger.push({
                        id: `inc_fan_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "INCOME",
                        category: "OTHER", // Mapping Fanbase to OTHER or create MERCH? Let's use OTHER for now or fix types
                        amount: report.income.fanbase,
                        description: "Fanbase revenue",
                        balance: team.budget
                    })
                }

                // Expense Entries
                if (report.expenses.playerWages > 0) {
                    save.financeLedger.push({
                        id: `exp_wage_p_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "EXPENSE",
                        category: "WAGES_PLAYER",
                        amount: report.expenses.playerWages,
                        description: "Player salaries",
                        balance: team.budget
                    })
                }
                if (report.expenses.staffWages > 0) {
                    save.financeLedger.push({
                        id: `exp_wage_s_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "EXPENSE",
                        category: "WAGES_STAFF",
                        amount: report.expenses.staffWages,
                        description: "Staff salaries",
                        balance: team.budget
                    })
                }
                if (report.expenses.facilities > 0) {
                    save.financeLedger.push({
                        id: `exp_fac_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "EXPENSE",
                        category: "FACILITIES",
                        amount: report.expenses.facilities,
                        description: "Facilities upkeep",
                        balance: team.budget
                    })
                }

                // Phase 21: News (Finance Summary)
                if (save.newsFeed) {
                    const net = report.income.total - report.expenses.total
                    const isProfit = net >= 0
                    const newsId = `news_fin_${save.currentWeek}_${team.id}`

                    save.newsFeed.unshift({
                        id: newsId,
                        title: isProfit ? `Positive Earnings Reported for ${team.name}` : `${team.name} Reports Financial Deficit`,
                        content: `${team.name} finished the week with a net ${isProfit ? 'gain' : 'loss'} of $${Math.abs(net).toLocaleString()}. ${isProfit ? 'Management expresses confidence in the current growth trajectory.' : 'Questions are being raised regarding the team\'s current spending levels.'}`,
                        category: "FINANCE",
                        teamId: team.id,
                        week: save.currentWeek,
                        engagement: {
                            likes: rng.int(10, 209) + (isProfit ? 50 : 0),
                            views: rng.int(500, 2499)
                        }
                    })
                    if (save.newsFeed.length > 50) save.newsFeed.pop()
                }
            }
        })

        save.lastRngSeed = rng.getState()

        return {
            income: totalIncome,
            expenses: totalExpenses,
            net: totalIncome - totalExpenses,
        }
    }

    static processContractExpiry(save: GameSave, playerTeamId: string): void {
        // Early warning: alert player 4 weeks before contracts expire
        const WARNING_WEEKS = 4
        const soonExpiring = save.contracts.filter(c =>
            c.teamId === playerTeamId &&
            c.endWeek > save.currentWeek &&
            c.endWeek <= save.currentWeek + WARNING_WEEKS
        )
        for (const contract of soonExpiring) {
            const player = save.players.find(p => p.id === contract.playerId)
            if (!player) continue
            const weeksLeft = contract.endWeek - save.currentWeek
            const warnId = `contract_warn_${save.currentWeek}_${contract.playerId}`
            // Only push if we haven't already warned this week
            if (!save.eventsLog.some(e => e.id === warnId)) {
                save.eventsLog.unshift({
                    id: warnId,
                    type: "CONTRACT" as EventType,
                    week: save.currentWeek,
                    data: {
                        playerId: player.id,
                        description: `${player.nickname}'s contract expires in ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''}. Consider renewing.`,
                        weeksLeft,
                        importance: weeksLeft <= 1 ? "HIGH" : "MEDIUM"
                    },
                    acknowledged: false
                })
            }
        }

        // Process actual expirations
        const expiringContracts = save.contracts.filter(c => c.endWeek <= save.currentWeek)
        if (expiringContracts.length === 0) return

        expiringContracts.forEach(contract => {
            const team = save.teams.find(t => t.id === contract.teamId)
            const player = save.players.find(p => p.id === contract.playerId)

            if (team && player) {
                team.rosterIds = team.rosterIds.filter(id => id !== player.id)

                // Clean up active role training for departing player
                if (team.activeRoleTraining) {
                    team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== player.id)
                    team.trainingSlotsUsed = Math.max(0, (team.trainingSlotsUsed || 0) - 1)
                }

                if (team.id === playerTeamId) {
                    save.eventsLog.push({
                        id: `contract_expiry_${save.currentWeek}_${contract.teamId}_${contract.playerId}`,
                        type: "CONTRACT" as EventType,
                        week: save.currentWeek,
                        data: {
                            playerId: player.id,
                            description: `Contract expired for ${player.nickname}. They have left the team.`,
                            weeksLeft: 0
                        },
                        acknowledged: false
                    })
                }
            }
        })
        save.contracts = save.contracts.filter(c => c.endWeek > save.currentWeek)
    }
}
