/**
 * Per-match sponsor-goal progress.
 *
 * Extracted from atomic-week-processor.ts (Phase M2). Called twice per
 * completed match (once per team) inside processMatches. Updates each
 * team's sponsor goal counters, fires the bonus payout the moment a
 * goal hits its target, and emits a SPONSOR_OFFER event for the
 * player team so the toast bridge in advanceWeek surfaces the bonus.
 *
 * Two goal types handled:
 *   - "Win Matches"        — increments by 1 if the team won
 *   - "Win Tournament maps" — increments by mapsWon (counts every map win)
 *
 * Idempotent: ledger entries + events are keyed on
 * (week, team, sponsor, goal, match) so re-running the same match
 * doesn't double-pay or double-notify.
 */

import type { GameSave, TeamSaveData } from "../save-types"

export function applyMatchSponsorGoalProgress(
    save: GameSave,
    team: TeamSaveData,
    wonMatch: boolean,
    mapsWon: number,
    matchId: string,
    eventIdSet?: Set<string>,
    ledgerIdSet?: Set<string>,
): void {
    if (!team.sponsors || team.sponsors.length === 0) return

    team.sponsors.forEach(sponsor => {
        if (!Array.isArray(sponsor.goals)) return

        sponsor.goals.forEach(goal => {
            if (goal.isCompleted) return

            if (goal.description.includes("Win Matches") && wonMatch) {
                goal.current += 1
            }

            if (goal.description.includes("Win Tournament maps")) {
                goal.current += mapsWon
            }

            if (goal.current < goal.target) return
            goal.current = goal.target
            goal.isCompleted = true

            const payoutEntryId = `fin_sponsor_match_${save.currentWeek}_${team.id}_${sponsor.id}_${goal.id}_${matchId}`
            const alreadyPaid = ledgerIdSet?.has(payoutEntryId) ?? save.financeLedger.some(entry => entry.id === payoutEntryId)
            if (alreadyPaid) return

            team.budget += goal.bonusPayout
            save.financeLedger.push({
                id: payoutEntryId,
                week: save.currentWeek,
                teamId: team.id,
                type: "INCOME",
                category: "SPONSOR",
                amount: goal.bonusPayout,
                description: `Goal Reached: ${goal.description}`,
                balance: team.budget,
            })
            ledgerIdSet?.add(payoutEntryId)

            if (team.id !== save.playerTeamId) return

            const eventId = `evt_sponsor_match_goal_${save.currentWeek}_${sponsor.id}_${goal.id}_${matchId}`
            if (!(eventIdSet?.has(eventId) ?? save.eventsLog.some(event => event.id === eventId))) {
                save.eventsLog.unshift({
                    id: eventId,
                    type: "SPONSOR_OFFER",
                    week: save.currentWeek,
                    data: {
                        title: "Sponsor Goal Met",
                        message: `${sponsor.name} sent a bonus of $${goal.bonusPayout.toLocaleString()}.`,
                    },
                    acknowledged: false,
                })
                eventIdSet?.add(eventId)
            }
        })
    })
}
