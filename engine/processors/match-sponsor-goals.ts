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
import { paySponsorGoalBonus } from "./sponsor-goal-payout"

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

            // Match goals are match-scoped (matchId in the ids) so a goal that
            // completes on a specific match pays exactly once for that match.
            paySponsorGoalBonus({
                save,
                team,
                sponsorName: sponsor.name,
                goalDescription: goal.description,
                bonusPayout: goal.bonusPayout,
                ledgerId: `fin_sponsor_match_${save.currentWeek}_${team.id}_${sponsor.id}_${goal.id}_${matchId}`,
                eventId: `evt_sponsor_match_goal_${save.currentWeek}_${sponsor.id}_${goal.id}_${matchId}`,
                eventIdSet,
                ledgerIdSet,
            })
        })
    })
}
