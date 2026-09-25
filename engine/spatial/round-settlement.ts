import { applyRoundEconomy } from '@/lib/live-match-utils'
import { physicalArmor, type PhysicalEconomyState } from './physical-economy'
import { previewCareerRound, type CareerRoundBinding } from './career-round-adapter'
import { projectRoundReplay, type SpatialRoundReplay } from './round-replay'
import { utilityStock } from './career-loadouts'
import { physicalWeapon } from './weapon-profiles'

export interface RoundSettlementPreview {
    version: 1; mode: 'preview'; matchId: string; mapId: string; homeTeamId: string; awayTeamId: string; nextRound: number
    homeScore: number; awayScore: number; homeLossStreak: number; awayLossStreak: number
    homeEconomy: Record<string, PhysicalEconomyState>; awayEconomy: Record<string, PhysicalEconomyState>
    receipts: Record<string, string>
}

/** Pure, idempotent settlement rehearsal. Production career commits remain gated elsewhere. */
export async function settlePhysicalRoundPreview(input: RoundSettlementPreview, inputReplay: SpatialRoundReplay, inputBinding: CareerRoundBinding): Promise<RoundSettlementPreview> {
    const state = structuredClone(input), replay = structuredClone(inputReplay), binding = structuredClone(inputBinding)
    if (state.version !== 1 || state.mode !== 'preview' || state.matchId !== binding.matchId || state.mapId !== binding.mapId
        || state.homeTeamId !== binding.homeTeamId || state.awayTeamId !== binding.awayTeamId
        || ![state.nextRound, state.homeScore, state.awayScore, state.homeLossStreak, state.awayLossStreak].every(n => Number.isInteger(n) && n >= 0)) throw Error('Settlement context mismatch')
    const preview = await previewCareerRound(replay, binding)
    const receipt = JSON.stringify({ replay: replay.sha256, binding: { ...binding, players: [...binding.players].sort((a,b) => a.actorId.localeCompare(b.actorId)) } })
    const existing = state.receipts[binding.roundNumber]
    if (existing) { if (existing !== receipt) throw Error('Conflicting replay for settled round'); return state }
    if (state.nextRound !== binding.roundNumber) throw Error('Round settlement is out of sequence')
    const all = { ...state.homeEconomy, ...state.awayEconomy }
    if (Object.keys(all).length !== binding.players.length || Object.keys(state.homeEconomy).length + Object.keys(state.awayEconomy).length !== binding.players.length) throw Error('Settlement roster mismatch')
    for (const actor of replay.project.teams!.actors) {
        const link = binding.players.find(p => p.actorId === actor.id)!, saved = (link.teamId === state.homeTeamId ? state.homeEconomy : state.awayEconomy)[link.playerId]
        if (!saved || !actor.loadout || physicalWeapon(saved.weapon).id !== actor.loadout.weapon || saved.hasHelmet !== actor.loadout.helmet || saved.hasKit !== actor.loadout.kit || physicalArmor(saved) !== actor.armor
            || !Number.isFinite(saved.cash) || saved.cash < 0 || saved.cash > 16000) throw Error('Purchased loadout does not match physical input')
        const stock = replay.project.teams!.utility?.inventory[actor.id]
        if (JSON.stringify(utilityStock(saved.utility || [])) !== JSON.stringify(stock || utilityStock([]))) throw Error('Purchased utility does not match physical inventory')
    }
    const won = preview.round.winningTeamId === state.homeTeamId
    const final = projectRoundReplay(replay, replay.result.frames.at(-1)!.tick).frame
    // Spend thrown grenades on surviving players too; death cleanup is handled by existing economy rules.
    for (const actor of final.actors) {
        const link = binding.players.find(p => p.actorId === actor.id)!, saved = all[link.playerId]
        if (actor.inventory) saved.utility = Object.entries(actor.inventory).flatMap(([kind, count]) => Array(count).fill(kind === 'fire' ? 'molotov' : kind))
        saved.hasArmor = actor.armor > 0
        saved.armorPoints = actor.armor
    }
    const result = applyRoundEconomy({ homeEconomy: state.homeEconomy, awayEconomy: state.awayEconomy,
        homeIsCT: binding.homeSide === 'CT', homeLossStreakBefore: state.homeLossStreak, awayLossStreakBefore: state.awayLossStreak,
        homePlayerIds: binding.players.filter(p => p.teamId === state.homeTeamId).map(p => p.playerId),
        awayPlayerIds: binding.players.filter(p => p.teamId === state.awayTeamId).map(p => p.playerId),
        roundResult: { ...preview.round, winner: won ? 'HOME' : 'AWAY' } })
    // Legacy death cleanup clears the armor flag; the physical extension must agree.
    for (const saved of Object.values({ ...result.homeEconomy, ...result.awayEconomy }) as PhysicalEconomyState[]) {
        if (!saved.hasArmor) saved.armorPoints = 0
        physicalArmor(saved)
    }
    return { ...state, ...result, homeScore: state.homeScore + (won ? 1 : 0), awayScore: state.awayScore + (won ? 0 : 1),
        homeLossStreak: won ? 0 : state.homeLossStreak + 1, awayLossStreak: won ? state.awayLossStreak + 1 : 0,
        nextRound: state.nextRound + 1, receipts: { ...state.receipts, [binding.roundNumber]: receipt } }
}
