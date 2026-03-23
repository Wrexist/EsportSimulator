// Game events and message generation system
import type { Player, Team, Message, MessageChoice, GameEvent } from "@/types/game"
import type { GameSave } from "./save-types"
import type { SeededRNG } from "./rng"
import { EventType } from "@/types"

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
        const topic = topics[Math.floor(rng.next() * topics.length)]

        save.eventsLog.push({
          id: eventId,
          type: EventType.MEDIA,
          week,
          acknowledged: false,
          data: {
            title: "Media Interview Request",
            message: `HLTV has requested an interview about ${topic}. Accepting will boost your reputation but takes preparation time.`,
            severity: "info",
          },
          choices: [
            { id: "accept", text: "Accept Interview (+Rep, +Morale)", effects: { reputation: 3, morale: 5 } },
            { id: "decline", text: "Decline Politely", effects: {} },
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
              title: `Fan Milestone: ${formatted} Followers!`,
              message: `Your fanbase has grown to ${formatted} followers! This unlocks new sponsorship opportunities and boosts team reputation.`,
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
    if (rng.bool(0.05) && playerTeam.rosterIds.length > 0) {
      const eventId = `transfer_rumor_${week}`
      if (!save.eventsLog.some(e => e.id === eventId)) {
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

        if (targetPlayer && interestedTeam) {
          save.eventsLog.push({
            id: eventId,
            type: EventType.TRANSFER_OFFER,
            week,
            acknowledged: false,
            data: {
              title: "Transfer Rumor",
              message: `Reports suggest ${interestedTeam.name} is interested in signing ${targetPlayer.nickname}. No formal offer has been made yet.`,
              severity: "warning",
              playerId: targetPid,
              teamId: interestedTeam.id,
              teamName: interestedTeam.name,
              playerName: targetPlayer.nickname,
              offerAmount: Math.round((targetPlayer.skill * 100 + (targetPlayer.potential ?? 50) * 150) * (targetPlayer.tier === "ELITE" ? 50 : targetPlayer.tier === "PRO" ? 20 : 5)),
            },
          })
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
              title: `Happy Birthday, ${player.nickname}!`,
              message: `It's ${player.nickname}'s birthday today! The team celebrated together, boosting morale.`,
              severity: "info",
              playerId: player.id,
            },
            choices: [
              { id: "party", text: "Throw a Party (-$1k, Morale +10)", effects: { money: -1000, morale: 10 } },
              { id: "gift", text: "Send a Gift (-$500, Loyalty +5)", effects: { money: -500, loyalty: 5 } },
              { id: "wish", text: "Send Wishes (Free)", effects: { morale: 2 } },
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
                title: `Rivalry Intensifies: ${rival.name}`,
                message: `After ${count} encounters (${wins}W-${losses}L), a rivalry is forming with ${rival.name}. The community is buzzing about the next clash!`,
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
        const brands = ["Logitech", "SteelSeries", "HyperX", "Razer", "Zowie", "Corsair"]
        const brand = brands[Math.floor(rng.next() * brands.length)]
        const discount = 20 + Math.floor(rng.next() * 30) // 20-49% discount

        save.eventsLog.push({
          id: eventId,
          type: EventType.SPONSOR,
          week,
          acknowledged: false,
          data: {
            title: `${brand} Equipment Deal`,
            message: `${brand} is offering your team a ${discount}% discount on new peripherals. This could give your players a slight edge and boost team morale.`,
            severity: "info",
            brand,
            discount,
          },
          choices: [
            { id: "accept_deal", text: `Accept Deal (-$3k, Morale +8)`, effects: { money: -3000, morale: 8 } },
            { id: "negotiate", text: "Counter-Offer (-$1.5k, Morale +4)", effects: { money: -1500, morale: 4 } },
            { id: "decline_deal", text: "Decline", effects: {} },
          ],
        })
        generated++
      }
    }

    return generated
  }

  // Legacy generateEvents() and related helpers removed — all event generation
  // now uses generateModernEvents() via atomic-week-processor.ts

}
