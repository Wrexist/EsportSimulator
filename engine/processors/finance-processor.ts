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
        playerTeamId: string,
        eventIdSet?: Set<string>,
        ledgerIdSet?: Set<string>
    ): FinanceProcessorResult {
        let totalIncome = 0
        let totalExpenses = 0
        const rng = new SeededRNG(save.lastRngSeed || generateSeed())

        // Idempotency guards: like every other week-processor step, dedup ledger
        // and event pushes by their deterministic IDs so a replayed/resumed week
        // can't double-charge wages or re-emit a budget warning. When the caller
        // doesn't thread a set (e.g. unit tests), fall back to the live arrays so
        // the guard is still correct, just O(n) instead of O(1).
        const ledgerIds = ledgerIdSet ?? new Set(save.financeLedger.map(e => e.id))
        const eventIds = eventIdSet ?? new Set(save.eventsLog.map(e => e.id))
        const pushLedger = (entry: FinanceLedgerEntry): void => {
            if (ledgerIds.has(entry.id)) return
            save.financeLedger.push(entry)
            ledgerIds.add(entry.id)
        }

        // Build player map for O(1) lookups inside team roster loops
        const playerMap = new Map<string, typeof save.players[0]>()
        save.players.forEach(p => playerMap.set(p.id, p))

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
                    // Guard against NaN from corrupt equipment cost data
                    if (!Number.isFinite(team.budget)) team.budget = report.newBalance
                    if (team.id === playerTeamId) {
                        // Equipment is folded into totalExpenses below where
                        // we read report.expenses.total + equipmentCosts.
                        pushLedger({
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
                    // Recalculate financial state to reflect equipment deduction
                    // (report.state was computed before equipment costs were applied)
                    const burnRate = Math.abs(Math.min(0, report.net)) + equipmentCosts
                    const updatedRunway = burnRate > 0 ? team.budget / burnRate : 999
                    if (team.budget <= 0)        team.financialState = "INSOLVENT"
                    else if (updatedRunway < 3)  team.financialState = "CRISIS"
                    else if (updatedRunway < 6)  team.financialState = "RISK"
                    else if (updatedRunway < 12) team.financialState = "TIGHT"
                    else                         team.financialState = "STABLE"
                    team.runwayWeeks = Math.floor(updatedRunway)
                    // Reflect equipment upkeep in the reported net too — AI
                    // economy decisions read team.weeklyNet, so leaving it at the
                    // pre-equipment value lets cash-negative AI act as if positive.
                    team.weeklyNet = report.net - equipmentCosts
                }
            }

            // Apply Consequences based on State (Phase 8).
            // Use the POST-equipment financial state — equipment costs may
            // have pushed the team from STABLE down to CRISIS / INSOLVENT
            // even though report.state (pre-equipment) was still healthy.
            if (team.financialState === "CRISIS" || team.financialState === "INSOLVENT") {
                team.rosterIds.forEach(pid => {
                    const p = playerMap.get(pid)
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
                    const warnId = `budget_warning_${save.currentWeek}_${report.state}`
                    if (msg && !eventIds.has(warnId)) {
                        save.eventsLog.unshift({
                            id: warnId,
                            week: save.currentWeek,
                            type: "BUDGET_WARNING",
                            data: { description: msg.desc, importance: msg.importance },
                            acknowledged: false,
                        })
                        eventIds.add(warnId)
                    }
                }
                team._prevFinancialState = report.state
            }

            if (team.id === playerTeamId) {
                totalIncome = report.income.total
                // report.expenses.total excludes equipment maintenance; add it
                // back so the returned summary matches what was actually
                // deducted from the budget and recorded in the ledger.
                totalExpenses = report.expenses.total + equipmentCosts

                // Income Entries
                if (report.income.sponsors > 0) {
                    pushLedger({
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
                    pushLedger({
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
                    pushLedger({
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
                    pushLedger({
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
                    pushLedger({
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
        // Build Set of existing event IDs for O(1) duplicate checks
        const existingEventIds = new Set(save.eventsLog.map(e => e.id))

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
            if (!existingEventIds.has(warnId)) {
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

                const expiryId = `contract_expiry_${save.currentWeek}_${contract.teamId}_${contract.playerId}`
                if (team.id === playerTeamId && !existingEventIds.has(expiryId)) {
                    save.eventsLog.push({
                        id: expiryId,
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
