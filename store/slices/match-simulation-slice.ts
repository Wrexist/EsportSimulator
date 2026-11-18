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

import { liveText, type TextParam, type TextRef } from "@/lib/i18n"
import { adaptHabits } from "@/engine/match/habits"
import { autoVetoMaps } from "@/lib/auto-veto"
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
import { getAnalystXpMultiplier, LOSS_XP_BASE, WIN_XP_BASE } from "@/engine/processors/match-manager-xp"
import { applyFormResult, applyMoraleResult, resultSurpriseFactor } from "@/engine/player-lifecycle"
import { expectedScore } from "@/engine/world-ranking"
import { isOfficialMatch, lineupDefeatShield, playerResultMorale, recordAppearances } from "@/engine/personality"
import { settlePlayerContractBonuses } from "@/engine/processors/player-contract-bonuses"
import { applyMatchSponsorGoalProgress } from "@/engine/processors/match-sponsor-goals"
import { processMatchWeaponMastery } from "@/engine/processors/match-weapon-mastery"
import { recordOfficialMatch } from "@/engine/official-stats"
import { queueDecidedTitle } from "@/engine/processors/standings-processor"
import { updateRivalries } from "@/engine/history-tracker"
import { closePressConference, settlePressStakes } from "@/engine/storylines/press"
import type { GameSave } from "@/engine/save-types"
import { proMatchGoal, recordProMatch } from "@/engine/pro-career"
import { prepareLegacySeries, buildManagementRecord } from "@/engine/match/legacy-prepare"
import { isEngineVersion, LEGACY_ENGINE_VERSION, type EngineVersion } from "@/engine/match/engine-version"
import { runLegacySeries, finalizeLegacySeries } from "@/engine/match/legacy-series"
import { checkAchievements } from "@/engine/steam-service"
import { detectAchievementFlags } from "@/engine/processors/match-achievement-flags"
import { officialCareerWins } from "@/engine/processors/post-tick-achievements"
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

import { persistCommittedMatch } from "@/lib/live-checkpoint-store"
import { divisionRef, eventText, newsText } from "@/lib/news-ref"
import { eventDisplayName } from "@/lib/tournament-instances"
import { sideScore } from "@/lib/week-changes"
import { matchFatigueCost } from "@/lib/balance-tuning"
const NEWS_FEED_CAP = 50
/** Pre-match odds under which the own result gets the upset headline (NEWPLAYER-15). */
const UPSET_NEWS_EXPECTED = 0.25

export interface MatchSimulationActions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- MatchResult shape lives in @/types but is loosely typed
    saveMatchResult: (matchId: string, result: any) => void
    simulateInstantMatch: (matchId: string, opts?: { skippedPrep?: boolean }) => Promise<boolean>
    /** One click from a match stop: the engine's veto if none was made, the counters the VOD review found, then Quick sim. */
    prepAndSimMatch: (matchId: string) => Promise<boolean>
}

