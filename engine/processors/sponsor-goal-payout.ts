/**
 * Shared sponsor-goal bonus payout.
 *
 * Both sponsor-goal processors — the weekly one (followers / morale goals,
 * `processWeeklySponsorGoals`) and the per-match one (win / map goals,
 * `applyMatchSponsorGoalProgress`) — pay a completed goal's bonus the same way:
 * idempotent ledger entry, budget bump, and a one-off SPONSOR_OFFER event for
 * the player team. That block used to be copy-pasted in both, with subtly
 * different control flow and two ledger-id schemes that could drift apart
 * (AUDIT_WAVE3 sponsor-goal item). Centralizing it here keeps the payout +
 * dedup logic single-sourced; callers still pass their own (correctly distinct)
 * ledger/event ids — match goals are match-scoped, weekly goals are week-scoped.
 */

import type { GameSave, TeamSaveData } from "../save-types"

export function paySponsorGoalBonus(args: {
    save: GameSave
    team: TeamSaveData
    sponsorName: string
    goalDescription: string
    bonusPayout: number
    ledgerId: string
    eventId: string
    eventIdSet?: Set<string>
    ledgerIdSet?: Set<string>
}): void {
    const { save, team, sponsorName, goalDescription, bonusPayout, ledgerId, eventId, eventIdSet, ledgerIdSet } = args

    // Idempotent: never pay the same goal twice (within-tick set + persisted ledger).
    const alreadyPaid = ledgerIdSet?.has(ledgerId) ?? save.financeLedger.some(entry => entry.id === ledgerId)
    if (alreadyPaid) return

    team.budget += bonusPayout
    save.financeLedger.push({
        id: ledgerId,
        week: save.currentWeek,
        teamId: team.id,
        type: "INCOME",
        category: "SPONSOR",
        amount: bonusPayout,
        description: `Goal Reached: ${goalDescription}`,
        balance: team.budget,
    })
    ledgerIdSet?.add(ledgerId)

    // Notify the player team only, deduped the same way.
    if (team.id !== save.playerTeamId) return
    if (eventIdSet?.has(eventId) ?? save.eventsLog.some(event => event.id === eventId)) return
    save.eventsLog.unshift({
        id: eventId,
        type: "SPONSOR_OFFER",
        week: save.currentWeek,
        data: {
            title: "Sponsor Goal Met",
            message: `${sponsorName} sent a bonus of $${bonusPayout.toLocaleString()}.`,
        },
        acknowledged: false,
    })
    eventIdSet?.add(eventId)
}
