import { distance3, type Vec3 } from './types'
import type { CollisionWorld } from './geometry'

// Provisional simulator tuning, not a claim of measured CS2 movement parity.
export const AIRBORNE_TUNING = { gravity: 800, jumpImpulse: 280, maxDrop: 128, maxHorizontalSpeed: 220 } as const
export function airbornePlan(from: Vec3, to: Vec3, kind: 'jump' | 'drop', scene?: CollisionWorld, height = 72, maxSpeed = 220) {
    const dz = to[2] - from[2], velocity = kind === 'jump' ? AIRBORNE_TUNING.jumpImpulse : 0, g = AIRBORNE_TUNING.gravity
    if (kind === 'drop' && dz >= -2 || dz < -AIRBORNE_TUNING.maxDrop) return null
    const discriminant = velocity * velocity - 2 * g * dz
    if (discriminant < 0) return null
    const fallDuration = (velocity + Math.sqrt(discriminant)) / g
    const horizontal = Math.hypot(to[0] - from[0], to[1] - from[1])
    // Drops first clear the ledge with the whole footprint. Starting gravity on
    // supported ground would sweep the player's feet through their own floor.
    let runout = 0
    if (kind === 'drop' && scene) {
        const supported = (distance: number) => Array.from({ length: 8 }, (_, i) => {
            const x = from[0] + (to[0] - from[0]) * distance / (horizontal || 1) + Math.cos(i * Math.PI / 4) * 16
            const y = from[1] + (to[1] - from[1]) * distance / (horizontal || 1) + Math.sin(i * Math.PI / 4) * 16
            return scene.raycast([x,y,from[2]+2], [x,y,from[2]-2])
        }).some(Boolean)
        while (supported(runout) && runout <= Math.min(64, horizontal)) runout += 2
        if (runout > Math.min(64, horizontal)) return null
    }
    const speed = (horizontal - runout) / fallDuration
    const runoutSeconds = runout ? runout / speed : 0
    const duration = fallDuration + runoutSeconds
    if (!Number.isFinite(duration) || duration <= 0 || speed > Math.min(maxSpeed, AIRBORNE_TUNING.maxHorizontalSpeed)) return null
    const at = (time: number): Vec3 => {
        const t = Math.max(0, Math.min(duration, time)), ratio = t / duration, falling = Math.max(0, t - runoutSeconds)
        return t === duration ? [...to] : [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio, from[2] + velocity * falling - g * falling * falling / 2]
    }
    const count = Math.ceil(duration * 64)
    let previous = from, distance = 0
    for (let i = 1; i <= count; i++) { const p = at(i / count * duration); if (scene?.movementHit(previous, p, height)) return null; distance += distance3(previous, p); previous = p }
    if (scene?.bodyHit?.(to, height)) return null
    return { duration, speed, distance, at }
}