export const createMatchSimulationSlice: SliceCreator<MatchSimulationActions> = (set, get) => ({
    saveMatchResult: (matchId, result) => {
        set((state) => {
            if (state.completedMatches.some(m => m.id === matchId)) return
            if (!result || result.engineVersion && !isEngineVersion(result.engineVersion)) return
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
            // C10: the pro's personal goal as shown before the match.
            const proGoal = proMatchGoal(state as unknown as GameSave)
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
            // Results without a stamp predate script-v1.
            const engineVersion: EngineVersion = isEngineVersion(result.engineVersion) ? result.engineVersion : LEGACY_ENGINE_VERSION
            result.engineVersion = engineVersion
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
            const completedMatch: CompletedMatchSaveData = { ...match, engineVersion, result }

            // Remove from scheduled list — match is committed below.
            state.scheduledMatches.splice(matchIndex, 1)

            const homeWon = result.homeScore > result.awayScore
            const isDraw = result.homeScore === result.awayScore
            settlePlayerContractBonuses(state, matchId, homeTeam.id, !isDraw && homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, undefined, isOfficialMatch(match))
            settlePlayerContractBonuses(state, matchId, awayTeam.id, !isDraw && !homeWon, Object.keys(result.playerStats ?? {}), result.mvpPlayerId, undefined, isOfficialMatch(match))

            // Recent form: keep last 5 results for the form widget.
            const updateForm = (team: TeamSaveData, formResult: "W" | "L" | "D") => {
                if (!team.recentForm) team.recentForm = []
                team.recentForm.push(formResult)
                if (team.recentForm.length > 5) team.recentForm.shift()
            }
            updateForm(homeTeam, isDraw ? "D" : (homeWon ? "W" : "L"))
            updateForm(awayTeam, isDraw ? "D" : (homeWon ? "L" : "W"))

            // C1: the result is judged against the pre-match odds (Elo before the exchange below).
            const homeExpected = expectedScore(homeTeam.elo ?? 1000, awayTeam.elo ?? 1000)
            completedMatch.homeExpected = Math.round(homeExpected * 1000) / 1000

            const oldHomeRank = homeTeam.worldRanking || 999
            const oldAwayRank = awayTeam.worldRanking || 999
            // MODES-04: the managed club's comeback / upset, judged on the pre-match ranks.
            const achievementFlags = detectAchievementFlags(
                result,
                { id: homeTeam.id, worldRanking: homeTeam.worldRanking },
                { id: awayTeam.id, worldRanking: awayTeam.worldRanking },
                state.playerTeamId,
            )
            if (achievementFlags.comebackWin) completedMatch._comebackWin = true
            if (achievementFlags.underdogWin) completedMatch._underdogWin = true

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

                const eloResult = LeagueEngine.updateEloAfterMatch(
                    state,
                    wId,
                    lId,
                    scoreDiff,
                    tournamentTier,
                    undefined,
                    undefined,
                    roundDiff,
                    { tournamentId: match.tournamentId, stage: match.stage, maps: result.maps.length },
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
            // Phase 5.3: played matches build rivalries too (the week tick's
            // path already did), and the match's press conference closes.
            updateRivalries(state as unknown as GameSave, completedMatch)
            closePressConference(state, matchId)
            // A bold claim made to the press is settled by the result.
            // A draw settles nothing.
            if (completedMatch.result?.winnerId) settlePressStakes(state as never, matchId, completedMatch.result.winnerId === state.playerTeamId)
            // R3: the other club reads the counters it faced and may change those habits.
            if (match.counters && Object.keys(match.counters).length) {
                const rival = match.homeTeamId === state.playerTeamId ? awayTeam : homeTeam
                rival.habits = adaptHabits(rival.habits, match.counters, rival.id, matchSeed)
            }

            // Careers, season tallies and records (Phase 5.1): one shared
            // path with the week tick's AI matches. Friendlies don't count.
            {
                const players = new Map(state.players.map(p => [p.id, p]))
                recordOfficialMatch(state as unknown as GameSave, completedMatch, result, {
                    player: id => players.get(id),
                    team: id => (id === homeTeam.id ? homeTeam : id === awayTeam.id ? awayTeam : state.teams.find(t => t.id === id)),
                })
            }

            // Sponsor goal progress: per-match "Win Matches" / "Win Tournament maps".
            // One shared path with the week tick's matches (MARKET-01): only
            // official matches count, and the bonus pays through paySponsorGoalBonus.
            applyMatchSponsorGoalProgress(state as unknown as GameSave, homeTeam, !isDraw && homeWon, result.homeScore, match)
            applyMatchSponsorGoalProgress(state as unknown as GameSave, awayTeam, !isDraw && !homeWon, result.awayScore, match)

            // Player XP, level-ups, weapon mastery, morale/fatigue.
            const xpGains: Record<string, number> = {}
            const playerMap = new Map(state.players.map(p => [p.id, p]))
            const matchTournamentTier = (match.tournamentId && match.tournamentId !== "SCRIM")
                ? state.tournaments.find(t => t.id === match.tournamentId)?.tier
                : undefined
            const lookupPlayer = (id: string) => playerMap.get(id)
            const updatePlayerStats = (team: TeamSaveData, won: boolean, expected: number) => {
                if (!team || !result.playerStats) return
                const surprise = resultSurpriseFactor(expected, won)
                const playedIds = Object.keys(result.playerStats).filter(pid => team.rosterIds.includes(pid))
                // Phase 5.2: captain's defeat shield for the lineup he played in.
                const shield = lineupDefeatShield(team, result.lineups?.[team.id] ?? playedIds, lookupPlayer)
                playedIds.forEach(pid => {
                    const player = playerMap.get(pid)
                    if (!player) return

                    player.matchesPlayed++
                    // Fatigue scales by format (BO1=10, BO3=15, BO5=25; a league BO1 less, COMP-10).
                    const fatigueCost = matchFatigueCost(match.format, match.stage)
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
                    player.morale = applyMoraleResult(player.morale ?? 50, playerResultMorale(player, moraleChange * surprise, shield))
                    player.form = applyFormResult(player.form, won, surprise)

                    const stats = result.playerStats[pid]
                    if (!stats) return

                    // Kills/deaths/rating totals: recordOfficialMatch above (official matches only).
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
                                    data: eventText({ key: "evn.weapon.t" }, { key: "evn.weapon.m", params: { name: player.nickname, weapon: primaryWeapon } }),
                                    acknowledged: false,
                                })
                            }
                        }
                    }
                })
            }
            updatePlayerStats(homeTeam, homeWon, homeExpected)
            updatePlayerStats(awayTeam, !homeWon, 1 - homeExpected)
            // Phase 5.2: official appearances (starters / fit players left out).
            if (isOfficialMatch(match)) {
                recordAppearances(homeTeam, result.lineups[homeTeam.id] ?? [], lookupPlayer)
                recordAppearances(awayTeam, result.lineups[awayTeam.id] ?? [], lookupPlayer)
            }
            // Canonical weapon-category mastery (RIFLE/AWP/PISTOL/SMG XP), the
            // track the match engine reads. The weekly tick applies it to every
            // AI match; matches committed here never did, so managed starters
            // stayed at mastery 0 while AI starters reached +12 accuracy /
            // +8 damage (~+10 equipment power per player). Parity fix.
            processMatchWeaponMastery(state as unknown as GameSave, result)

            // C10: judge the pro's rating against his personal goal (shown on the result screen and Home).
            if (state.proCareer) recordProMatch(state as unknown as GameSave, matchId, result.playerStats?.[state.proCareer.playerId]?.rating, proGoal)

            // Manager stats + achievements + XP, only when player team was in the match.
            if (homeTeam.id === state.playerTeamId || awayTeam.id === state.playerTeamId) {
                const pWon = (homeTeam.id === state.playerTeamId && homeWon)
                    || (awayTeam.id === state.playerTeamId && !homeWon)
                state.managerDetails.careerMatches = (state.managerDetails.careerMatches || 0) + 1
                if (pWon) state.managerDetails.careerWins = (state.managerDetails.careerWins || 0) + 1
                else state.managerDetails.careerLosses = (state.managerDetails.careerLosses || 0) + 1

                // Achievements count official matches only (MODES-06), as the Manager page does.
                checkAchievements({
                    totalWins: officialCareerWins(state as unknown as GameSave),
                    matchesPlayed: state.managerDetails.careerMatches,
                    firstTournamentParticipation: isOfficialMatch(match),
                    comebackWin: achievementFlags.comebackWin,
                    underdogWin: achievementFlags.underdogWin,
                })

                // Same base and analyst talent bonus as a match the week auto-plays.
                const xpMultiplier = state.playerTeamId ? getAnalystXpMultiplier(state as unknown as GameSave, state.playerTeamId) : 1
                ManagerProgression.gainXP(state, Math.round((pWon ? WIN_XP_BASE : LOSS_XP_BASE) * xpMultiplier))
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

                // A grand final won here decides the title now: queue its
                // moment for the result screen (Phase 5.4a). The week tick
                // still pays the prize and adds the trophy, deduped by key.
                queueDecidedTitle(state as unknown as GameSave, match.tournamentId)
            }

            result.xpGains = xpGains
            state.activeMatchId = null
            state.activeMatchState = null

            // Post-match news headline (player team's perspective). A scrim is
            // practice, not news (HOME-10).
            if (isOfficialMatch(match)) {
                const winner = homeWon ? homeTeam : awayTeam
                const loser = homeWon ? awayTeam : homeTeam
                // Rounds for a single map, maps for a series, as the result screen shows it (HOME-07).
                const scoreStr = sideScore(result, homeWon)
                const names = { winner: winner.name, loser: loser.name, score: scoreStr }
                // NEWPLAYER-15: a result the odds gave under 25% gets its own headline.
                const winnerRank = homeWon ? oldHomeRank : oldAwayRank
                const loserRank = homeWon ? oldAwayRank : oldHomeRank
                const upset = !isDraw && (homeWon ? homeExpected : 1 - homeExpected) < UPSET_NEWS_EXPECTED
                const title: TextRef = !upset ? { key: "nw.match.t", params: names }
                    : winnerRank < 999 && loserRank < 999 ? { key: "nw.match.giant", params: { ...names, wr: winnerRank, lr: loserRank } }
                        : { key: "nw.head.upset", params: names }
                // The body names the competition (HOME-10): "… in CIS Division 5".
                const division = match.tournamentId?.startsWith("league_") ? match.stage?.split(" · ")[0]?.trim() : undefined
                const eventTournament = state.tournaments.find(tm => tm.id === match.tournamentId)
                const event: TextParam | undefined = division ? divisionRef(division) : eventTournament?.name ? eventDisplayName(eventTournament.name) : undefined
                state.newsFeed.unshift({
                    id: nextDeterministicId(state, "news_match"),
                    ...newsText(title, event ? { key: "nw.match.cIn", params: { ...names, event } } : { key: "nw.match.c", params: names }),
                    category: "MATCH",
                    teamId: winner.id,
                    matchId: match.id,
                    week: state.currentWeek,
                    ...(typeof match.day === "number" ? { day: match.day } : {}),
                })
                if (state.newsFeed.length > NEWS_FEED_CAP) state.newsFeed.pop()
            }
        })
    },

    prepAndSimMatch: async (matchId: string) => {
        const state = get()
        const match = state.scheduledMatches.find(m => m.id === matchId)
        if (!match || !state.playerTeamId) return false
        if (!match.vetoComplete || !match.maps?.length) {
            const home = state.teams.find(t => t.id === match.homeTeamId)
            const away = state.teams.find(t => t.id === match.awayTeamId)
            if (home && away) {
                const maps = autoVetoMaps(match, getActivePlayersByRosterOrder(home, state.players), getActivePlayersByRosterOrder(away, state.players))
                if (maps.length) get().updateScheduledMatch(matchId, { vetoComplete: true, maps })
            }
        }
        // Counters the manager has not set on a map yet: apply what the VOD
        // review found, as the prep screen would offer (never on its own
        // without the review, and never over a choice already made).
        const prepped = get().scheduledMatches.find(m => m.id === matchId)
        if (prepped?.vodReviewed) {
            for (const map of new Set(prepped.maps ?? [])) {
                if (prepped.counters?.[map]) continue
                get().setMatchCounter(matchId, map, "ct", true)
                get().setMatchCounter(matchId, map, "t", true)
            }
        }
        return get().simulateInstantMatch(matchId)
    },

    simulateInstantMatch: async (matchId: string, _opts: { skippedPrep?: boolean } = {}) => {
        const state = get()
        // Already recorded (double click, retry): report success so callers
        // can show the result instead of a not-found screen.
        if (state.completedMatches.some(m => m.id === matchId)) return true
        const match = state.scheduledMatches.find(m => m.id === matchId)
        if (!match) {
            get().addToast({ message: 'That match is no longer on your calendar.', type: 'warning' })
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
            get().addToast({ message: liveText({ key: "lv.need5", params: { n: hPlayers.length } }), type: "warning" })
            return false
        }
        if (state.playerTeamId === aTeam.id && aPlayers.length < 5) {
            get().addToast({ message: liveText({ key: "lv.need5", params: { n: aPlayers.length } }), type: "warning" })
            return false
        }
        // Either roster understrength (e.g. the opponent got gutted by injuries /
        // retirements): refuse rather than let simulateMatch crash pickWeighted
        // ("No players to pick from"). Advancing the week forfeits it properly.
        if (hPlayers.length < 5 || aPlayers.length < 5) {
            const shorthanded = hPlayers.length < 5 ? hTeam : aTeam
            get().addToast({ message: liveText({ key: "lv.forfeit", params: { club: shorthanded.name } }), type: "warning" })
            return false
        }

        // Shared preparation + canonical series runner: identical to the live
        // screen's path for the same seed, maps, lineup and decisions (L21/L14).
        // A match with a live checkpoint keeps the engine it was started on.
        const checkpoint = get().activeMatchState as { matchId?: string; playback?: { engine?: EngineVersion } } | null
        const active = checkpoint?.matchId === matchId ? checkpoint.playback?.engine : undefined
        const ctx = prepareLegacySeries({
            match: active ? { ...match, engineVersion: active } : match,
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
            get().addToast({ message: "The match result couldn't be recorded. Your match is still on the calendar.", type: 'error' })
            return false
        }

        // Achievement re-check after the manager stats bump.
        checkAchievements({
            totalWins: officialCareerWins(get() as unknown as GameSave),
            firstTournamentParticipation: isOfficialMatch(match),
        })

        // If we just simulated the match the user was actively viewing,
        // clear the live-match shell.
        if (get().activeMatchId === matchId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(set as any)({ activeMatchId: null, activeMatchState: null })
        }
        // Saved at once, so a reload cannot bring the match back to play again.
        void persistCommittedMatch(get().saveId, matchId, get().saveGame)
        return true
    },
})
