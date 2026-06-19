"use client"

/**
 * Match-simulation slice.
 *
 * Two flagship actions for completing matches:
 *
 *   - saveMatchResult — applied to any "match has finished" event
 *     (whether the user played it live or the engine sim ran). Sanitizes
 *     the incoming MatchResult (clamps stats, repairs missing map IDs,
 *     guarantees a non-tie series winner), commits the completed match,
 *     and propagates every downstream effect: recent form, ELO updates,
 *     world-ranking deltas, sponsor goal progress, player XP / level-ups
 *     / weapon mastery, manager XP + achievement checks, tournament
 *     bracket progression (`processMatchResult` +
 *     `simulateConcurrentMatches`), news headline.
 *
 *   - simulateInstantMatch — runs SimulationEngineV2 against the resolved
 *     rosters + staff (with anti_strat coach penalty + talent morale
 *     floors applied), then funnels the result through saveMatchResult.
 *
 * Both actions only modify match-related state directly; downstream
 * mutations happen through engine modules. simulateInstantMatch calls
 * `get().saveMatchResult(...)` so the RPC stays intact even though both
 * actions live in the same slice.
 */

import type { SliceCreator } from "@/store/types"
import type {
    CompletedMatchSaveData,
    TeamSaveData,
} from "@/engine/save-types"
import type { Player, Team } from "@/types"
import {
    simulationEngineV2,
    TournamentManager,
    LeagueEngine,
    SeededRNG,
} from "@/engine"
import { ManagerProgression } from "@/engine/manager-progression"
import { applyPreMatchTalents } from "@/engine/match/apply-talents"
import { checkAchievements } from "@/engine/steam-service"
import {
    ensureDeterministicSeed,
    nextDeterministicId,
    ALLOWED_MAP_IDS,
    MAX_MAPS_PER_SERIES,
    MAX_ROUNDS_PER_MAP,
    MAX_MATCH_KILLS,
    MAX_MATCH_DEATHS,
    MAX_MATCH_ASSISTS,
    MAX_MATCH_CLUTCHES,
    MAX_MATCH_OPENINGS,
    MAX_MATCH_ADR,
    MAX_MATCH_RATING,
} from "@/store/utils/helpers"

const NEWS_FEED_CAP = 50

export interface MatchSimulationActions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MatchResult shape lives in @/types but is loosely typed
    saveMatchResult: (matchId: string, result: any) => void
    simulateInstantMatch: (matchId: string, opts?: { skippedPrep?: boolean }) => Promise<void>
}

