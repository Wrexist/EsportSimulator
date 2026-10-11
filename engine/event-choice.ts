/**
 * Event choice effects: the one place an event answer changes the club.
 *
 * Shared by the store's resolveEventChoice (the manager picks an answer) and
 * the week processor's unanswered-decision defaults (Phase 4.9), so a default
 * applies exactly what the same answer would have applied by hand, and the
 * inbox's effect chips (describeChoice) describe both.
 *
 * Engine safe: no store, no React.
 */

import type { FinanceLedgerEntry, GameEventSaveData, PlayerSaveData, TeamSaveData } from "./save-types"

export interface ChoiceEffects {
    morale?: number
    money?: number
    loyalty?: number
    reputation?: number
    fatigue?: number
    chemistry?: number
}

/** The slice of a save (or the store draft) a choice can touch. */
export interface ChoiceTarget {
    currentWeek: number
    playerTeamId: string | null
    teams: TeamSaveData[]
    players: PlayerSaveData[]
    financeLedger: FinanceLedgerEntry[]
}

/** Same bound the store applies to fees (MAX_TRANSFER_FEE). */
const MAX_EVENT_MONEY = 1_000_000_000

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Apply a choice's effect bundle. Player-scoped stats hit the event's player,
 * or the whole managed roster for a team event; money, reputation and
 * chemistry hit the event's club (the managed club by default). Fatigue
 * clamps to ±10 and chemistry to ±5 per answer.
 *
 * Returns false and changes nothing when the bundle cannot be applied: the
 * club is unknown, the amount is invalid, or the club cannot pay.
 * `ledgerId` is only called when money moves (store ids consume RNG).
 */
export function applyChoiceEffects(
    target: ChoiceTarget,
    event: GameEventSaveData,
    effects: ChoiceEffects | undefined,
    ledger: { id: () => string; description: string },
): boolean {
    const { morale, money, loyalty, reputation, fatigue, chemistry } = (effects ?? {}) as ChoiceEffects
    const data = (event.data ?? {}) as { playerId?: unknown; teamId?: unknown }
    const playerId = data.playerId != null ? String(data.playerId) : null
    const teamId = (typeof data.teamId === "string" && data.teamId) || target.playerTeamId

    let team: TeamSaveData | undefined
    let amount = 0
    if (teamId && (money || reputation || chemistry)) {
        team = target.teams.find(t => t.id === teamId)
        if (!team) return false
        const raw = money || 0
        if (typeof raw !== "number" || !Number.isFinite(raw)) return false
        amount = Math.floor(raw)
        if (Math.abs(amount) > MAX_EVENT_MONEY) return false
        // Refuse answers that would overdraw: the event stays open (or, for a
        // default, lapses without effect).
        if (amount < 0 && team.budget < -amount) return false
    }

    if (morale || loyalty || fatigue) {
        const rosterIds = playerId
            ? [playerId]
            : target.teams.find(t => t.id === target.playerTeamId)?.rosterIds ?? []
        for (const pid of rosterIds) {
            const player = target.players.find(p => p.id === pid)
            if (!player) continue
            if (morale) player.morale = clamp(player.morale + morale, 0, 100)
            if (fatigue) player.fatigue = clamp(player.fatigue + clamp(fatigue, -10, 10), 0, 100)
            if (loyalty) player.loyalty = clamp(player.loyalty + loyalty, 0, 100)
        }
    }

    if (team) {
        if (chemistry) team.chemistry = clamp((team.chemistry ?? 50) + clamp(chemistry, -5, 5), 0, 100)
        if (amount !== 0) {
            team.budget += amount
            target.financeLedger.push({
                id: ledger.id(),
                week: target.currentWeek,
                teamId: team.id,
                type: amount > 0 ? "INCOME" : "EXPENSE",
                category: "OTHER",
                amount: Math.abs(amount),
                description: ledger.description,
                balance: team.budget,
            })
        }
        if (reputation) team.reputation = clamp(team.reputation + reputation, 0, 100)
    }
    return true
}
