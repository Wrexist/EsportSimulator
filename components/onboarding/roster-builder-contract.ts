/**
 * Create team: the deal a free agent signs in the roster builder
 * (RosterBuilderModal). Pure, so tests can read it without the modal.
 */
import type { PlayerSaveData, TeamSaveData } from "@/engine/save-types"
import { signingWageAsk } from "@/components/transfer/negotiation-rules"

/** A player with his current club and contract, as the builder lists him. */
export interface PlayerWithTeamInfo extends PlayerSaveData {
    currentTeamId: string | null
    currentTeamName: string | null
    existingContract: { salaryPerWeek: number; buyout: number } | null
    isFreeAgent: boolean
    ovr: number
    /** Potential on the OVR scale (never below `ovr`), START-24. */
    potOvr: number
}

/**
 * The deal a free agent signs here. MODES-17: his wage is the same "wage ask"
 * the Transfers market shows for him (components/transfer/negotiation-rules
 * signingWageAsk: his rating, age, personality, weeks unsigned and the club's
 * reputation), not a separate table.
 */
export function autoContract(player: PlayerWithTeamInfo, currentWeek: number, buyer?: Pick<TeamSaveData, "reputation"> & Partial<Pick<TeamSaveData, "leagueTier">>) {
    const salaryPerWeek = signingWageAsk(player, currentWeek, buyer)
    // Buyout: existing contract's buyout, otherwise derived from the wage.
    const buyout = player.existingContract?.buyout || (player.isFreeAgent ? 0 : salaryPerWeek * 52 * 1.5)
    return {
        salaryPerWeek,
        startWeek: currentWeek,
        endWeek: currentWeek + 52, // 1 year contract
        buyout,
        transferFee: player.isFreeAgent ? 0 : buyout,
    }
}
