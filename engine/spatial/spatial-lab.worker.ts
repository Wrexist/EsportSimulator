import { sealRoundReplay } from './round-replay'
import { resolveCareerRoundPreview } from './resolve-career-round-preview'
import { runLabTeams } from './lab-teams'
import { CollisionScene, withOccupiedBodies } from "./geometry"
import { NavigationMesh, type NavLocation, type RouteOptions } from "./navigation"
import { simulateMovement } from "./movement"
import type { SpatialReference, Vec3 } from "./types"
import { parseProject } from '@/lib/map-annotations'
import { annotationCollision, validateAnnotations } from './annotations'
import { parseLabProject } from '@/lib/spatial-lab-project'
import { runLabEncounter } from './lab-encounter'

const scope = self as unknown as { onmessage: (event: MessageEvent) => void; postMessage: (message: unknown) => void }
let nav: NavigationMesh | undefined, scene: CollisionScene | undefined
const assetHashes = new Map<string, string>()
async function verifyAnnotationImages(project: ReturnType<typeof parseProject>, reference: SpatialReference) {
    if (!project.registration) return
    const paths = [[project.registration.sourceRadar, project.registration.sourceSha256], [`/map-studio/spatial/${reference.mapId}-${project.floor}.png`, project.registration.targetSha256]]
    for (const [path, expected] of paths) {
        let hash = assetHashes.get(path)
        if (!hash) {
            const response = await fetch(path)
            if (!response.ok) throw Error('A registered radar image is unavailable')
            hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('')
            assetHashes.set(path, hash)
        }
        if (hash !== expected) throw Error('Radar image changed since registration. Re-align the drawing before previewing collision.')
    }
}
scope.onmessage = async event => {
    const request = event.data
    try {
        if (request.type === "load") {
            if (!["Mirage", "Nuke", "Sandstone", "Inferno", "Anubis", "Ancient", "Overpass", "Vertigo"].includes(request.mapId)) throw new Error("Unknown map")
            const [mapResponse, meshResponse] = await Promise.all([fetch(`/map-studio/spatial/${request.mapId}.json`), fetch(`/map-studio/spatial/${request.mapId}.mesh`)])
            if (!mapResponse.ok || !meshResponse.ok) throw new Error("Reference files are unavailable. Reopen the lab after the server is ready.")
            const reference = await mapResponse.json() as SpatialReference
            const buffer = await meshResponse.arrayBuffer()
            const digest = await crypto.subtle.digest("SHA-256", buffer)
            const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("")
            if (hash !== reference.meshSha256) throw new Error("Collision reference checksum mismatch")
            scene = CollisionScene.fromBinary(buffer); nav = new NavigationMesh(reference)
            scope.postMessage({ type: "ready", reference, triangles: scene.triangleCount, excludedPortals: nav.excludedPortals })
        } else if (request.type === 'encounter') {
            if (!nav || !scene) throw Error('Reference is still loading')
            const project = parseLabProject(JSON.stringify(request.project), nav.reference)
            if (project.annotations) await verifyAnnotationImages(project.annotations, nav.reference)
            scope.postMessage({ type: 'encounter-result', id: request.id, ...runLabEncounter(project, nav, scene) })
        } else if (request.type === 'career-round-preview') {
            if (!nav || !scene) throw Error('Reference is still loading')
            const loadedNav = nav, loadedScene = scene
            const project = parseLabProject(JSON.stringify(request.project), loadedNav.reference)
            if (project.annotations) await verifyAnnotationImages(project.annotations, loadedNav.reference)
            if (nav !== loadedNav || scene !== loadedScene) throw Error('Map reference changed while preparing the round')
            const result = await resolveCareerRoundPreview({ project, binding: request.binding, players: request.players, settlement: request.settlement }, loadedNav, loadedScene)
            if (nav !== loadedNav || scene !== loadedScene) throw Error('Map reference changed while resolving the round')
            scope.postMessage({ type: 'career-round-preview-result', id: request.id, ...result })
        } else if (request.type === 'teams') {
            if (!nav || !scene) throw Error('Reference is still loading')
            const project = parseLabProject(JSON.stringify(request.project), nav.reference)
            if (project.annotations) await verifyAnnotationImages(project.annotations, nav.reference)
            const run = runLabTeams(project, nav, scene, Boolean(request.replay))
            const replay = request.replay ? await sealRoundReplay(project, nav.reference, run.result) : undefined
            scope.postMessage({ type: 'teams-result', id: request.id, ...run, ...(replay ? { replay } : {}) })
        } else if (request.type === 'validate') {
            if (!nav || !scene) throw Error('Reference is still loading')
            const project = parseProject(JSON.stringify(request.project))
            await verifyAnnotationImages(project, nav.reference)
            scope.postMessage({ type: 'validation', id: request.id, report: validateAnnotations(project, nav.reference, scene) })
        } else if (request.type === "query") {
            if (!nav || !scene) throw new Error("Reference is still loading")
            const a = request.a as NavLocation, b = request.b as NavLocation, options = request.options as RouteOptions
            const annotations = request.annotations ? parseProject(JSON.stringify(request.annotations)) : null
            if (annotations) await verifyAnnotationImages(annotations, nav.reference)
            const occupied = (request.occupied || []) as NavLocation[]
            if (!Array.isArray(occupied) || occupied.length > 10 || occupied.some(p => !nav!.validLocation(p))) throw Error('Invalid teammate reservation')
            const world = withOccupiedBodies(annotations ? annotationCollision(scene, annotations, nav.reference).scene : scene, occupied.map(p => p.point))
            if (!nav.validLocation(a) || !nav.validLocation(b)) throw new Error("Choose endpoints on the navigation surfaces")
            const eye = options.height === 54 ? 46 : 64
            const from: Vec3 = [a.point[0], a.point[1], a.point[2] + eye], to: Vec3 = [b.point[0], b.point[1], b.point[2] + eye]
            const hit = world.raycast(from, to)
            const route = nav.findRoute(a, b, options, world)
            const frames = simulateMovement(route, world, options.height === 54 ? 85 : request.speed, options.height, nav)
            scope.postMessage({ type: "result", id: request.id, route, frames, sight: { from, to, hit } })
        }
    } catch (error) { scope.postMessage({ type: "error", id: request.id, message: error instanceof Error ? error.message : "Spatial check failed" }) }
}
