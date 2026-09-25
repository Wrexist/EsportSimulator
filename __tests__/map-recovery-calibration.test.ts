import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ACTIVE_MAP_POOL } from '@/data/map-pool'
import { CollisionScene } from '@/engine/spatial/geometry'
import { NavigationMesh } from '@/engine/spatial/navigation'
import { runLabTeams } from '@/engine/spatial/lab-teams'
import { parseLabProject } from '@/lib/spatial-lab-project'
import { smokeRay } from '@/engine/spatial/utility'
import { distance3, type SpatialReference, type Vec3 } from '@/engine/spatial/types'

test.each(ACTIVE_MAP_POOL)('%s recovery smoke waits for real screening and spends exactly one grenade',mapId=>{
    const ref=JSON.parse(readFileSync(`public/map-studio/spatial/${mapId}.json`,'utf8')) as SpatialReference
    const bytes=readFileSync(`public/map-studio/spatial/${mapId}.mesh`)
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.meshSha256)
    const world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    const nav=new NavigationMesh(ref),project=parseLabProject(readFileSync(`public/map-studio/teams/recovery/${mapId.toLowerCase()}.lab.json`,'utf8'),ref)
    const before=JSON.stringify(project),r=runLabTeams(project,nav,world,true).result
    expect(JSON.stringify(project)).toBe(before)
    const wait=r.events.find(e=>e.type==='recovery-screen-wait')!,burst=r.events.find(e=>e.type==='grenade-detonate')!,ready=r.events.find(e=>e.type==='recovery-screen-ready')!,pickup=r.events.find(e=>e.type==='bomb-picked-up')!
    expect(wait).toBeDefined();expect(burst).toBeDefined();expect(ready).toBeDefined();expect(pickup).toBeDefined()
    expect(ready.tick).toBeGreaterThan(burst.tick);expect(pickup.tick).toBeGreaterThanOrEqual(ready.tick)
    expect(r.events.filter(e=>e.type==='grenade-throw')).toHaveLength(1)
    expect(r.utility!.checks[0].state).toBe('matches-model')
    expect(r.utility!.checks[0].landingError).toBeLessThanOrEqual(4)
    const owner=project.teams!.utility!.throws[0].owner
    expect(r.frames.at(-1)!.actors.find(a=>a.id===owner)!.inventory!.smoke).toBe(0)
    expect(r.metrics.minSeparation).toBeGreaterThanOrEqual(32)
    const start=project.teams!.actors.find(a=>a.id===wait.actor)!.start.point
    for(const frame of r.frames.filter(f=>f.tick>=wait.tick&&f.tick<ready.tick))expect(distance3(frame.actors.find(a=>a.id===wait.actor)!.position,start)).toBe(0)
    const threat=project.teams!.actors.find(a=>a.side==='CT')!.start.point,bomb=project.teams!.sites.A.point
    const eye=(p:Vec3):Vec3=>[p[0],p[1],p[2]+64]
    expect(world.raycast(eye(threat),eye(bomb))).toBeNull()
    expect(smokeRay(eye(threat),eye(bomb),r.utility!.effects,ready.tick,world)).not.toBeNull()
},60000)
