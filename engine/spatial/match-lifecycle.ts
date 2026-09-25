import type { CustomTactics } from '@/types'
import type { CareerCombatPlayer } from './career-loadouts'
import type { LabProject } from '@/lib/spatial-lab-project'
import { createRoundStartEconomy, createOvertimeEconomy, getMapsToWinForFormat, getRequiredMapsForFormat, getOvertimeMapWinThreshold } from '@/lib/live-match-utils'
import { performBuyPhase, type BuyStrategy } from '@/engine/match/buy-phase'
import { SeededRNG } from '@/engine/rng'
import type { PhysicalCareerJournal } from './career-round-journal'
import type { CareerRoundPreviewRequest } from './resolve-career-round-preview'
import type { RoundSettlementPreview } from './round-settlement'
import { physicalArmor } from './physical-economy'
import type { previewCareerRound } from './career-round-adapter'

type RoundPreview = Awaited<ReturnType<typeof previewCareerRound>>
export interface PhysicalSeriesConfig {
    format: 'BO1' | 'BO3' | 'BO5'
    seed: number
    maps: { mapId: string; homeStartsCT: boolean }[]
    homePlayers: (CareerCombatPlayer & {role:string})[]
    awayPlayers: (CareerCombatPlayer & {role:string})[]
    homeTactics?: CustomTactics
    awayTactics?: CustomTactics
}
export interface PhysicalSeriesState extends PhysicalSeriesConfig {
    phase: 'buy' | 'ready' | 'map-complete' | 'finished' | 'settled'
    homeSide: 'CT' | 'T'
    overtimeSet: number
    homeWins: number
    awayWins: number
    rounds: { replaySha256: string; round: RoundPreview['round']; players: RoundPreview['players'] }[]
    completedMaps: { mapId: string; homeScore: number; awayScore: number; winnerId: string; rounds: PhysicalSeriesState['rounds'] }[]
    final: null | { mode: 'preview'; careerEligible: false; matchId: string; winnerId: string; homeWins: number; awayWins: number; maps: PhysicalSeriesState['completedMaps'] }
}
const strategies: BuyStrategy[] = ['ECO', 'FORCE', 'SEMIBUY', 'FULL', 'PISTOL', 'DOUBLE AWP']
function resetEconomy(state: RoundSettlementPreview, homeCT: boolean, overtime: boolean) {
    const create = overtime ? createOvertimeEconomy : createRoundStartEconomy
    state.homeEconomy = create(Object.keys(state.homeEconomy), homeCT)
    state.awayEconomy = create(Object.keys(state.awayEconomy), !homeCT)
    state.homeLossStreak = 0
    state.awayLossStreak = 0
}
export function initializePhysicalSeries(journal: PhysicalCareerJournal, supplied: PhysicalSeriesConfig): PhysicalCareerJournal {
    const next = structuredClone(journal), config = structuredClone(supplied)
    if (journal.pending || journal.latest || journal.series || journal.mapIndex !== 0 || journal.settlement.nextRound !== 1 || journal.settlement.homeScore || journal.settlement.awayScore) throw Error('Start a full series at the first map before its first round')
    if (!['BO1','BO3','BO5'].includes(config.format) || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff
        || config.maps.length !== getRequiredMapsForFormat(config.format) || new Set(config.maps.map(m=>m.mapId)).size !== config.maps.length
        || config.maps.some(m=>!m.mapId || typeof m.homeStartsCT !== 'boolean') || config.maps[0].mapId !== journal.settlement.mapId) throw Error('Invalid physical series format or map order')
    const ids = [...config.homePlayers, ...config.awayPlayers].map(p=>p.id)
    if (config.homePlayers.length !== 5 || config.awayPlayers.length !== 5 || new Set(ids).size !== 10
        || config.homePlayers.some(p=>!Object.hasOwn(journal.settlement.homeEconomy,p.id)) || config.awayPlayers.some(p=>!Object.hasOwn(journal.settlement.awayEconomy,p.id))) throw Error('Physical series requires the complete career rosters')
    next.series = { ...config, phase:'buy', homeSide:config.maps[0].homeStartsCT?'CT':'T', overtimeSet:0, homeWins:0, awayWins:0, rounds:[], completedMaps:[], final:null }
    resetEconomy(next.settlement, config.maps[0].homeStartsCT, false)
    return next
}
/** One purchase transaction per round; RNG depends on match/map/round, never retries or wall time. */
export function purchasePhysicalRound(input: PhysicalCareerJournal, home: BuyStrategy, away: BuyStrategy): PhysicalCareerJournal {
    const next = structuredClone(input), series = next.series
    if (!series || series.phase !== 'buy' || next.pending || !strategies.includes(home) || !strategies.includes(away)) throw Error('Purchases are only allowed once at the buy phase')
    const pistol = next.settlement.nextRound === 1 || next.settlement.nextRound === 13
    if (!pistol && (home === 'PISTOL' || away === 'PISTOL')) throw Error('Pistol strategy is reserved for regulation half starts')
    const rng = new SeededRNG((series.seed + next.mapIndex * 65537 + next.settlement.nextRound * 7919) >>> 0)
    for (const [players, economy, strategy, ct, tactics] of [
        [series.homePlayers, next.settlement.homeEconomy, home, series.homeSide === 'CT',series.homeTactics],
        [series.awayPlayers, next.settlement.awayEconomy, away, series.homeSide !== 'CT',series.awayTactics],
    ] as const) {
        const purchased = Object.fromEntries(Object.entries(economy).map(([id,state])=>[id,{...state,id,utility:state.utility || [],armorPoints:physicalArmor(state)}]))
        performBuyPhase(players, purchased, pistol ? 'PISTOL' : strategy, ct, rng, tactics)
        for (const [id, state] of Object.entries(purchased)) {
            economy[id] = {cash:state.cash,weapon:state.weapon,hasArmor:state.hasArmor,armorPoints:state.armorPoints,hasHelmet:state.hasHelmet,hasKit:state.hasKit,utility:state.utility}
        }
        for (const state of Object.values(economy)) {
            physicalArmor(state)
            if (!Number.isFinite(state.cash) || state.cash < 0 || state.cash > 16000) throw Error('Invalid purchased economy')
        }
    }
    series.phase = 'ready'
    next.revision++
    return next
}
/** Side slots belong to geometry. Career identities move between slots at side swaps. */
export function physicalSeriesRequest(journal: PhysicalCareerJournal, input: LabProject): CareerRoundPreviewRequest {
    const series = journal.series, project = structuredClone(input), state = journal.settlement
    if (!series || series.phase !== 'ready' || project.mapId !== state.mapId || !project.teams) throw Error('Load the current series map and purchase before starting a round')
    project.teams.seed = (series.seed + journal.mapIndex * 65537 + state.nextRound * 7919) >>> 0
    const players = [...series.homePlayers,...series.awayPlayers].map(({id,rifle,awp,pistol,reaction,tactic})=>({id,rifle,awp,pistol,reaction,tactic}))
    const binding: CareerRoundPreviewRequest['binding'] = {matchId:state.matchId,mapId:state.mapId,roundNumber:state.nextRound,homeTeamId:state.homeTeamId,awayTeamId:state.awayTeamId,homeSide:series.homeSide,players:[]}
    for (const side of ['CT','T'] as const) {
        const home = side === series.homeSide, roster = home ? series.homePlayers : series.awayPlayers
        const slots = project.teams.actors.filter(a=>a.side===side).sort((a,b)=>a.id.localeCompare(b.id))
        if (slots.length !== 5) throw Error('The map needs five physical spawn slots per side')
        slots.forEach((slot,index)=>binding.players.push({actorId:slot.id,playerId:roster[index].id,teamId:home?state.homeTeamId:state.awayTeamId}))
    }
    return {project,binding,players,settlement:structuredClone(state)}
}
/** Called only after the journal verifies and settles the reserved physical artifact. */
export function advancePhysicalSeries(journal: PhysicalCareerJournal, preview: RoundPreview): void {
    const series = journal.series, state = journal.settlement
    if (!series) return
    if (series.phase !== 'ready' || preview.round.roundNumber !== state.nextRound - 1) throw Error('Unexpected series round completion')
    series.rounds.push({replaySha256:preview.replaySha256,round:preview.round,players:preview.players})
    const threshold = series.overtimeSet ? getOvertimeMapWinThreshold(series.overtimeSet) : 13
    if (Math.max(state.homeScore,state.awayScore) >= threshold) {
        const home = state.homeScore > state.awayScore
        series.homeWins += home ? 1 : 0
        series.awayWins += home ? 0 : 1
        series.completedMaps.push({mapId:state.mapId,homeScore:state.homeScore,awayScore:state.awayScore,winnerId:home?state.homeTeamId:state.awayTeamId,rounds:series.rounds})
        series.rounds = []
        series.phase = Math.max(series.homeWins,series.awayWins) >= getMapsToWinForFormat(series.format) ? 'finished' : 'map-complete'
        return
    }
    if (state.nextRound === 13 || state.nextRound === 25 || (series.overtimeSet > 0 && (state.nextRound - 25) % 3 === 0)) {
        series.homeSide = series.homeSide === 'CT' ? 'T' : 'CT'
        if (state.nextRound >= 25 && (state.nextRound - 25) % 6 === 0) series.overtimeSet++
        resetEconomy(state, series.homeSide === 'CT', series.overtimeSet > 0)
    }
    series.phase = 'buy'
}
export function progressPhysicalMap(input: PhysicalCareerJournal): PhysicalCareerJournal {
    const next = structuredClone(input), series = next.series
    if (!series || series.phase !== 'map-complete' || next.pending) throw Error('Current map is not complete')
    const map = series.maps[next.mapIndex + 1]
    if (!map) throw Error('Missing next map; cannot invent a series winner')
    next.mapIndex++
    next.settlement = {...next.settlement,mapId:map.mapId,nextRound:1,homeScore:0,awayScore:0,receipts:{}}
    resetEconomy(next.settlement,map.homeStartsCT,false)
    series.phase = 'buy'; series.overtimeSet = 0; series.homeSide = map.homeStartsCT?'CT':'T'
    next.revision++
    return next
}
export function finalizePhysicalSeries(input: PhysicalCareerJournal): PhysicalCareerJournal {
    const next = structuredClone(input), series = next.series
    if (series?.phase === 'settled' && series.final) return next
    if (!series || series.phase !== 'finished' || next.pending || series.final) throw Error('Series is not ready for final settlement')
    series.final = {mode:'preview',careerEligible:false,matchId:next.settlement.matchId,winnerId:series.homeWins>series.awayWins?next.settlement.homeTeamId:next.settlement.awayTeamId,homeWins:series.homeWins,awayWins:series.awayWins,maps:structuredClone(series.completedMaps)}
    series.phase = 'settled'; next.revision++
    return next
}
