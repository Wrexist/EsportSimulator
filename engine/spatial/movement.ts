import { distance3, mix3, type Vec3 } from "./types"
import type { Route, NavigationMesh } from "./navigation"
import type { CollisionWorld } from "./geometry"
import { airbornePlan } from './airborne'

export interface MovementFrame { time: number; position: Vec3; speed: number; heading?: number; state: "moving" | "ladder" | "airborne" | "arrived" | "blocked"; reason?: string }
/** Fixed-step route execution. A rejected sweep stops before collision; no position projection/teleport. */
export function simulateMovement(route: Route, scene: CollisionWorld, maxSpeed = 220, height = 72, nav?: NavigationMesh): MovementFrame[] {
    if (!route.points.length) return []
    if (!Number.isFinite(maxSpeed) || maxSpeed <= 0 || !Number.isFinite(height) || height < 32 || height > 100) throw Error('Invalid body or movement speed')
    const dt = 1 / 64, frames: MovementFrame[] = [{ time: 0, position: [...route.points[0]], speed: 0, state: "moving" }]
    let position = route.points[0], index = 1, speed = 0
    let flight: { plan: NonNullable<ReturnType<typeof airbornePlan>>; elapsed: number } | null = null
    let heading = route.points[1] ? Math.atan2(route.points[1][1] - position[1], route.points[1][0] - position[0]) : 0
    frames[0].heading = heading
    if (scene.bodyHit?.(position, height) || nav && !nav.supportedBody(position, scene)) return [{ ...frames[0], state: 'blocked', reason: 'The starting body lacks clearance or floor support.' }]
    const tail = new Array<number>(route.points.length).fill(0)
    for (let i = route.points.length - 2; i >= 0; i--) tail[i] = tail[i + 1] + distance3(route.points[i], route.points[i + 1])
    const maxSteps = 64 * 180
    for (let step = 1; step <= maxSteps; step++) {
        const target = route.points[index]
        if (!target) { frames.push({ time: step * dt, position, speed: 0, state: "arrived" }); return frames }
        const distance = distance3(position, target), ladder = route.kinds[index - 1] === "ladder"
        const desiredHeading = Math.atan2(target[1] - position[1], target[0] - position[0])
        const angle = Math.atan2(Math.sin(desiredHeading - heading), Math.cos(desiredHeading - heading))
        heading += Math.max(-4 * dt, Math.min(4 * dt, angle))
        const remaining = distance + tail[index]
        const desired = Math.min(ladder ? 85 : maxSpeed, Math.sqrt(2 * 900 * remaining))
        speed += Math.max(-900 * dt, Math.min(900 * dt, desired - speed))
        let available = dt, climbing = ladder, airborne = false
        // Consume the whole step across short segments: nav tile boundaries must not introduce pauses.
        while (available > 1e-8 && index < route.points.length) {
            const point = route.points[index], length = distance3(position, point), onLadder = route.kinds[index - 1] === "ladder"
            if (length < 1e-8) { index++; continue }
            const kind = route.kinds[index - 1]
            if (kind === 'jump' || kind === 'drop') {
                if (!flight) {
                    const plan = airbornePlan(position, point, kind, scene, height, maxSpeed)
                    if (!plan || nav && (!nav.supportedBody(position, scene) || !nav.supportedBody(point, scene))) return [...frames, { time: step * dt, position, speed: 0, state: 'blocked', reason: 'Airborne path or landing failed validation.' }]
                    flight = { plan, elapsed: 0 }
                }
                const used = Math.min(available, flight.plan.duration - flight.elapsed), next = flight.plan.at(flight.elapsed + used)
                if (scene.movementHit(position, next, height)) return [...frames, { time: step * dt, position, speed: 0, state: 'blocked', reason: 'Airborne body sweep hit an obstruction.' }]
                position = next; speed = flight.plan.speed; flight.elapsed += used; available -= used; airborne = true
                if (flight.elapsed >= flight.plan.duration - 1e-8) { position = point; index++; flight = null }
                continue
            }
            if (onLadder) { speed = Math.min(speed, 85); climbing = true }
            const velocity = Math.max(1, speed), travelled = Math.min(length, velocity * available)
            const next = mix3(position, point, travelled / length)
            if (nav && route.kinds[index - 1] === 'walk' && (!nav.supportedBody(next, scene) || !nav.supportedSegment(position, next))) { frames.push({ time: step * dt, position, speed: 0, state: 'blocked', reason: 'Feet lost floor support. No floor snapping or teleport recovery.' }); return frames }
            if (scene.movementHit(position, next, height) || scene.bodyHit?.(next,height)) { frames.push({ time: step * dt, position, speed: 0, state: "blocked", reason: "Body sweep or destination clearance hit the collision reference. Player stopped; no teleport recovery." }); return frames }
            position = next; available -= travelled / velocity
            if (travelled >= length - 1e-8) index++
        }
        const arrived = index >= route.points.length
        frames.push({ time: step * dt, position, heading, speed: arrived ? 0 : speed, state: arrived ? "arrived" : airborne ? 'airborne' : climbing ? "ladder" : "moving" })
        if (arrived) return frames
    }
    frames.push({ time: 180, position, speed: 0, state: "blocked", reason: "Preview exceeded the 180-second limit." })
    return frames
}
