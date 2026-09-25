import { readFileSync } from "fs"
import { CollisionScene } from "../engine/spatial/geometry"
import { NavigationMesh, DEFAULT_ROUTE_OPTIONS } from "../engine/spatial/navigation"
import { center, type SpatialReference } from "../engine/spatial/types"
import { simulateMovement } from "../engine/spatial/movement"

const reference = JSON.parse(readFileSync("public/map-studio/spatial/Mirage.json", "utf8")) as SpatialReference
const bytes = readFileSync("public/map-studio/spatial/Mirage.mesh")
const before = performance.now()
const scene = CollisionScene.fromBinary(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const nav = new NavigationMesh(reference)
process.stdout.write(JSON.stringify({ buildMs: performance.now() - before, areas: nav.areas.size, triangles: scene.triangleCount, excludedPortals: nav.excludedPortals }) + "\n")
for (const index of [0, 100, 300, 600, 1200]) {
    const a = reference.areas[index], b = reference.areas[Math.min(index + 20, reference.areas.length - 1)]
    const start = performance.now()
    const route = nav.findRoute({ area: a.id, point: center(a) }, { area: b.id, point: center(b) }, DEFAULT_ROUTE_OPTIONS, scene)
    const frames = simulateMovement(route, scene)
    process.stdout.write(JSON.stringify({ a: a.id, b: b.id, areas: route.areas.length, reason: route.reason, rejected: route.rejected, final: frames.at(-1), ms: performance.now() - start }) + "\n")
}
