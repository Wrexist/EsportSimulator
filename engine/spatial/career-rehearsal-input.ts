import type { ActiveMatchState } from '@/types'
import type { LabProject } from '@/lib/spatial-lab-project'
import type { CareerRoundPreviewRequest } from './resolve-career-round-preview'
import type { CareerCombatPlayer } from './career-loadouts'

/** Copy a buy-phase checkpoint. Never reuse a round whose legacy result is already in flight. */
export function careerRehearsalInput(project: LabProject, active: ActiveMatchState, homeTeamId: string, awayTeamId: string, players: CareerCombatPlayer[]): CareerRoundPreviewRequest {
    if(!active.isWaitingForStrategy || active.gameState.status==='FINISHED') throw Error('Pause the career at a buy-phase decision before making a rehearsal')
    const sim=active.simState, map=active.playback?.maps[sim.currentMapIndex] || active.matchResult.maps[sim.currentMapIndex]?.map
    if(map!==project.mapId||!project.teams)throw Error('Open the active career map and a full team scenario')
    const homeSide=sim.homeStartsCT?'CT':'T',binding:CareerRoundPreviewRequest['binding']={matchId:active.matchId,mapId:project.mapId,roundNumber:sim.currentRound,homeTeamId,awayTeamId,homeSide,players:[]}
    for(const side of ['T','CT'] as const){
        const home=side===homeSide,roster=home?active.homeRoster:active.awayRoster,actors=project.teams.actors.filter(a=>a.side===side).sort((a,b)=>a.id.localeCompare(b.id))
        if(roster.length!==5||actors.length!==5)throw Error('Career rehearsal requires five assigned players on each side')
        actors.forEach((actor,i)=>binding.players.push({actorId:actor.id,playerId:roster[i].id,teamId:home?homeTeamId:awayTeamId}))
    }
    const ids=binding.players.map(p=>p.playerId),selected=ids.map(id=>players.find(p=>p.id===id))
    if(new Set(ids).size!==10||selected.some(p=>!p))throw Error('Career roster identity is incomplete')
    const economy=(home:boolean)=>Object.fromEntries(binding.players.filter(p=>p.teamId===(home?homeTeamId:awayTeamId)).map(p=>[p.playerId,(home?sim.homeEconomy:sim.awayEconomy)[p.playerId]]))
    return structuredClone({project,binding,players:selected as CareerCombatPlayer[],settlement:{version:1,mode:'preview',matchId:active.matchId,mapId:project.mapId,homeTeamId,awayTeamId,nextRound:sim.currentRound,homeScore:sim.homeRounds,awayScore:sim.awayRounds,homeLossStreak:sim.homeLossStreak,awayLossStreak:sim.awayLossStreak,homeEconomy:economy(true),awayEconomy:economy(false),receipts:{}}})
}
