import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { CollisionScene, withOccupiedBodies } from '@/engine/spatial/geometry'
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from '@/engine/spatial/navigation'
import { simulateMovement } from '@/engine/spatial/movement'
import { sweptTeamSeparation } from '@/engine/spatial/team-simulation'
import { distance3, type SpatialReference, type Vec3 } from '@/engine/spatial/types'

test('recorded Overpass CT5 passage remains reachable beside the covering teammate',()=>{
    const ref=JSON.parse(readFileSync('public/map-studio/spatial/Overpass.json','utf8')) as SpatialReference
    const bytes=readFileSync('public/map-studio/spatial/Overpass.mesh')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.meshSha256)
    const world=CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer)
    // Positions from the v10 B-combat failure, before any v11 route changes.
    const start:Vec3=[-1059.750052259578,59.66959739747232,106]
    const goal:Vec3=[-1052.3280569129008,18.82764042693273,104.94352445355054]
    const friends:Vec3[]=[[-1091.7750450678614,61.261608315659316,106],[-996.9665043712495,-123.0611498597545,105.01138738319287]]
    const nav=new NavigationMesh(ref),scene=withOccupiedBodies(world,friends)
    const route=nav.findRoute({area:476,point:start},{area:417,point:goal},DEFAULT_ROUTE_OPTIONS,scene)
    const track=simulateMovement(route,scene,220,72,nav)
    expect(track.at(-1)?.state).toBe('arrived')
    expect(distance3(track.at(-1)!.position,goal)).toBeLessThan(.01)
    for(let i=1;i<track.length;i++)for(const friend of friends)expect(sweptTeamSeparation(track[i-1].position,track[i].position,friend,friend)).toBeGreaterThanOrEqual(32)
},30000)
