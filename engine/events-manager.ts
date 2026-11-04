// Game events and message generation system
import type { GameSave } from "./save-types"
import type { SeededRNG } from "./rng"
import { EventType } from "@/types"
import { eventText, newsText } from "@/lib/news-ref"
import type { TextRef } from "@/lib/i18n"

// Fan milestone thresholds (one-time events)
const FAN_MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]

export class EventsManager {
  /**
   * Modern event generator — pushes to game.eventsLog with seeded RNG.
   * Called from atomic-week-processor Step 7.
   */
  static generateModernEvents(save: GameSave, rng: SeededRNG): number {
    let generated = 0
    const playerTeam = save.teams.find(t => t.id === save.playerTeamId)
    if (!playerTeam) return 0

    const week = save.currentWeek

    // ---------- 1. MEDIA INTERVIEW (8% chance, rep > 50) ----------
    if (playerTeam.reputation > 50 && rng.bool(0.08)) {
      const eventId = `media_interview_${week}`
      if (!save.eventsLog.some(e => e.id === eventId)) {
        const topics = [
          "your recent results and what the team has planned next",
          "the team's development and your coaching philosophy",
          "upcoming tournament preparations and expectations",
          "the team's rise through the rankings",
          "a controversial recent match and community reaction",
        ]
        const topicIndex = Math.floor(rng.next() * topics.length)
        const topic = topics[topicIndex]

        // Name the outlet + journalist and vary the framing so the media layer
        // reads as reporting rather than a placeholder "Pro has requested...".
        const outlets: Array<{ outlet: string; journalist: string }> = [
          { outlet: "Pro Power Rankings", journalist: "Jamie Vega" },
          { outlet: "The Frag Report", journalist: "Sasha Lindqvist" },
          { outlet: "Clutch Weekly", journalist: "Marcus Odden" },
          { outlet: "Overtime Digest", journalist: "Priya Nair" },
          { outlet: "The Scoreline", journalist: "Diego Ferraro" },
          { outlet: "Headshot HQ", journalist: "Nina Alvarez" },
        ]
        const { outlet, journalist } = outlets[Math.floor(rng.next() * outlets.length)]
        // Four framings (rnd.interview.frame0–3) so the request reads as reporting.
        const framingIndex = Math.floor(rng.next() * 4)
        const framing: TextRef = { key: `rnd.interview.frame${framingIndex}`, params: { journalist, outlet, topic: { key: `rnd.interview.topic${topicIndex}` } } }

        save.eventsLog.push({
          id: eventId,
          type: EventType.MEDIA,
          week,
          acknowledged: false,
          data: {
            ...eventText({ key: "rnd.interview.t", params: { outlet } }, { key: "rnd.interview.m", params: { framing } }),
            severity: "info",
            outlet,
            journalist,
            topic,
          },
          choices: [
            { id: "accept", text: "Accept Interview (+Rep, +Morale)", ref: { key: "rnd.c.acceptInterview" }, effects: { reputation: 3, morale: 5 } },
            { id: "decline", text: "Decline Politely", ref: { key: "rnd.c.declinePolitely" }, effects: {} },
          ],
        })
        generated++
      }
    }

    // ---------- 2. FAN MILESTONE (threshold-based, one-time per threshold) ----------
    const followers = playerTeam.followers || 0
    for (const threshold of FAN_MILESTONES) {
      if (followers >= threshold) {
        const eventId = `fan_milestone_${threshold}`
        if (!save.eventsLog.some(e => e.id === eventId)) {
          const formatted = threshold >= 1_000_000
            ? `${(threshold / 1_000_000).toFixed(0)}M`
            : `${(threshold / 1000).toFixed(0)}K`

          save.eventsLog.push({
            id: eventId,
            type: EventType.FAN,
            week,
            acknowledged: false,
            data: {
              ...eventText({ key: "rnd.fans.t", params: { count: formatted } }, { key: "rnd.fans.m", params: { count: formatted } }),
              severity: "success",
              followerCount: followers,
            },
          })
          // Reputation bonus for milestone
          playerTeam.reputation = Math.min(100, playerTeam.reputation + 2)
          generated++
        }
      }
    }

    // ---------- 3. TRANSFER RUMOR (5% chance) ----------
    // A rumour is wire news, not a bid: no offer exists, so it goes to the
    // news feed instead of the inbox, where it read as an offer with an
    // Accept button that could only fail (Phase 4.9).
    if (rng.bool(0.05) && playerTeam.rosterIds.length > 0) {
      const newsId = `news_rumor_${week}`
      if (!save.newsFeed?.some(n => n.id === newsId)) {
        // Pick a random player from the roster
        const targetPid = playerTeam.rosterIds[Math.floor(rng.next() * playerTeam.rosterIds.length)]
        const targetPlayer = save.players.find(p => p.id === targetPid)
        // Pick a random interested AI team
        const interestedTeams = save.teams.filter(
          t => t.id !== save.playerTeamId && t.budget > 50000
        )
        const interestedTeam = interestedTeams.length > 0
          ? interestedTeams[Math.floor(rng.next() * interestedTeams.length)]
          : null

        if (targetPlayer && interestedTeam && save.newsFeed) {
          save.newsFeed.unshift({
            id: newsId,
            ...newsText(
              { key: "nw.rumour.t", params: { name: targetPlayer.nickname, team: interestedTeam.name } },
              { key: "nw.rumour.c", params: { name: targetPlayer.nickname, team: interestedTeam.name } },
            ),
            category: "TRANSFER",
            playerId: targetPid,
            teamId: interestedTeam.id,
            week,
          })
          if (save.newsFeed.length > 50) save.newsFeed.pop()
          generated++
        }
      }
    }

    // ---------- 4. PLAYER BIRTHDAY (check all roster players) ----------
    for (const pid of playerTeam.rosterIds) {
      const player = save.players.find(p => p.id === pid)
      if (!player) continue

      // Approximate birthday: use player age and assume birthday happens once per 52 weeks
      // Use a deterministic "birth week" derived from player ID hash
      let birthWeekHash = 0
      for (let i = 0; i < player.id.length; i++) {
        birthWeekHash = (birthWeekHash * 31 + player.id.charCodeAt(i)) & 0x7fffffff
      }
      const birthWeekOfYear = (birthWeekHash % 52) + 1
      const currentWeekOfYear = ((week - 1) % 52) + 1

      if (birthWeekOfYear === currentWeekOfYear) {
        const eventId = `birthday_${player.id}_${Math.floor(week / 52)}`
        if (!save.eventsLog.some(e => e.id === eventId)) {
          player.morale = Math.min(100, player.morale + 5)

          save.eventsLog.push({
            id: eventId,
            type: EventType.MORALE,
            week,
            acknowledged: false,
            data: {
              ...eventText({ key: "rnd.birthday.t", params: { name: player.nickname } }, { key: "rnd.birthday.m", params: { name: player.nickname } }),
              severity: "info",
              playerId: player.id,
            },
            choices: [
              { id: "party", text: "Throw a Party (-$1k, Morale +10)", ref: { key: "rnd.c.party" }, effects: { money: -1000, morale: 10 } },
              { id: "gift", text: "Send a Gift (-$500, Loyalty +5)", ref: { key: "rnd.c.gift" }, effects: { money: -500, loyalty: 5 } },
              { id: "wish", text: "Send Wishes (Free)", ref: { key: "rnd.c.wishes" }, effects: { morale: 2 } },
            ],
          })
          generated++
        }
      }
    }

    // ---------- 5. RIVAL DEVELOPING (3+ matchups with same team) ----------
    const opponentCounts: Record<string, number> = {}
    save.completedMatches
      .filter(m => m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId)
      .forEach(m => {
        const oppId = m.homeTeamId === save.playerTeamId ? m.awayTeamId : m.homeTeamId
        opponentCounts[oppId] = (opponentCounts[oppId] || 0) + 1
      })

    for (const [oppId, count] of Object.entries(opponentCounts)) {
      if (count >= 3 && count % 3 === 0) {
        const eventId = `rivalry_${oppId}_${count}`
        if (!save.eventsLog.some(e => e.id === eventId)) {
          const rival = save.teams.find(t => t.id === oppId)
          if (rival) {
            // Calculate head-to-head
            const h2h = save.completedMatches.filter(
              m =>
                (m.homeTeamId === save.playerTeamId && m.awayTeamId === oppId) ||
                (m.homeTeamId === oppId && m.awayTeamId === save.playerTeamId)
            )
            const wins = h2h.filter(m => m.result.winnerId === save.playerTeamId).length
            const losses = h2h.length - wins

            save.eventsLog.push({
              id: eventId,
              type: EventType.MEDIA,
              week,
              acknowledged: false,
              data: {
                ...eventText({ key: "rnd.rivalry.t", params: { club: rival.name } }, { key: "rnd.rivalry.m", params: { club: rival.name, count, w: wins, l: losses } }),
                severity: "info",
                rivalTeamId: oppId,
              },
            })
            generated++
          }
        }
      }
    }

    // ---------- 6. EQUIPMENT DEAL (3% chance, rep > 40) ----------
    if (playerTeam.reputation > 40 && rng.bool(0.03)) {
      const eventId = `equipment_deal_${week}`
      if (!save.eventsLog.some(e => e.id === eventId)) {
        const brands = ["Logitex", "IronArc", "HyperZ", "Raven", "Zoe", "Corsaire"]
        const brand = brands[Math.floor(rng.next() * brands.length)]
        const discount = 20 + Math.floor(rng.next() * 30) // 20-49% discount

        save.eventsLog.push({
          id: eventId,
          type: EventType.SPONSOR,
          week,
          acknowledged: false,
          data: {
            ...eventText({ key: "rnd.gear.t", params: { brand } }, { key: "rnd.gear.m", params: { brand, discount } }),
            severity: "info",
            brand,
            discount,
          },
          choices: [
            { id: "accept_deal", text: `Accept Deal (-$3k, Morale +8)`, ref: { key: "rnd.c.acceptDeal" }, effects: { money: -3000, morale: 8 } },
            { id: "negotiate", text: "Counter-Offer (-$1.5k, Morale +4)", ref: { key: "rnd.c.counter" }, effects: { money: -1500, morale: 4 } },
            { id: "decline_deal", text: "Decline", ref: { key: "rnd.c.decline" }, effects: {} },
          ],
        })
        generated++
      }
    }

    return generated
  }

}
