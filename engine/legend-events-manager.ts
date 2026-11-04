import { GameSave } from "./save-types"
import { choiceText, eventText } from "@/lib/news-ref"
import type { TextRef } from "@/lib/i18n"
import { FOUNDING_LEGENDS } from "./hall-of-fame-data"
import { SeededRNG } from "./rng"
import { runwaySummary } from "./season/club-finances"
import { formatCurrency } from "@/lib/utils-extended"

/**
 * Legend Events Manager
 * Phase 23: Hall of Fame - Special Events
 * 
 * Handles rare events involving founding legends:
 * - Legend Mentorship: A founding legend visits to mentor your players
 * - Legend Coach Opportunity: A legend may be available to hire as a coach (rare)
 */
export class LegendEventsManager {

    // Probability constants
    private static readonly MENTORSHIP_CHANCE = 0.02 // 2% per week
    private static readonly COACH_OPPORTUNITY_CHANCE = 0.005 // 0.5% per week (very rare)
    static readonly COACH_SALARY = 15000
    /**
     * A legend only offers to coach a club that can carry the wage: after
     * hiring, the club must either still make money or have at least this
     * many weeks of cash at the new weekly loss. Without it a small club's
     * competent "yes" was a bankruptcy a few months later.
     */
    static readonly COACH_MIN_RUNWAY_WEEKS = 26

    /**
     * Process potential legend events each week
     * Called from AtomicWeekProcessor
     */
    static processWeeklyLegendEvents(save: GameSave, playerTeamId: string, rng: SeededRNG) {
        // Only trigger for player team
        const playerTeam = save.teams.find(t => t.id === playerTeamId)
        if (!playerTeam) return

        // Legends are drawn to successful orgs — scale the base chance by the
        // team's reputation (1× at rep 0 → 2× at rep 100) so these feel earned
        // by climbing rather than pure weekly RNG (C11). Deterministic.
        const repMultiplier = 1 + (playerTeam.reputation || 0) / 100

        // Roll for Mentorship Event
        if (rng.next() < this.MENTORSHIP_CHANCE * repMultiplier) {
            this.triggerMentorshipEvent(save, playerTeamId, rng)
        }

        // Roll for Coach Opportunity (even rarer)
        if (rng.next() < this.COACH_OPPORTUNITY_CHANCE * repMultiplier) {
            this.triggerCoachOpportunityEvent(save, playerTeamId, rng)
        }
    }

    /**
     * Trigger a Legend Mentorship event
     * A founding legend visits and boosts a random player's stats
     */
    private static triggerMentorshipEvent(save: GameSave, playerTeamId: string, rng: SeededRNG) {
        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team || team.rosterIds.length === 0) return

        // Pick a random legend
        const legend = FOUNDING_LEGENDS[Math.floor(rng.next() * FOUNDING_LEGENDS.length)]

        // Pick a random player from roster
        const playerId = team.rosterIds[Math.floor(rng.next() * team.rosterIds.length)]
        const player = save.players.find(p => p.id === playerId)
        if (!player) return

        // Grant skill point and morale boost
        player.availableSkillPoints = (player.availableSkillPoints || 0) + 1
        player.morale = Math.min(100, (player.morale ?? 50) + 15)

        // Create event
        const mentorship = eventText({ key: "leg.mentor.t", params: { legend: legend.name, club: team.name } }, { key: "leg.mentor.m", params: { legend: legend.name, club: team.name, name: player.nickname } })
        const mentorshipBody = mentorship.message
        save.eventsLog.push({
            id: `legend_mentorship_${save.currentWeek}_${legend.id}`,
            type: "NEWS",
            week: save.currentWeek,
            data: {
                // {title, message} is the shape every news UI reads (NewsApp
                // falls back to data.title / data.message). `text` is kept for
                // save-compatibility with older events that only carried it.
                ...mentorship,
                text: mentorshipBody,
                legendId: legend.id,
                legendName: legend.name,
                playerId: player.id,
                playerName: player.nickname,
                benefit: "+1 Skill Point, +15 Morale"
            },
            // A message: the benefit is already applied, there is nothing to
            // decide (a lone "Incredible!" button read as a pending decision).
            acknowledged: false,
        })
    }

    /**
     * Trigger a Legend Coach Opportunity event
     * A founding legend becomes available for hire as a coach (very rare)
     */
    private static triggerCoachOpportunityEvent(save: GameSave, playerTeamId: string, rng: SeededRNG) {
        // Pick a random legend
        const legend = FOUNDING_LEGENDS[Math.floor(rng.next() * FOUNDING_LEGENDS.length)]

        const team = save.teams.find(t => t.id === playerTeamId)
        if (!team) return
        const salary = this.COACH_SALARY
        const money = runwaySummary(save, team)
        const netAfter = money.weeklyNet - salary
        const runwayAfter = netAfter < 0 ? Math.max(0, money.cash) / -netAfter : Infinity
        if (runwayAfter < this.COACH_MIN_RUNWAY_WEEKS) return

        // Create event with choice
        const wage = formatCurrency(salary, "$", false)
        const cost: TextRef = netAfter >= 0
            ? { key: "leg.coach.profit", params: { wage, net: formatCurrency(netAfter, "$", false) } }
            : { key: "leg.coach.loss", params: { wage, net: formatCurrency(-netAfter, "$", false), weeks: { key: "sl.weeks", count: Math.floor(runwayAfter) } } }
        const coach = eventText({ key: "leg.coach.t", params: { legend: legend.name } }, { key: "leg.coach.m", params: { legend: legend.name, cost } })
        const coachBody = coach.message
        save.eventsLog.push({
            id: `legend_coach_opportunity_${save.currentWeek}_${legend.id}`,
            type: "CONTRACT_OFFER",
            week: save.currentWeek,
            data: {
                // {title, message} is the shape every news UI reads; `text` is
                // retained for save-compatibility with pre-existing events.
                ...coach,
                text: coachBody,
                legendId: legend.id,
                legendName: legend.name,
                legendPortrait: legend.portraitPath,
                salaryCost: salary, // High salary for a legend coach
                benefitDescription: "+5% team skill gain, +10 Chemistry, Prestige boost"
            },
            acknowledged: false,
            choices: [
                { id: "hire", ...choiceText({ key: "leg.coach.hire", params: { wage } }), effects: { money: 0 } },
                { id: "decline", ...choiceText({ key: "leg.coach.decline" }), effects: { money: 0 } }
            ]
        })
    }
}
