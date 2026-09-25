import { GameSave, FinanceLedgerEntry } from "../save-types"
import { EconomyEngine } from "../economy-engine" // You might need to check this path relative to processors
import { SeededRNG } from "../rng"
import { EventType } from "@/types"

export interface FinanceProcessorResult {
    income: number
    expenses: number
    net: number
}

export class FinanceProcessor {
    /** Reconcile bills with prize/transfer income settled later in this tick. */
    static reconcileWeeklySolvency(save: GameSave, playerTeamId: string): void {
        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team || team.financeSettlement?.week !== save.currentWeek || !Number.isFinite(team.budget) || team.budget <= 0) return
        const net = team.weeklyNet ?? 0
        const runway = net < 0 ? team.budget / Math.abs(net) : 999
        team.runwayWeeks = runway
        team.financialState = EconomyEngine.determineState(team.budget, runway)
        team._prevFinancialState = team.financialState
        team.consecutiveInsolventWeeks = 0
        // Never revive an earlier terminal career or undo a board dismissal.
        if (save.gameOverReason === "BANKRUPTCY" && save.gameOverWeek === save.currentWeek) {
            delete save.gameOverReason
            delete save.gameOverWeek
        }
        save.eventsLog = save.eventsLog.filter(event => event.id !== `budget_warning_${save.currentWeek}_INSOLVENT`)
    }

    static processFinance(
        save: GameSave,
        playerTeamId: string,
        eventIdSet?: Set<string>,
        ledgerIdSet?: Set<string>
    ): FinanceProcessorResult {
        let totalIncome = 0
        let totalExpenses = 0
        const rng = new SeededRNG(save.lastRngSeed ?? 1)

        // Idempotency guards: like every other week-processor step, dedup ledger
        // and event pushes by their deterministic IDs so a replayed/resumed week
        // can't double-charge wages or re-emit a budget warning. When the caller
        // doesn't thread a set (e.g. unit tests), fall back to the live arrays so
        // the guard is still correct, just O(n) instead of O(1).
        const ledgerIds = ledgerIdSet ?? new Set(save.financeLedger.map(e => e.id))
        const eventIds = eventIdSet ?? new Set(save.eventsLog.map(e => e.id))
        // Older builds posted all teams synchronously but kept receipts only for
        // the managed club. Its league payment proves that batch already ran.
        const legacySettled = !save.teams.some(t => t.financeSettlement)
            && ledgerIds.has(`inc_league_${save.currentWeek}_${playerTeamId}`)
        const legacyRows = legacySettled ? save.financeLedger.filter(e =>
            e.week === save.currentWeek && e.teamId === playerTeamId &&
            /^(inc_spon_|inc_fan_|inc_league_|exp_equip_|exp_wage_p_|exp_wage_s_|exp_fac_)/.test(e.id)) : []
        const pushLedger = (entry: FinanceLedgerEntry): void => {
            if (ledgerIds.has(entry.id)) return
            save.financeLedger.push(entry)
            ledgerIds.add(entry.id)
        }

        // Build player map for O(1) lookups inside team roster loops
        const playerMap = new Map<string, typeof save.players[0]>()
        save.players.forEach(p => playerMap.set(p.id, p))

        save.teams.forEach(team => {
            if (team.financeSettlement && team.financeSettlement.week >= save.currentWeek) {
                if (team.id === playerTeamId && team.financeSettlement.week === save.currentWeek) {
                    totalIncome = team.financeSettlement.income
                    totalExpenses = team.financeSettlement.expenses
                }
                return
            }
            const report = EconomyEngine.processWeeklyFinances(
                team,
                save.players,
                save.contracts,
                save.staff,
                save.currentWeek,
                team.id === playerTeamId ? (save.academyPlayers?.length ?? 0) : (team.managementState?.academyPlayers?.length ?? 0),
            )

            if (legacySettled) {
                const income = team.id === playerTeamId ? legacyRows.filter(e => e.type === "INCOME").reduce((n, e) => n + e.amount, 0) : report.income.total
                const expenses = team.id === playerTeamId ? legacyRows.filter(e => e.type === "EXPENSE").reduce((n, e) => n + e.amount, 0) : report.expenses.total
                team.financeSettlement = { week: save.currentWeek, income, expenses }
                if (team.id === playerTeamId) { totalIncome = income; totalExpenses = expenses }
                return
            }
            const openingBalance = team.budget

            // Update Team State
            team.budget = report.newBalance
            team.financialState = report.state
            team.runwayWeeks = report.runwayWeeks
            team.weeklyNet = report.net

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

            // Track consecutive insolvency for game-over (player team only).
            // Use the POST-equipment team.financialState (set above), not the
            // stale pre-equipment report.state — equipment upkeep can push a
            // team from healthy into INSOLVENT, and reading report.state here
            // would reset the counter every week so the bankruptcy game-over
            // could never fire for an equipment-driven insolvency.
            if (team.id === playerTeamId) {
                if (team.financialState === "INSOLVENT") {
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
                        INSOLVENT: { desc: `Team is INSOLVENT. This is week ${team.consecutiveInsolventWeeks ?? 1} of 8 consecutive insolvent settlements before the club disbands. Restore a positive balance by a weekly settlement to reset this counter.`, importance: "HIGH" },
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
                totalExpenses = report.expenses.total
                const ledgerStart = save.financeLedger.length

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
                // League revenue share is folded into totalIncome/newBalance for
                // every team, but was never written to the player ledger — so the
                // ledger sum undershot the actual budget change by $15k/week and
                // every recorded running balance was internally inconsistent.
                if (report.income.leagueShare > 0) {
                    pushLedger({
                        id: `inc_league_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "INCOME",
                        category: "OTHER",
                        amount: report.income.leagueShare,
                        description: "League revenue share",
                        balance: team.budget
                    })
                }

                // Expense Entries
                if (report.expenses.academy > 0) {
                    pushLedger({ id: `exp_academy_${save.currentWeek}_${team.id}`, week: save.currentWeek, teamId: team.id,
                        type: "EXPENSE", category: "FACILITIES", amount: report.expenses.academy,
                        description: "Youth academy upkeep", balance: team.budget })
                }
                if (report.expenses.equipment > 0) {
                    pushLedger({
                        id: `exp_equip_${save.currentWeek}_${team.id}`,
                        week: save.currentWeek,
                        teamId: team.id,
                        type: "EXPENSE",
                        category: "FACILITIES",
                        amount: report.expenses.equipment,
                        description: "Equipment maintenance",
                        balance: team.budget,
                    })
                }
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

                // Each row shows the balance after that movement, not the same
                // closing balance repeated for every income and expense.
                let runningBalance = openingBalance
                for (let i = ledgerStart; i < save.financeLedger.length; i++) {
                    const entry = save.financeLedger[i]
                    runningBalance += entry.type === "INCOME" ? entry.amount : -entry.amount
                    entry.balance = runningBalance
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
            team.financeSettlement = { week: save.currentWeek, income: report.income.total, expenses: report.expenses.total }
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
        for (const member of save.staff) {
            if (member.contractEndWeek === undefined) continue // Old careers without a dated term retain their staff.
            const weeksLeft = member.contractEndWeek - save.currentWeek
            if (member.teamId === playerTeamId && weeksLeft <= WARNING_WEEKS) {
                const id = `staff_contract_${save.currentWeek}_${member.id}`
                if (!existingEventIds.has(id)) {
                    save.eventsLog.unshift({ id, week: save.currentWeek, type: "CONTRACT", acknowledged: false,
                        data: { staffId: member.id, weeksLeft: Math.max(0, weeksLeft), importance: "HIGH",
                            description: weeksLeft <= 0 ? `${member.name}'s contract expired. They have left the staff and are available on the market.` : `${member.name}'s staff contract expires in ${weeksLeft} weeks. Renew to keep their services.` } })
                    existingEventIds.add(id)
                }
            }
            if (weeksLeft <= 0) {
                const team = save.teams.find(t => t.id === member.teamId)
                if (team) team.staffIds = team.staffIds.filter(id => id !== member.id)
                save.marketStaff ??= []
                if (!save.marketStaff.some(s => s.id === member.id)) save.marketStaff.push({ ...member, teamId: "", contractEndWeek: undefined, yearsRemaining: 0 })
            }
        }
        save.staff = save.staff.filter(s => s.contractEndWeek === undefined || s.contractEndWeek > save.currentWeek)
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
                existingEventIds.add(warnId)
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
                    const removed = team.activeRoleTraining.filter(t => t.playerId === player.id).length
                    team.activeRoleTraining = team.activeRoleTraining.filter(t => t.playerId !== player.id)
                    team.trainingSlotsUsed = Math.max(0, (team.trainingSlotsUsed || 0) - removed)
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
