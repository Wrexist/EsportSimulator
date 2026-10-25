/**
 * G13: contract clauses that change what happens, agreed when you sign a
 * player.
 *
 * - Release clause: a fee at which another club may take the player without
 *   your say. He takes a lower wage for one, more so for a low clause.
 *   AI clubs pay it (ai/transfer-market.ts processReleaseClauses).
 * - Appearance bonus: paid for every official match he plays
 *   (processors/player-contract-bonuses.ts). He takes a lower wage for it, so
 *   it is cheap for a rotation player and dear for an ever-present starter.
 * - Title bonus: paid to every player on the roster with one when the club
 *   wins a tournament (processors/standings-processor.ts). Worth it when
 *   titles are rare.
 * - Sell-on: when you sell, ask for a share of his next transfer fee in
 *   exchange for a lower fee now (settleSellOn, at every transfer with a fee).
 */

import type { ContractSaveData, GameSave } from "./save-types"

export type ReleaseClause = "none" | "high" | "low"

export interface ClauseTerms {
    release: ReleaseClause
    /** Per official match played. */
    appearanceBonus: number
    /** Per tournament the club wins. */
    titleBonus: number
}

export const NO_CLAUSES: ClauseTerms = { release: "none", appearanceBonus: 0, titleBonus: 0 }

export const CLAUSE_TUNING = {
    /**
     * Release clause in weeks of his agreed wage. Clubs' cash, not transfer
     * values, decides who can pay: a low clause is within reach of the richer
     * clubs, a high one only of the richest.
     */
    RELEASE_FEE_WEEKS: { high: 120, low: 50 } as Record<Exclude<ReleaseClause, "none">, number>,
    /** Wage he asks with each release option (none is the usual deal). */
    RELEASE_WAGE: { none: 1, high: 0.96, low: 0.9 } as Record<ReleaseClause, number>,
    /** Wage he gives up per $1 of appearance bonus (about one official match every two weeks). */
    APPEARANCE_WAGE_CREDIT: 0.5,
    /** At most this share of his wage can be swapped for appearance money. */
    APPEARANCE_MAX_SHARE: 0.3,
    /** Wage he gives up per $1 of title bonus (he expects a title about every 30 weeks). */
    TITLE_WAGE_CREDIT: 1 / 30,
    TITLE_MAX_SHARE: 0.15,
    /** Sell-on share you ask for when selling, and the cut the buyer takes off the fee for it. */
    SELL_ON_SHARE: 0.15,
    SELL_ON_FEE_CUT: 0.1,
    /** Weekly chance a club that can pay does: 8% for a low clause, 2% for a high one (by weeks of wage, in between linearly). */
    RELEASE_TRIGGER_LOW: 0.08,
    RELEASE_TRIGGER_HIGH: 0.02,
} as const

export const RELEASE_LABEL: Record<ReleaseClause, string> = { none: "No release clause", high: "High (120 weeks of wage)", low: "Low (50 weeks of wage)" }

export type ClauseFields = Pick<ContractSaveData, "releaseClause" | "appearanceBonus" | "tournamentWinBonus" | "sellOn">

/** Contract terms a signing writes (store transferPlayer). */
export type NewContractTerms = { salaryPerWeek: number; startWeek: number; endWeek: number; buyout: number } & ClauseFields

const MAX_CLAUSE_MONEY = 1_000_000_000

/** Only well-formed clause fields, bounded (anything else is dropped). */
export function sanitizeClauseFields(terms: ClauseFields): ClauseFields {
    const money = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(MAX_CLAUSE_MONEY, Math.round(v)) : undefined
    const out: ClauseFields = {}
    const release = money(terms.releaseClause), appearance = money(terms.appearanceBonus), title = money(terms.tournamentWinBonus)
    if (release) out.releaseClause = release
    if (appearance) out.appearanceBonus = appearance
    if (title) out.tournamentWinBonus = title
    const sellOn = terms.sellOn
    if (sellOn && typeof sellOn.teamId === "string" && typeof sellOn.pct === "number" && sellOn.pct > 0 && sellOn.pct <= 0.5) out.sellOn = { teamId: sellOn.teamId, pct: sellOn.pct }
    return out
}

