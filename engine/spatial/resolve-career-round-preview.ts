import type { LabProject } from '@/lib/spatial-lab-project'
import type { NavigationMesh } from './navigation'
import type { CollisionWorld } from './geometry'
import { bindAuthoredPlantZones, bindCareerLoadouts, type CareerCombatPlayer } from './career-loadouts'
import { previewCareerRound, type CareerRoundBinding } from './career-round-adapter'
import { settlePhysicalRoundPreview, type RoundSettlementPreview } from './round-settlement'
import { runLabTeams } from './lab-teams'
import { sealRoundReplay } from './round-replay'
import { MATCH_CONSTANTS } from '@/lib/constants'
import type { SpatialReference } from './types'

export interface CareerRoundPreviewRequest { project: LabProject; binding: CareerRoundBinding; players: CareerCombatPlayer[]; settlement: RoundSettlementPreview }
/** One owner resolves physics and derives every result from that sealed round.
 * It deliberately returns a preview, never a store commit or legacy engine fallback.
 */
export function prepareCareerRoundProject(input: CareerRoundPreviewRequest, reference: SpatialReference) {
    const request = structuredClone(input)
    let project = bindCareerLoadouts(request.project, reference, request.binding, request.players,
        { ...request.settlement.homeEconomy, ...request.settlement.awayEconomy })
    project.teams = { ...project.teams!, guns: true, initialBomb: 'carried',
        roundSeconds: MATCH_CONSTANTS.ROUND_TIME, bombSeconds: MATCH_CONSTANTS.BOMB_TIME,
        seconds: MATCH_CONSTANTS.ROUND_TIME + MATCH_CONSTANTS.BOMB_TIME + 1,
        actors: project.teams!.actors.map(actor => ({ ...actor, health: 100 })) }
    if (project.annotations) project = bindAuthoredPlantZones(project, reference)
    return project
}
export async function resolveCareerRoundPreview(input: CareerRoundPreviewRequest, nav: NavigationMesh, scene: CollisionWorld) {
    const request = structuredClone(input), project = prepareCareerRoundProject(request, nav.reference)
    const run = runLabTeams(project, nav, scene, true)
    const replay = await sealRoundReplay(project, nav.reference, run.result)
    const preview = await previewCareerRound(replay, request.binding)
    const settlement = await settlePhysicalRoundPreview(request.settlement, replay, request.binding)
    return { mode: 'preview' as const, expectedRound: request.settlement.nextRound, replay, preview, settlement }
}
