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
import { getActivePlayersByRosterOrder } from '@/lib/live-match-builders'
import type {
    CompletedMatchSaveData,
    TeamSaveData,
} from "@/engine/save-types"
import {
    TournamentManager,
    LeagueEngine,
    SeededRNG,
} from "@/engine"
import { ManagerProgression } from "@/engine/manager-progression"
import { applyFormResult, applyMoraleResult } from "@/engine/player-lifecycle"
import { settlePlayerContractBonuses } from "@/engine/processors/player-contract-bonuses"
import { processMatchWeaponMastery } from "@/engine/processors/match-weapon-mastery"
import type { GameSave } from "@/engine/save-types"
import { prepareLegacySeries, buildManagementRecord } from "@/engine/match/legacy-prepare"
import { runLegacySeries, finalizeLegacySeries } from "@/engine/match/legacy-series"
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

import { formatCurrency } from "@/lib/utils-extended"
const NEWS_FEED_CAP = 50

export interface MatchSimulationActions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MatchResult shape lives in @/types but is loosely typed
    saveMatchResult: (matchId: string, result: any) => void
    simulateInstantMatch: (matchId: string, opts?: { skippedPrep?: boolean }) => Promise<boolean>
}

export const createMatchSimulationSlice: SliceCreator<MatchSimulationActions> = (set, get) => ({
    saveMatchResult: (matchId, result) => {
        set((state) => {
            if (state.completedMatches.some(m => m.id === matchId)) return
            if (!result || result.engineVersion && result.engineVersion !== 'legacy-v2') return
            const matchIndex = state.scheduledMatches.findIndex(m => m.id === matchId)
            if (matchIndex === -1) return

            const match = state.scheduledMatches[matchIndex]
            // Reject contradictory map identity; never relabel events from a different map.
            if (Array.isArray(result.maps) && result.maps.some((m: { map?: string }, i: number) => match.maps?.[i] && m?.map && match.maps[i] !== m.map)) return
            const matchSeed = ensureDeterministicSeed(state, match)
            const matchRng = new SeededRNG(matchSeed)

            const homeTeam = state.teams.find(t => t.id === match.homeTeamId)
            const awayTeam = state.teams.find(t => t.id === match.awayTeamId)
            if (!homeTeam || !awayTeam || !state.playerTeamId) return

            const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
            if (!isPlayerMatch) return
            if (match.week > state.currentWeek) return

            const rosterIds = [...new Set([...homeTeam.rosterIds.slice(0, 5), ...awayTeam.rosterIds.slice(0, 5)])]
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
            result.engineVersion = 'legacy-v2'
            // Keep the match-time lineup the engine recorded (L21.A2); only derive
            // from the current roster when a result arrives without a valid one.
            const knownPlayers = new Set(state.players.map(p => p.id))
            const recorded = (teamId: string) => {
                const ids = result.lineups?.[teamId]
                return Array.isArray(ids) && ids.length > 0 && ids.length <= 5 && new Set(ids).size === ids.length && ids.every((id: unknown) => typeof id === "string" && knownPlayers.has(id)) ? ids as string[] : undefined
            }
            result.lineups = {
                [homeTeam.id]: recorded(homeTeam.id) ?? getActivePlayersByRosterOrder(homeTeam, state.players).map(p => p.id),
                [awayTeam.id]: recorded(awayTeam.id) ?? getActivePlayersByRosterOrder(awayTeam, state.players).map(p => p.id),
            }
            const completedMatch: CompletedMatchSaveData = { ...match, engineVersion: 'legacy-v2', result }

            // Remove from scheduled list — match is committed below.
            state.scheduledMatches.splice(matchIndex, 1)

            const homeWon = result.homeScore > result.awayScore
            const isDraw = result.homeScore === result.awayScore
            settlePlayerContractBonuses(state, matchId, homeTeam.id, !isDraw && homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId)
            settlePlayerContractBonuses(state, matchId, awayTeam.id, !isDraw && !homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId)

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
                                            message: `${sponsor.name} sent a bonus of ${formatCurrency(goal.bonusPayout, "$", false)}.`,
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
                    player.morale = applyMoraleResult(player.morale || 50, moraleChange)
                    player.form = applyFormResult(player.form, won)

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
                        // Opponent level-ups are not the manager's news (and each would toast).
                        if (team.id === state.playerTeamId) state.eventsLog.unshift({
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
                        const existing = player.weaponMastery[primaryWeapon]
                        if (typeof existing === "number") {
                            // The weekly auto-sim (WeaponMasteryManager) stores AWP as
                            // a plain XP total. Keep that canonical shape and scale
                            // instead of writing object fields onto a number (crash).
                            player.weaponMastery[primaryWeapon] = existing + stats.kills * 4
                            return
                        }
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
            // Canonical weapon-category mastery (RIFLE/AWP/PISTOL/SMG XP), the
            // track the match engine reads. The weekly tick applies it to every
            // AI match; matches committed here never did, so managed starters
            // stayed at mastery 0 while AI starters reached +12 accuracy /
            // +8 damage (~+10 equipment power per player). Parity fix.
            processMatchWeaponMastery(state as unknown as GameSave, result)

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
        // Already recorded (double click, retry): report success so callers
        // can show the result instead of a not-found screen.
        if (state.completedMatches.some(m => m.id === matchId)) return true
        const match = state.scheduledMatches.find(m => m.id === matchId)
        if (!match) {
            get().addToast({ message: 'That match is no longer on your schedule.', type: 'warning' })
            return false
        }
        if (!state.playerTeamId) return false
        if (state.activeMatchId || state.activeMatchState) {
            get().addToast({ message: 'Resume your active match to keep its recorded rounds and lineup.', type: 'warning' })
            return false
        }

        const isPlayerMatch = match.homeTeamId === state.playerTeamId || match.awayTeamId === state.playerTeamId
        if (!isPlayerMatch) return false
        if (match.week > state.currentWeek) {
            get().addToast({ message: "This match isn't due yet.", type: 'warning' })
            return false
        }
        // HYBRID_DAILY: refuse simulating a match from a future day.
        if (state.timeMode === "HYBRID_DAILY" && match.week === state.currentWeek) {
            const matchDay = match.day ?? 6
            if (matchDay > state.currentDay) {
                get().addToast({ message: "This match isn't due yet.", type: 'warning' })
                return false
            }
        }

        const hTeam = state.teams.find(t => t.id === match.homeTeamId)
        const aTeam = state.teams.find(t => t.id === match.awayTeamId)
        if (!hTeam || !aTeam) return false

        const hPlayers = getActivePlayersByRosterOrder(hTeam, state.players).map(p => structuredClone(p))
        const aPlayers = getActivePlayersByRosterOrder(aTeam, state.players).map(p => structuredClone(p))

        // The week-tick auto-sim forfeits depleted rosters (match-forfeit.ts);
        // this path silently played 3v5 instead. Refuse the player's own
        // depleted match with a clear reason - advancing the week forfeits it
        // properly, so this can't softlock.
        if (state.playerTeamId === hTeam.id && hPlayers.length < 5) {
            get().addToast({ message: `You need 5 active players to play - your roster has ${hPlayers.length}.`, type: "warning" })
            return false
        }
        if (state.playerTeamId === aTeam.id && aPlayers.length < 5) {
            get().addToast({ message: `You need 5 active players to play - your roster has ${aPlayers.length}.`, type: "warning" })
            return false
        }
        // Either roster understrength (e.g. the opponent got gutted by injuries /
        // retirements): refuse rather than let simulateMatch crash pickWeighted
        // ("No players to pick from"). Advancing the week forfeits it properly.
        if (hPlayers.length < 5 || aPlayers.length < 5) {
            const shorthanded = hPlayers.length < 5 ? hTeam : aTeam
            get().addToast({ message: `${shorthanded.name} can't field 5 players - advance the week to resolve this match by forfeit.`, type: "warning" })
            return false
        }

        // Shared preparation + canonical series runner: identical to the live
        // screen's path for the same seed, maps, lineup and decisions (L21/L14).
        const ctx = prepareLegacySeries({
            match,
            homeTeam: hTeam,
            awayTeam: aTeam,
            homePlayers: hPlayers,
            awayPlayers: aPlayers,
            staff: state.staff,
            customTactics: state.customTactics,
            managedTeamId: state.playerTeamId ?? undefined,
        })
        const run = runLegacySeries(ctx)
        const result = finalizeLegacySeries(ctx, run.state, buildManagementRecord({ ctx, match, mode: 'instant', timeoutsUsed: 0, maps: run.state.maps }))

        // Cross-slice RPC — works because saveMatchResult is in the same
        // slice and was spread into the StoreState alongside us.
        get().saveMatchResult(matchId, result)
        if (!get().completedMatches.some(m => m.id === matchId)) {
            get().addToast({ message: "The match result couldn't be recorded. Your match is still on the schedule.", type: 'error' })
            return false
        }

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
        return true
    },
})