/** The wage he asks once the clauses are counted, from the wage he would ask without them. */
export function wageWithClauses(wage: number, terms: ClauseTerms): number {
    const T = CLAUSE_TUNING
    const appearance = Math.min(T.APPEARANCE_MAX_SHARE * wage, T.APPEARANCE_WAGE_CREDIT * Math.max(0, terms.appearanceBonus))
    const title = Math.min(T.TITLE_MAX_SHARE * wage, T.TITLE_WAGE_CREDIT * Math.max(0, terms.titleBonus))
    return Math.max(0, wage * T.RELEASE_WAGE[terms.release] - appearance - title)
}

/** Release clause fee for an agreed weekly wage (0 = none). */
export function releaseClauseFee(release: ReleaseClause, wagePerWeek: number): number {
    return release === "none" ? 0 : Math.round(Math.max(0, wagePerWeek) * CLAUSE_TUNING.RELEASE_FEE_WEEKS[release])
}

/** Weekly chance a club that can pay a clause does, from how many weeks of wage it is. */
export function releaseTriggerChance(fee: number, wagePerWeek: number): number {
    const T = CLAUSE_TUNING
    const weeks = fee / Math.max(1, wagePerWeek)
    const t = (weeks - T.RELEASE_FEE_WEEKS.low) / (T.RELEASE_FEE_WEEKS.high - T.RELEASE_FEE_WEEKS.low)
    return Math.max(0, Math.min(T.RELEASE_TRIGGER_LOW, T.RELEASE_TRIGGER_LOW + (T.RELEASE_TRIGGER_HIGH - T.RELEASE_TRIGGER_LOW) * t))
}

/** The clause fields to write on a new contract at the agreed wage. */
export function clauseFields(terms: ClauseTerms, wagePerWeek: number): Pick<ContractSaveData, "releaseClause" | "appearanceBonus" | "tournamentWinBonus"> {
    const out: Pick<ContractSaveData, "releaseClause" | "appearanceBonus" | "tournamentWinBonus"> = {}
    const release = releaseClauseFee(terms.release, wagePerWeek)
    if (release > 0) out.releaseClause = release
    if (terms.appearanceBonus > 0) out.appearanceBonus = Math.round(terms.appearanceBonus)
    if (terms.titleBonus > 0) out.tournamentWinBonus = Math.round(terms.titleBonus)
    return out
}

/**
 * A transfer with a fee: the club owed a sell-on share by the outgoing
 * contract gets it (from the selling club's fee). Returns the amount paid.
 */
export function settleSellOn(
    save: Pick<GameSave, "teams" | "financeLedger" | "eventsLog" | "currentWeek"> & { playerTeamId: string | null },
    outgoing: ContractSaveData | undefined,
    playerName: string,
    fee: number,
): number {
    const owed = outgoing?.sellOn
    if (!owed || !(fee > 0) || owed.teamId === outgoing.teamId) return 0
    const creditor = save.teams.find(t => t.id === owed.teamId)
    const seller = save.teams.find(t => t.id === outgoing.teamId)
    if (!creditor || !seller) return 0
    const amount = Math.round(fee * Math.max(0, Math.min(0.5, owed.pct)))
    if (amount <= 0) return 0
    seller.budget -= amount
    creditor.budget += amount
    const id = `fin_sell_on_${save.currentWeek}_${outgoing.playerId}_${creditor.id}`
    save.financeLedger ??= []
    if (!save.financeLedger.some(e => e.id === id)) {
        save.financeLedger.push({ id, week: save.currentWeek, teamId: creditor.id, type: "INCOME", category: "TRANSFER_IN", amount, description: `Sell-on: ${playerName}`, balance: creditor.budget })
        save.financeLedger.push({ id: `${id}_out`, week: save.currentWeek, teamId: seller.id, type: "EXPENSE", category: "TRANSFER_OUT", amount, description: `Sell-on owed: ${playerName}`, balance: seller.budget })
    }
    if (creditor.id === save.playerTeamId) {
        save.eventsLog.push({
            id: `evt_sell_on_${save.currentWeek}_${outgoing.playerId}`,
            type: "TRANSFER",
            week: save.currentWeek,
            acknowledged: false,
            data: {
                title: `Sell-on paid: ${playerName}`,
                message: `${seller.name} sold ${playerName} for ${Math.round(fee).toLocaleString("en-US")}. Your ${Math.round(owed.pct * 100)}% sell-on brings in ${amount.toLocaleString("en-US")}.`,
                playerId: outgoing.playerId,
                severity: "success",
            },
        } as GameSave["eventsLog"][number])
    }
    return amount
}
