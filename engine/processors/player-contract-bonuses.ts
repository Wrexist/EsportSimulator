import type { GameSave } from "../save-types"

/** Conditional wages become expenses only for a completed match actually played. */
export function settlePlayerContractBonuses(save: Pick<GameSave, "teams" | "contracts" | "financeLedger" | "currentWeek">, matchId: string, teamId: string, won: boolean, playedIds: string[], mvpPlayerId?: string, ledgerIds?: Set<string>): void {
    const team = save.teams.find(t => t.id === teamId)
    if (!team) return
    const played = new Set(playedIds)
    const ids = ledgerIds ?? new Set(save.financeLedger.map(e => e.id))
    for (const contract of save.contracts) {
        if (contract.teamId !== teamId || !played.has(contract.playerId) || !team.rosterIds.includes(contract.playerId) ||
            contract.startWeek > save.currentWeek || contract.endWeek <= save.currentWeek) continue
        for (const [kind, amount] of [["win", won ? contract.matchWinBonus : 0], ["mvp", mvpPlayerId === contract.playerId ? contract.mvpBonus : 0]] as const) {
            if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue
            const id = `contract_bonus_${matchId}_${teamId}_${contract.playerId}_${kind}`
            if (ids.has(id)) continue
            team.budget -= amount
            save.financeLedger.push({ id, week: save.currentWeek, teamId, type: "EXPENSE", category: "WAGES_PLAYER", amount,
                description: `${kind === "win" ? "Match win" : "MVP"} contract bonus: ${contract.playerId}`, balance: team.budget })
            ids.add(id)
        }
    }
}
