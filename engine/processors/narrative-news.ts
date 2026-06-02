/**
 * Narrative news generator.
 *
 * Builds flavor news items each tick covering:
 *   1. Monthly power rankings (every 4 weeks, week > 1)
 *   2. Big-match preview for player-team finals this week
 *   3. Yearly season recap flag (sets pendingSeasonRecap)
 *   4. Post-match headlines for completed matches from last week (max 2)
 *   5. Transfer rumors (15% per week, week > 4, expiring contracts)
 *   6. Rivalry storylines for Top-10 vs Top-10 matchups (50% chance)
 *   7. Player milestone celebrations (10% chance per week, 500/1000/2500 kill marks)
 *
 * All randomness is fed through the supplied SeededRNG so the news stream
 * is deterministic and replayable.
 *
 * Extracted from atomic-week-processor.ts. Surface area unchanged.
 */

import type { GameSave } from "../save-types"
import type { SeededRNG } from "../rng"
import type { SaveIndexes } from "@/store/indexes"

export function generateNarrativeNews(save: GameSave, rng: SeededRNG, idx?: SaveIndexes): void {
    // 1. Monthly Power Rankings
    if (save.currentWeek > 1 && (save.currentWeek - 1) % 4 === 0) {
        const topTeams = [...save.teams].sort((a, b) => b.elo - a.elo).slice(0, 5)
        if (topTeams.length > 0) {
            const topTeam = topTeams[0]
            save.newsFeed.unshift({
                id: `monthly_ranking_${save.currentWeek}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                title: `Pro Power Rankings: ${topTeam.name} Top!`,
                content: `In this month's official power rankings, ${topTeam.name} secures the #1 spot globally. Current top 5: ${topTeams.map(t => t.name).join(', ')}.`,
                category: "ACHIEVEMENT",
                teamId: topTeam.id,
                week: save.currentWeek,
                engagement: { likes: 1200 + Math.floor(rng.next() * 800), views: 15000 + Math.floor(rng.next() * 5000) },
            })
        }
    }

    // 2. Big Match Preview (Finals)
    const playerTeam = idx?.teamIndex.get(save.playerTeamId) ?? save.teams.find(t => t.id === save.playerTeamId)
    if (playerTeam) {
        const finalsMatch = save.scheduledMatches.find(m =>
            (m.homeTeamId === save.playerTeamId || m.awayTeamId === save.playerTeamId) &&
            m.week === save.currentWeek &&
            m.tournamentId && !m.isScrim &&
            (m.stage?.toLowerCase().includes('final') || m.id.toLowerCase().includes('final'))
        )

        if (finalsMatch) {
            const tournament = idx?.tournamentIndex.get(finalsMatch.tournamentId!)
                ?? save.tournaments.find(t => t.id === finalsMatch.tournamentId)
            save.newsFeed.unshift({
                id: `match_preview_${finalsMatch.id}`,
                title: `Grand Final Alert: ${playerTeam.name} Path to Glory`,
                content: `The world watches as ${playerTeam.name} prepares for the ${tournament?.name || 'Grand Final'}. "We are ready to leave everything on the server," says the team manager.`,
                category: "MATCH",
                teamId: playerTeam.id,
                week: save.currentWeek,
                engagement: { likes: 2500, views: 50000 },
            })
        }
    }

    // 3. Yearly Season Recap flag
    if (save.currentWeek > 1 && (save.currentWeek - 1) % 52 === 0) {
        const lastYear = Math.floor((save.currentWeek - 1) / 52)
        if (lastYear > 0) {
            save.pendingSeasonRecap = lastYear
        }
    }

    // 4. Post-Match Headlines (last week's completed matches, max 2)
    const recentMatches = save.completedMatches.filter(m => m.week === save.currentWeek - 1)
    for (const match of recentMatches.slice(0, 2)) {
        const homeTeam = idx?.teamIndex.get(match.homeTeamId) ?? save.teams.find(t => t.id === match.homeTeamId)
        const awayTeam = idx?.teamIndex.get(match.awayTeamId) ?? save.teams.find(t => t.id === match.awayTeamId)
        const winner = match.result.winnerId
            ? (idx?.teamIndex.get(match.result.winnerId) ?? save.teams.find(t => t.id === match.result.winnerId))
            : undefined
        const loser = match.result.winnerId === match.homeTeamId ? awayTeam : homeTeam

        if (winner && loser && match.tournamentId) {
            const tournament = idx?.tournamentIndex.get(match.tournamentId)
                ?? save.tournaments.find(t => t.id === match.tournamentId)
            let homeScore = match.result.homeScore
            let awayScore = match.result.awayScore

            // Defensive: if score is 0-0 but maps were played, derive from maps.
            if (homeScore === 0 && awayScore === 0 && match.result.maps && match.result.maps.length > 0) {
                match.result.maps.forEach(m => {
                    const hScore = m.homeScore || 0
                    const aScore = m.awayScore || 0
                    if (hScore > aScore) homeScore++
                    else if (aScore > hScore) awayScore++
                })
            }

            const scoreLine = `${homeScore}-${awayScore}`
            const isUpset = (loser?.elo || 0) > (winner?.elo || 0) + 100

            const headlines = isUpset
                ? [`UPSET! ${winner.name} Shocks ${loser.name}`, `${winner.name} Pulls Off Miracle Run`]
                : [`${winner.name} Dominates ${loser.name}`, `Clinical Win for ${winner.name}`]

            save.newsFeed.unshift({
                id: `headline_${match.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                title: headlines[Math.floor(rng.next() * headlines.length)],
                content: `${winner.name} defeats ${loser.name} ${scoreLine} in ${tournament?.name || 'tournament play'}. ${isUpset ? 'A stunning upset that nobody saw coming!' : 'A well-deserved victory.'}`,
                category: "MATCH",
                teamId: winner.id,
                week: save.currentWeek,
                engagement: { likes: 500 + Math.floor(rng.next() * 1500), views: 8000 + Math.floor(rng.next() * 12000) },
            })
        }
    }

    // 5. Transfer Rumors (15% per week, week > 4, expiring contracts)
    if (rng.next() < 0.15 && save.currentWeek > 4) {
        const allPlayers = save.players.filter(p => {
            const contract = idx?.contractIndex.get(p.id) ?? save.contracts.find(c => c.playerId === p.id)
            return contract && contract.endWeek - save.currentWeek < 12
        })

        if (allPlayers.length > 0) {
            const player = allPlayers[Math.floor(rng.next() * allPlayers.length)]
            // No index for roster membership — fall back to linear scan.
            const currentTeam = save.teams.find(t => t.rosterIds.includes(player.id))
            const interestedTeams = save.teams
                .filter(t => t.id !== currentTeam?.id && t.budget > 100000)
                .slice(0, 3)

            if (currentTeam && interestedTeams.length > 0) {
                const rumoredTeam = interestedTeams[Math.floor(rng.next() * interestedTeams.length)]

                // Title pool expanded from 3 → 12. Each branches on the
                // player's profile (form, role, age) so the headline
                // matches the story instead of always reading the same.
                const isHotForm = (player.avgRating ?? 1.0) >= 1.15
                const isVeteran = player.age >= 28
                const isStar = (player.totalMVPs ?? 0) >= 5 || (player.majorWins ?? 0) >= 1

                const titlePool: string[] = [
                    `RUMOR: ${rumoredTeam.name} eyes ${player.nickname}`,
                    `Transfer Watch: ${player.nickname} linked with move`,
                    `${rumoredTeam.name} in talks with ${player.nickname}?`,
                    `${player.nickname} on the move? ${rumoredTeam.name} circling.`,
                    `Sources: ${rumoredTeam.name} prepping an offer for ${player.nickname}`,
                ]
                if (isHotForm) {
                    titlePool.push(
                        `Hot streak draws interest: ${rumoredTeam.name} watching ${player.nickname}`,
                        `${player.nickname}'s form sparks bidding war`,
                    )
                }
                if (isVeteran) {
                    titlePool.push(
                        `${rumoredTeam.name} eye veteran signing in ${player.nickname}`,
                        `One last contract? ${player.nickname} linked with ${rumoredTeam.name}`,
                    )
                }
                if (isStar) {
                    titlePool.push(
                        `BLOCKBUSTER: ${rumoredTeam.name} chasing star ${player.nickname}`,
                        `${player.nickname} to ${rumoredTeam.name}? "Everything is possible," says agent`,
                    )
                }

                // Content pool — 4 archetypes, picked based on player profile.
                const contentTemplates = [
                    `Sources close to ${rumoredTeam.name} suggest they are monitoring ${player.nickname}'s contract situation at ${currentTeam.name}. The ${player.age}-year-old's deal expires soon.`,
                    `${rumoredTeam.name} are reportedly preparing a formal approach for ${player.nickname} once the transfer window opens. ${currentTeam.name} would be in their rights to demand a premium.`,
                    `${player.nickname} is "ready for a new challenge," according to people with knowledge of the situation. ${rumoredTeam.name} have been identified as the leading suitor.`,
                ]
                if (isHotForm) {
                    contentTemplates.push(
                        `${player.nickname}'s career-best ${player.avgRating?.toFixed(2)} rating has triggered interest from across the league. ${rumoredTeam.name} are believed to be at the front of the queue.`,
                    )
                }
                if (isStar) {
                    contentTemplates.push(
                        `A move for ${player.nickname} — ${(player.majorWins ?? 0)}× Major champion and ${(player.totalMVPs ?? 0)}× tournament MVP — would be the headline transfer of the off-season. ${rumoredTeam.name} have been credited with the interest.`,
                    )
                }

                save.newsFeed.unshift({
                    id: `rumor_${player.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                    title: titlePool[Math.floor(rng.next() * titlePool.length)],
                    content: contentTemplates[Math.floor(rng.next() * contentTemplates.length)],
                    category: "TRANSFER",
                    playerId: player.id,
                    teamId: rumoredTeam.id,
                    week: save.currentWeek,
                    engagement: {
                        // Star + hot-form rumors get higher engagement signal.
                        likes: (isStar ? 2400 : 800) + Math.floor(rng.next() * 1200),
                        views: (isStar ? 60000 : 20000) + Math.floor(rng.next() * 30000),
                    },
                })
            }
        }
    }

    // 6. Rivalry Storylines (Top-10 vs Top-10, 50% chance)
    const topTeamIds = new Set([...save.teams].sort((a, b) => b.elo - a.elo).slice(0, 10).map(t => t.id))
    const upcomingRivalry = save.scheduledMatches.find(m => {
        if (m.week !== save.currentWeek || m.isScrim) return false
        return topTeamIds.has(m.homeTeamId) && topTeamIds.has(m.awayTeamId)
    })

    if (upcomingRivalry && rng.next() < 0.5) {
        const home = idx?.teamIndex.get(upcomingRivalry.homeTeamId)
            ?? save.teams.find(t => t.id === upcomingRivalry.homeTeamId)
        const away = idx?.teamIndex.get(upcomingRivalry.awayTeamId)
            ?? save.teams.find(t => t.id === upcomingRivalry.awayTeamId)

        if (home && away) {
            const h2hMatches = save.completedMatches.filter(m =>
                (m.homeTeamId === home.id && m.awayTeamId === away.id) ||
                (m.homeTeamId === away.id && m.awayTeamId === home.id)
            )
            const homeWins = h2hMatches.filter(m => m.result.winnerId === home.id).length
            const awayWins = h2hMatches.filter(m => m.result.winnerId === away.id).length

            save.newsFeed.unshift({
                id: `rivalry_${upcomingRivalry.id}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                title: `Classic Clash: ${home.name} vs ${away.name}`,
                content: `Two titans collide this week! Historical record: ${home.name} ${homeWins} - ${awayWins} ${away.name}. Fans are hyped for this blockbuster matchup.`,
                category: "MATCH",
                teamId: home.id,
                week: save.currentWeek,
                engagement: { likes: 3000 + Math.floor(rng.next() * 2000), views: 75000 + Math.floor(rng.next() * 25000) },
            })
        }
    }

    // 7. Player Milestones (10% per week)
    if (playerTeam && rng.next() < 0.1) {
        const roster = save.players.filter(p => playerTeam.rosterIds.includes(p.id))
        for (const player of roster) {
            const totalKills = player.totalKills || 0
            const milestones = [
                { threshold: 500, name: "500 Tournament Kills" },
                { threshold: 1000, name: "1,000 Tournament Kills" },
                { threshold: 2500, name: "2,500 Tournament Kills" },
            ]

            for (const milestone of milestones) {
                // Window is 100 kills wide so the headline only fires once per
                // milestone reach (regardless of how many kills land that week).
                if (totalKills >= milestone.threshold && totalKills < milestone.threshold + 100) {
                    save.newsFeed.unshift({
                        id: `milestone_${player.id}_${milestone.threshold}_${Math.floor(rng.next() * 1_000_000_000).toString(36)}`,
                        title: `Milestone: ${player.nickname} hits ${milestone.name}!`,
                        content: `${player.nickname} has reached an incredible ${milestone.name} in their professional career. A testament to consistency and skill.`,
                        category: "ACHIEVEMENT",
                        playerId: player.id,
                        teamId: playerTeam.id,
                        week: save.currentWeek,
                        engagement: { likes: 1500, views: 25000 },
                    })
                    break
                }
            }
        }
    }
}