export const createMatchSimulationSlice: SliceCreator<MatchSimulationActions> = (set, get) => ({
    saveMatchResult: (matchId, result) => {
        set((state) => {
            const matchIndex = state.scheduledMatches.findIndex(m => m.id === matchId)
            if (matchIndex === -1) return

            const match = state.scheduledMatches[matchIndex]
            const matchSeed = ensureDeterministicSeed(state, match)
            const matchRng = new SeededRNG(matchSeed)

            const homeTeam = state.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = state.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam || !state.playerTeamId) return

            const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
            if (!isPlayerMatch) return
            if (match.week > state.currentWeek) return

            const rosterIds = [...new Set([...homeTeam.rosterIds, ...awayTeam.rosterIds])]
            if (rosterIds.length === 0) return
            const rosterSet = new Set(rosterIds)

            const maxMapsForFormat = match.format === "BO1" ? 1 : match.format === "BO5" ? 5 : 3

            const clampInt = (value: unknown, min: number, max: number, fallback = min): number => {
                if (typeof value !== "number" || !Number.isFinite(value)) return fallback
                return Math.max(min, Math.min(max, Math.floor(value)))
            }
            const clampFloat = (value: unknown, min: number, max: number, fallback = min): number => {
                if (typeof value !== "number" || !Number.isFinite(value)) return fallback
                return Math.max(min, Math.min(max, value))
            }

            // Sanitize incoming map array: bounded length, known map IDs only,
            // round counts clamped, winner derived from rounds.
            const rawMaps = Array.isArray(result.maps) ? result.maps : []
            const sanitizedMaps = rawMaps
                .slice(0, Math.min(MAX_MAPS_PER_SERIES, maxMapsForFormat))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((rawMap: any, index: number) => {
                    const fallbackMapId = typeof match.maps?.[index] === "string"
                        && ALLOWED_MAP_IDS.has(match.maps[index])
                        ? match.maps[index]
                        : undefined
                    const mapId = typeof rawMap?.map === "string" && ALLOWED_MAP_IDS.has(rawMap.map)
                        ? rawMap.map
                        : fallbackMapId
                    if (!mapId) return null

                    const homeRounds = clampInt(rawMap?.homeScore ?? rawMap?.finalScore?.team1, 0, MAX_ROUNDS_PER_MAP, 0)
                    const awayRounds = clampInt(rawMap?.awayScore ?? rawMap?.finalScore?.team2, 0, MAX_ROUNDS_PER_MAP, 0)
                    const mapWinner = homeRounds > awayRounds
                        ? homeTeam.id
                        : awayRounds > homeRounds
                            ? awayTeam.id
                            : undefined

                    return {
                        ...rawMap,
                        map: mapId,
                        homeScore: homeRounds,
                        awayScore: awayRounds,
                        finalScore: { team1: homeRounds, team2: awayRounds },
                        winner: mapWinner,
                    }
                })
                .filter((entry: unknown): entry is NonNullable<typeof entry> => !!entry)

            // Compute series score from sanitized maps; fall back to provided
            // values only when no maps were played (BO1 edge case).
            let computedHomeSeries = 0
            let computedAwaySeries = 0
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sanitizedMaps.forEach((map: any) => {
                if (map.homeScore > map.awayScore) computedHomeSeries++
                else if (map.awayScore > map.homeScore) computedAwaySeries++
            })

            const providedHomeSeries = clampInt(result.homeScore, 0, maxMapsForFormat, 0)
            const providedAwaySeries = clampInt(result.awayScore, 0, maxMapsForFormat, 0)
            let homeSeries = (computedHomeSeries + computedAwaySeries) > 0 ? computedHomeSeries : providedHomeSeries
            let awaySeries = (computedHomeSeries + computedAwaySeries) > 0 ? computedAwaySeries : providedAwaySeries

            homeSeries = Math.min(maxMapsForFormat, homeSeries)
            awaySeries = Math.min(maxMapsForFormat, awaySeries)

            // Never allow a tied series at save boundary — would null the
            // winnerId field downstream and corrupt tournament progression.
            if (homeSeries === awaySeries) {
                if (providedHomeSeries !== providedAwaySeries) {
                    homeSeries = providedHomeSeries
                    awaySeries = providedAwaySeries
                } else {
                    // Deterministic coin flip from the match-seed RNG.
                    if (matchRng.bool(0.5)) homeSeries = Math.min(maxMapsForFormat, awaySeries + 1)
                    else awaySeries = Math.min(maxMapsForFormat, homeSeries + 1)
                }
            }

            const winnerId = homeSeries > awaySeries ? homeTeam.id : awayTeam.id
            const winnerRoster = winnerId === homeTeam.id ? homeTeam.rosterIds : awayTeam.rosterIds
            const fallbackMvp = rosterSet.has(result.mvpPlayerId)
                ? result.mvpPlayerId
                : (winnerRoster[0] || rosterIds[0])

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sanitizedPlayerStats = rosterIds.reduce<Record<string, any>>((acc, pid) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw = (result.playerStats as any)?.[pid]
                const kills = clampInt(raw?.kills, 0, MAX_MATCH_KILLS, 0)
                const deaths = clampInt(raw?.deaths, 0, MAX_MATCH_DEATHS, 0)
                const assists = clampInt(raw?.assists, 0, MAX_MATCH_ASSISTS, 0)
                // Headshots can never exceed kills.
                const headshots = clampInt(raw?.headshots, 0, kills, 0)

                acc[pid] = {
                    playerId: pid,
                    matchId: match.id,
                    kills,
                    deaths,
                    assists,
                    headshots,
                    adr: clampFloat(raw?.adr, 0, MAX_MATCH_ADR, 0),
                    kast: clampFloat(raw?.kast, 0, 100, 0),
                    rating: clampFloat(raw?.rating, 0, MAX_MATCH_RATING, 0),
                    clutches: clampInt(raw?.clutches, 0, MAX_MATCH_CLUTCHES, 0),
                    firstKills: clampInt(raw?.firstKills, 0, MAX_MATCH_OPENINGS, 0),
                    firstDeaths: clampInt(raw?.firstDeaths, 0, MAX_MATCH_OPENINGS, 0),
                    mapsPlayed: clampInt(raw?.mapsPlayed, 0, maxMapsForFormat, sanitizedMaps.length),
                }
                return acc
            }, {})

            result = {
                ...result,
                winnerId,
                homeScore: homeSeries,
                awayScore: awaySeries,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                maps: sanitizedMaps as any,
                mvpPlayerId: fallbackMvp,
                playerStats: sanitizedPlayerStats,
            }
            const completedMatch: CompletedMatchSaveData = { ...match, result }

            // Remove from scheduled list — match is committed below.
            state.scheduledMatches.splice(matchIndex, 1)

            const homeWon = result.homeScore > result.awayScore
            const isDraw = result.homeScore === result.awayScore

            // Recent form: keep last 5 results for the form widget.
            const updateForm = (team: TeamSaveData, formResult: "W" | "L" | "D") => {
                if (!team.recentForm) team.recentForm = []
                team.recentForm.push(formResult)
                if (team.recentForm.length > 5) team.recentForm.shift()
            }
            updateForm(homeTeam, isDraw ? "D" : (homeWon ? "W" : "L"))
            updateForm(awayTeam, isDraw ? "D" : (homeWon ? "L" : "W"))

            const oldHomeRank = homeTeam.worldRanking || 999
            const oldAwayRank = awayTeam.worldRanking || 999

            // ELO update (shared path with weekly auto-sim).
            if (!isDraw) {
                const wId = homeWon ? homeTeam.id : awayTeam.id
                const lId = homeWon ? awayTeam.id : homeTeam.id
                const scoreDiff = Math.abs(result.homeScore - result.awayScore)
                const tournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
                    ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
                    : undefined

                let homeRoundsTotal = 0
                let awayRoundsTotal = 0
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result.maps.forEach((m: any) => {
                    homeRoundsTotal += m.homeScore || 0
                    awayRoundsTotal += m.awayScore || 0
                })
                const roundDiff = homeWon
                    ? (homeRoundsTotal - awayRoundsTotal)
                    : (awayRoundsTotal - homeRoundsTotal)

                const getMatchesPlayed = (teamId: string) =>
                    state.completedMatches.filter(m => m.homeTeamId === teamId || m.awayTeamId === teamId).length
                const winnerMatches = getMatchesPlayed(wId)
                const loserMatches = getMatchesPlayed(lId)

                const eloResult = LeagueEngine.updateEloAfterMatch(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    state as any,
                    wId,
                    lId,
                    scoreDiff,
                    tournamentTier,
                    winnerMatches,
                    loserMatches,
                    roundDiff,
                )

                if (eloResult) {
                    completedMatch.eloChange = {
                        home: homeWon ? eloResult.winnerChange : eloResult.loserChange,
                        away: homeWon ? eloResult.loserChange : eloResult.winnerChange,
                    }
                }
            }

            // World rankings are no longer re-sorted inside updateEloAfterMatch
            // (that was O(n log n) per match on the week-tick hot path). Refresh
            // once here on the live path so the player's post-match rankingChange
            // below reflects the new standings immediately.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            LeagueEngine.refreshWorldRankings(state as any)

            completedMatch.rankingChange = {
                home: oldHomeRank - (homeTeam.worldRanking || 999),
                away: oldAwayRank - (awayTeam.worldRanking || 999),
            }

            state.completedMatches.push(completedMatch)

            // Sponsor goal progress: per-match "Win Matches" / "Win Tournament maps".
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;[homeTeam, awayTeam].forEach(team => {
                const wonMatch = (team.id === homeTeam.id && homeWon) || (team.id === awayTeam.id && !homeWon)
                if (!team.sponsors) return
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                team.sponsors.forEach((sponsor: any) => {
                    if (!sponsor.goals) return
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    sponsor.goals.forEach((goal: any) => {
                        if (goal.isCompleted) return
                        if (goal.description.includes("Win Matches") && wonMatch) goal.current += 1
                        if (goal.description.includes("Win Tournament maps")) {
                            const mapsWon = team.id === homeTeam.id ? result.homeScore : result.awayScore
                            goal.current += mapsWon
                        }
                        if (goal.current >= goal.target) {
                            goal.current = goal.target
                            goal.isCompleted = true
                            const payoutEntryId = `fin_sponsor_match_${state.currentWeek}_${team.id}_${sponsor.id}_${goal.id}_${matchId}`
                            const alreadyPaid = state.financeLedger.some(entry => entry.id === payoutEntryId)
                            if (alreadyPaid) return
                            team.budget += goal.bonusPayout
                            state.financeLedger.push({
                                id: payoutEntryId,
                                week: state.currentWeek,
                                teamId: team.id,
                                type: "INCOME",
                                category: "SPONSOR",
                                amount: goal.bonusPayout,
                                description: `Goal Reached: ${goal.description}`,
                                balance: team.budget,
                            })
                            if (team.id === state.playerTeamId) {
                                const eventId = `evt_sponsor_match_goal_${state.currentWeek}_${sponsor.id}_${goal.id}_${matchId}`
                                if (!state.eventsLog.some(event => event.id === eventId)) {
                                    state.eventsLog.unshift({
                                        id: eventId,
                                        type: "SPONSOR_OFFER",
                                        week: state.currentWeek,
                                        data: {
                                            title: "Sponsor Goal Met",
                                            message: `${sponsor.name} sent a bonus of $${goal.bonusPayout.toLocaleString()}.`,
                                        },
                                        acknowledged: false,
                                    })
                                }
                            }
                        }
                    })
                })
            })

            // Player XP, level-ups, weapon mastery, morale/fatigue.
            const xpGains: Record<string, number> = {}
            const playerMap = new Map(state.players.map(p => [p.id, p]))
            const matchTournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
                ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
                : undefined
            const updatePlayerStats = (team: TeamSaveData, won: boolean) => {
                if (!team || !result.playerStats) return
                const playedIds = Object.keys(result.playerStats).filter(pid => team.rosterIds.includes(pid))
                playedIds.forEach(pid => {
                    const player = playerMap.get(pid)
                    if (!player) return

                    player.matchesPlayed++
                    // Fatigue scales by format (BO1=10, BO3=15, BO5=25).
                    const fatigueCost = match.format === "BO5" ? 25 : match.format === "BO3" ? 15 : 10
                    player.fatigue = Math.min(100, (player.fatigue || 0) + fatigueCost)
                    // Morale swing scales by tournament tier.
                    const moraleChange = (() => {
                        if (!matchTournamentTier) return won ? 5 : -5
                        switch (matchTournamentTier) {
                            case "S_TIER": return won ? 15 : -3
                            case "A_TIER": return won ? 10 : -4
                            case "B_TIER": return won ? 7 : -5
                            default: return won ? 5 : -5
                        }
                    })()
                    player.morale = Math.max(0, Math.min(100, (player.morale || 50) + moraleChange))

                    const stats = result.playerStats[pid]
                    if (!stats) return

                    player.totalKills = (player.totalKills || 0) + stats.kills
                    player.totalDeaths = (player.totalDeaths || 0) + stats.deaths
                    if (result.mvpPlayerId === pid) player.totalMVPs = (player.totalMVPs || 0) + 1

                    // XP: base + tournament tier bonus + rating bonus + MVP bonus.
                    let baseXP = won ? 150 : 80
                    if (matchTournamentTier) {
                        const tierBonus: Record<string, number> = { S_TIER: 200, A_TIER: 150, B_TIER: 100, C_TIER: 50 }
                        baseXP += tierBonus[matchTournamentTier] ?? 50
                    }
                    const ratingBonus = Math.max(0, (stats.rating - 1.0) * 200)
                    const mvpBonus = (result.mvpPlayerId === pid) ? 50 : 0
                    const totalXP = Math.round(baseXP + ratingBonus + mvpBonus)
                    xpGains[pid] = totalXP
                    player.xp = (player.xp || 0) + totalXP

                    // Level-up — 1.5× XP cap each level, 1 talent point per level.
                    if (player.xp >= (player.xpToNextLevel || 1000)) {
                        player.xp -= (player.xpToNextLevel || 1000)
                        player.level = (player.level || 1) + 1
                        player.talentPoints = (player.talentPoints || 0) + 1
                        player.xpToNextLevel = Math.floor((player.xpToNextLevel || 1000) * 1.5)
                        state.eventsLog.unshift({
                            id: nextDeterministicId(state, "evt_lvl", player.id),
                            type: "PLAYER_LEVEL_UP",
                            week: state.currentWeek,
                            data: { playerName: player.nickname, newLevel: player.level },
                            acknowledged: false,
                        })
                    }

                    // Weapon mastery: AWPER → AWP, else AK47 or M4A4 (50/50 deterministic from match RNG).
                    if (!player.weaponMastery) player.weaponMastery = {}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const role = (player as any).role || "RIFLER"
                    let primaryWeapon = "AK47"
                    if (role === "AWPER") primaryWeapon = "AWP"
                    else if (matchRng.bool(0.5)) primaryWeapon = "M4A4"

                    if (stats.kills > 0) {
                        const weaponXp = stats.kills * 10
                        if (!player.weaponMastery[primaryWeapon]) {
                            player.weaponMastery[primaryWeapon] = { xp: 0, level: 1, kills: 0 }
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const mastery = player.weaponMastery[primaryWeapon] as any
                        mastery.kills += stats.kills
                        mastery.xp += weaponXp
                        const xpToNext = mastery.level * 200
                        if (mastery.xp >= xpToNext && mastery.level < 10) {
                            mastery.level++
                            mastery.xp -= xpToNext
                            if (mastery.level === 10) {
                                state.eventsLog.unshift({
                                    id: nextDeterministicId(state, "evt_max"),
                                    type: "TRAINING_COMPLETE",
                                    week: state.currentWeek,
                                    data: { title: "Signature Weapon", message: `${player.nickname} mastered ${primaryWeapon}!` },
                                    acknowledged: false,
                                })
                            }
                        }
                    }
                })
            }
            updatePlayerStats(homeTeam, homeWon)
            updatePlayerStats(awayTeam, !homeWon)

            // Manager stats + achievements + XP, only when player team was in the match.
            if (homeTeam.id === state.playerTeamId || awayTeam.id === state.playerTeamId) {
                const pWon = (homeTeam.id === state.playerTeamId && homeWon)
                    || (awayTeam.id === state.playerTeamId && !homeWon)
                state.managerDetails.careerMatches = (state.managerDetails.careerMatches || 0) + 1
                if (pWon) state.managerDetails.careerWins = (state.managerDetails.careerWins || 0) + 1
                else state.managerDetails.careerLosses = (state.managerDetails.careerLosses || 0) + 1

                checkAchievements({
                    totalWins: state.managerDetails.careerWins,
                    matchesPlayed: state.managerDetails.careerMatches,
                    firstTournamentParticipation: !!match.tournamentId && match.tournamentId !== "SCRIM",
                })

                ManagerProgression.gainXP(state, pWon ? 100 : 25)
            }

            // Tournament bracket progression — kept inside the immer set so
            // mutations to playoffBracket land in the same draft.
            if (match.tournamentId && match.tournamentId !== "SCRIM") {
                const rng = new SeededRNG(matchSeed)
                const wId = homeWon ? homeTeam.id : awayTeam.id
                const lId = homeWon ? awayTeam.id : homeTeam.id
                const tournament = state.tournaments.find(t => t.id === match.tournamentId)

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                TournamentManager.processMatchResult(state as any, match.tournamentId, matchId, wId, lId)
                TournamentManager.simulateConcurrentMatches(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    state as any,
                    match.tournamentId,
                    state.playerTeamId || "",
                    match.stage || "",
                    rng,
                )

                // Safety: re-schedule the next bracket match if both sides
                // are now known but it never got picked up by the processor.
                if (tournament?.playoffBracket) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const matchInBracket = tournament.playoffBracket.find((m: any) => m.id === matchId)
                    if (matchInBracket) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const nextMatch = tournament.playoffBracket.find((m: any) =>
                            m.sourceMatchIds?.includes(matchId) && !m.isCompleted
                        )
                        if (nextMatch && nextMatch.homeTeamId && nextMatch.awayTeamId) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const alreadyScheduled = state.scheduledMatches.some((m: any) => m.id === nextMatch.id)
                            if (!alreadyScheduled) {
                                state.scheduledMatches.push({
                                    id: nextMatch.id,
                                    homeTeamId: nextMatch.homeTeamId,
                                    awayTeamId: nextMatch.awayTeamId,
                                    tournamentId: nextMatch.tournamentId,
                                    stage: nextMatch.stage,
                                    week: nextMatch.week,
                                    format: nextMatch.format,
                                    seed: ensureDeterministicSeed(state, nextMatch as { seed?: number }),
                                    isHighPressure: nextMatch.stage?.includes("Final") || nextMatch.stage?.includes("Semi"),
                                })
                            }
                        }
                    }
                }
            }

            result.xpGains = xpGains
            state.activeMatchId = null
            state.activeMatchState = null

            // Post-match news headline (player team's perspective).
            const winner = homeWon ? homeTeam : awayTeam
            const loser = homeWon ? awayTeam : homeTeam
            const scoreStr = homeWon
                ? `${result.homeScore}-${result.awayScore}`
                : `${result.awayScore}-${result.homeScore}`
            state.newsFeed.unshift({
                id: nextDeterministicId(state, "news_match"),
                title: `${winner.name} defeat ${loser.name} ${scoreStr}`,
                content: `${winner.name} secured a ${scoreStr} victory against ${loser.name}.`,
                category: "MATCH",
                teamId: winner.id,
                week: state.currentWeek,
            })
            if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
        })
    },

    simulateInstantMatch: async (matchId: string, opts: { skippedPrep?: boolean } = {}) => {
        const state = get()
        const match = state.scheduledMatches.find(m => m.id === matchId)
        if (!match) return
        if (!state.playerTeamId) return

        const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
        if (!isPlayerMatch) return
        if (match.week > state.currentWeek) return
        // HYBRID_DAILY: refuse simulating a match from a future day.
        if (state.timeMode === "HYBRID_DAILY" && match.week === state.currentWeek) {
            const matchDay = match.day ?? 6
            if (matchDay > state.currentDay) return
        }

        const hTeam = state.teams.find(t => t.id === match.homeTeamId)
        const aTeam = state.teams.find(t => t.id === match.awayTeamId)
        if (!hTeam || !aTeam) return

        const hPlayers = hTeam.rosterIds
            .map(id => state.players.find(p => p.id === id))
            .filter(Boolean) as unknown as Player[]
        const aPlayers = aTeam.rosterIds
            .map(id => state.players.find(p => p.id === id))
            .filter(Boolean) as unknown as Player[]

        // The week-tick auto-sim forfeits depleted rosters (match-forfeit.ts);
        // this path silently played 3v5 instead. Refuse the player's own
        // depleted match with a clear reason - advancing the week forfeits it
        // properly, so this can't softlock.
        if (state.playerTeamId === hTeam.id && hPlayers.length < 5) {
            get().addToast({ message: `You need 5 active players to play - your roster has ${hPlayers.length}.`, type: "warning" })
            return
        }
        if (state.playerTeamId === aTeam.id && aPlayers.length < 5) {
            get().addToast({ message: `You need 5 active players to play - your roster has ${aPlayers.length}.`, type: "warning" })
            return
        }

        const hStaffData = state.staff.filter(s => hTeam.staffIds.includes(s.id))
        const aStaffData = state.staff.filter(s => aTeam.staffIds.includes(s.id))

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapStaff = (sData: any[]) => ({
            coach: sData.find(s => s.role === "coach"),
            analyst: sData.find(s => s.role === "analyst"),
            psychologist: sData.find(s => s.role === "psychologist"),
        })

        // Pre-match staff-talent application — morale_floor + timeout_morale
        // + anti_strat in one call. Centralized in engine/match/apply-talents.ts
        // so the slice + match-engine + live-match paths stay in lockstep.
        const { homeAntiStrat, awayAntiStrat } = applyPreMatchTalents(
            hPlayers, aPlayers, hStaffData, aStaffData,
        )

        const hStaff = mapStaff(hStaffData)
        const aStaff = mapStaff(aStaffData)

        // anti_strat applied to opponent coach tactic bonus. mapStaff returns
        // raw StaffSaveData without a tacticBonus field — derive from level.
        if (homeAntiStrat > 0 && aStaff.coach) {
            const baseTactic = aStaff.coach.tacticBonus || (aStaff.coach.level || 1) * 2
            aStaff.coach.tacticBonus = Math.round(baseTactic * (1 - homeAntiStrat))
        }
        if (awayAntiStrat > 0 && hStaff.coach) {
            const baseTactic = hStaff.coach.tacticBonus || (hStaff.coach.level || 1) * 2
            hStaff.coach.tacticBonus = Math.round(baseTactic * (1 - awayAntiStrat))
        }

        const bestOf = match.format === "BO3" ? 3 : match.format === "BO5" ? 5 : 1
        const fallbackSeed = Math.max(
            1,
            Array.from(match.id).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 0),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const runtimeMatch: any = {
            ...match,
            seed: (typeof match.seed === "number" && match.seed > 0) ? match.seed : fallbackSeed,
            bestOf,
        }

        // B4 differential: a one-click dashboard Quick-Sim skips the match-day
        // prep flow, so the player's team forgoes a small edge. Applied to a
        // transient copy only (never persisted); opponents and prepared players
        // (tactics-page "simulate instead", which passes no flag) are untouched.
        const QUICK_SIM_PREP_PENALTY = 0.04
        const withPrepPenalty = (team: typeof hTeam) =>
            opts.skippedPrep && team.id === state.playerTeamId
                ? { ...team, prepPenalty: QUICK_SIM_PREP_PENALTY }
                : team

        const result = simulationEngineV2.simulateMatch(
            runtimeMatch,
            withPrepPenalty(hTeam) as unknown as Team,
            withPrepPenalty(aTeam) as unknown as Team,
            hPlayers,
            aPlayers,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hStaff as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            aStaff as any,
        )

        // Cross-slice RPC — works because saveMatchResult is in the same
        // slice and was spread into the StoreState alongside us.
        get().saveMatchResult(matchId, result)

        // Achievement re-check after the manager stats bump.
        checkAchievements({
            totalWins: get().managerDetails.careerWins,
            firstTournamentParticipation: !!match.tournamentId && match.tournamentId !== "SCRIM",
        })

        // If we just simulated the match the user was actively viewing,
        // clear the live-match shell.
        if (get().activeMatchId === matchId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(set as any)({ activeMatchId: null, activeMatchState: null })
        }
    },
})
