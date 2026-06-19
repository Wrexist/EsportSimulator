/**
 * Weekly sponsor-goal evaluation.
 *
 * For every active sponsor on every team:
 *   - Bumps progress on "Gain Followers" goals from this week's follower
 *     delta (using `sponsor.followerCheckpoint` to avoid double-counting).
 *   - Bumps "Maintain Morale > 80" goals when the roster average is above 80.
 *   - When a goal hits its target it pays out `bonusPayout` to the team
 *     budget once (idempotency guarded by deterministic ledger ID) and
 *     surfaces a SPONSOR_OFFER event on the player's team only.
 *   - Decrements `sponsor.remainingWeeks`; expired sponsors are dropped
 *     and an expiry event is surfaced.
 *
 * The function is fully idempotent on re-runs within the same week:
 *   - `sponsor.lastProcessedWeek` short-circuits second passes.
 *   - Ledger and event sets dedupe payouts and notifications.
 *
 * Extracted from atomic-week-processor.ts; signature unchanged.
 */

import type { GameSave } from "../save-types"
import { paySponsorGoalBonus } from "./sponsor-goal-payout"

// Weeks before an expired sponsor can be re-signed (mirrors job-change cooldown).
const SPONSOR_RESIGN_COOLDOWN_WEEKS = 16

export function processWeeklySponsorGoals(
    save: GameSave,
    eventIdSet?: Set<string>,
    ledgerIdSet?: Set<string>,
): void {
    save.teams.forEach(team => {
        if (!team.sponsors || team.sponsors.length === 0) return

        const followers = team.followers || 0
        const rosterPlayers = save.players.filter(player => team.rosterIds.includes(player.id))
        const avgMorale = rosterPlayers.length > 0
            ? rosterPlayers.reduce((sum, player) => sum + (player.morale || 0), 0) / rosterPlayers.length
            : 0

        const activeSponsors: typeof team.sponsors = []

        team.sponsors.forEach(sponsor => {
            // Idempotency: rollback/resume paths can re-enter this with the
            // same week. Keep already-processed sponsors but skip work.
            if (sponsor.lastProcessedWeek === save.currentWeek) {
                if (sponsor.remainingWeeks > 0) activeSponsors.push(sponsor)
                return
            }

            const previousFollowers = sponsor.followerCheckpoint ?? followers
            const gainedFollowers = Math.max(0, followers - previousFollowers)

            if (Array.isArray(sponsor.goals)) {
                sponsor.goals.forEach(goal => {
                    if (goal.isCompleted) return

                    if (goal.description.includes("Gain Followers")) {
                        goal.current += gainedFollowers
                    }
                    if (goal.description.includes("Maintain Morale > 80") && avgMorale > 80) {
                        goal.current += 1
                    }

                    if (goal.current >= goal.target) {
                        goal.current = goal.target
                        goal.isCompleted = true

                        // Weekly goals are week-scoped (no matchId).
                        paySponsorGoalBonus({
                            save,
                            team,
                            sponsorName: sponsor.name,
                            goalDescription: goal.description,
                            bonusPayout: goal.bonusPayout,
                            ledgerId: `fin_sponsor_goal_${save.currentWeek}_${team.id}_${sponsor.id}_${goal.id}`,
                            eventId: `evt_sponsor_goal_${save.currentWeek}_${sponsor.id}_${goal.id}`,
                            eventIdSet,
                            ledgerIdSet,
                        })
                    }
                })
            }

            // B7: apply the brand's per-week non-cash side-effects (clamped,
            // non-farmable). Runs once/week per sponsor via the lastProcessedWeek
            // guard above. Followers respect the same 2M cap as fanbase growth.
            const fx = sponsor.brandEffect
            if (fx) {
                if (fx.reputationPerWeek) {
                    team.reputation = Math.max(0, Math.min(100, (team.reputation || 0) + fx.reputationPerWeek))
                }
                if (fx.followerGrowthPerWeek) {
                    team.followers = Math.min(2_000_000, Math.max(0, (team.followers || 0) + fx.followerGrowthPerWeek))
                }
                if (fx.moralePerWeek) {
                    const delta = fx.moralePerWeek
                    rosterPlayers.forEach(p => { p.morale = Math.max(0, Math.min(100, (p.morale || 0) + delta)) })
                }
            }

            sponsor.followerCheckpoint = followers
            sponsor.lastProcessedWeek = save.currentWeek
            sponsor.remainingWeeks = Math.max(0, (sponsor.remainingWeeks || 0) - 1)

            if (sponsor.remainingWeeks > 0) {
                activeSponsors.push(sponsor)
                return
            }

            // Sponsor expired — bar re-signing the same brand for a window so
            // the 3-slot cap can't be bypassed by cycling the same sponsors.
            if (!team.sponsorCooldowns) team.sponsorCooldowns = {}
            team.sponsorCooldowns[sponsor.name] = save.currentWeek + SPONSOR_RESIGN_COOLDOWN_WEEKS

            // Sponsor expired this tick — notify player team only.
            if (team.id === save.playerTeamId) {
                const expiryEventId = `evt_sponsor_expired_${save.currentWeek}_${sponsor.id}`
                if (!(eventIdSet?.has(expiryEventId) ?? save.eventsLog.some(event => event.id === expiryEventId))) {
                    save.eventsLog.unshift({
                        id: expiryEventId,
                        type: "SPONSOR_OFFER",
                        week: save.currentWeek,
                        data: {
                            title: "Sponsor Contract Ended",
                            message: `${sponsor.name} partnership has expired.`,
                        },
                        acknowledged: false,
                    })
                    eventIdSet?.add(expiryEventId)
                }
            }
        })

        team.sponsors = activeSponsors
    })
}
