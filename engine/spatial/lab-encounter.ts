import type { LabProject } from '@/lib/spatial-lab-project'
import { annotationCollision } from './annotations'
import { withOccupiedBodies, type CollisionWorld } from './geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from './navigation'
import { simulateMovement } from './movement'
import { DEFAULT_ENCOUNTER, simulateEncounter, type EncounterInput } from './encounter'
import { distance3 } from './types'

/** Shared worker/native path; movement is a scenario route, not an AI decision about a hidden enemy. */
export function runLabEncounter(project: LabProject, nav: NavigationMesh, base: CollisionWorld) {
    if (!project.a || !project.b || !nav.validLocation(project.a) || !nav.validLocation(project.b)) throw Error('Place both players on valid surfaces')
    const settings = project.encounter || DEFAULT_ENCOUNTER, height = project.settings.height
    const world = withOccupiedBodies(project.annotations ? annotationCollision(base, project.annotations, nav.reference).scene : base, (project.occupied || []).map(p => p.point))
    if (!nav.supportedBody(project.a.point, world) || !nav.supportedBody(project.b.point, world)) throw Error('Both players need supported ground and body clearance')
    const input: EncounterInput = { settings, height, a: project.a.point, b: project.b.point, ...(project.utility ? { utility: project.utility } : {}) }
    let movement = 'Both players hold their starting positions.'
    if (settings.approach) {
        const options = { ...DEFAULT_ROUTE_OPTIONS, ...project.settings, jumps: !!project.settings.jumps, drops: !!project.settings.drops, blocked: project.blocked, links: project.links }
        const route = nav.findRoute(project.a, project.b, options, world)
        if (!route.points.length) throw Error(`Approach unavailable: ${route.reason || 'No connected route'}`)
        const frames = simulateMovement(route, world, height === 54 ? 85 : project.settings.speed, height, nav).slice(0, Math.floor(settings.seconds * 64) + 1)
        const close = frames.findIndex(f => distance3(f.position, project.b!.point) < 128)
        input.tracks = { A: close < 0 ? frames : frames.slice(0, Math.max(1, close)) }
        movement = `A follows a collision-checked scenario route and holds before coming within 128 units of B. ${frames.at(-1)?.reason || ''}`
    }
    return { result: simulateEncounter(input, world), movement, sourceVersion: nav.reference.sourceVersion, meshSha256: nav.reference.meshSha256 }
}
