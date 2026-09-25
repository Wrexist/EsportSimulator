import type { LabProject } from '@/lib/spatial-lab-project'
import { annotationCollision } from './annotations'
import { withOccupiedBodies, type CollisionWorld } from './geometry'
import type { NavigationMesh } from './navigation'
import { simulateTeams } from './team-simulation'

export function runLabTeams(project: LabProject, nav: NavigationMesh, base: CollisionWorld, captureRays = false) {
    if (!project.teams) throw Error('Open or create a team scenario first')
    const world = withOccupiedBodies(project.annotations ? annotationCollision(base, project.annotations, nav.reference).scene : base, (project.occupied || []).map(p => p.point))
    return { result: simulateTeams(project.teams, nav, world, project.blocked, captureRays, { ...project.settings, links: project.links, jumps: !!project.settings.jumps, drops: !!project.settings.drops }), sourceVersion: nav.reference.sourceVersion, meshSha256: nav.reference.meshSha256 }
}
