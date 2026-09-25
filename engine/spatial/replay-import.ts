import { z } from 'zod'
import { parseLabProject } from '@/lib/spatial-lab-project'
import type { SpatialReference } from './types'
import { verifyRoundReplay, type SpatialRoundReplay } from './round-replay'

export const MAX_ROUND_REPLAY_BYTES = 12_000_000
const number = z.number().finite(), tick = number.int().min(0).max(7000)
const point = z.tuple([number.min(-100000).max(100000), number.min(-100000).max(100000), number.min(-100000).max(100000)])
const id = z.string().regex(/^(T|CT)[1-5]$/), text = z.string().max(1000), side = z.enum(['T', 'CT'])
const stock = z.object({ smoke: number.int().min(0).max(1), flash: number.int().min(0).max(2), he: number.int().min(0).max(1), fire: number.int().min(0).max(1), decoy: number.int().min(0).max(1) })
const contact = z.object({ enemy: id, point, seen: tick, received: tick, source: id, visible: z.boolean(), confidence: number.min(0).max(1), uncertainty: number.min(0).max(100000) })
const plan = z.object({ mode: z.enum(['default', 'execute', 'rotate', 'retake', 'save']), site: z.enum(['A', 'B']), since: tick, reason: text })
const actor = z.object({ id, side, role: z.enum(['entry', 'support', 'lurk', 'anchor']), position: point, yaw: number.min(-100000).max(100000), health: number.min(0).max(100), armor: number.min(0).max(100), ammo: number.int().min(0).max(30), intent: z.enum(['entry', 'support', 'lurk', 'anchor', 'default', 'trade', 'rotate', 'execute', 'retake', 'save', 'clutch', 'plant', 'defuse', 'blocked', 'dead']), reason: text, goal: point.nullable(), contacts: z.array(contact).max(5), blindUntil: tick, inventory: stock.nullable() })
const frame = z.object({ tick, actors: z.array(actor).min(2).max(10), plans: z.object({ T: plan, CT: plan }), reports: z.object({ T: z.array(contact).max(5), CT: z.array(contact).max(5) }), bomb: z.object({ state: z.enum(['carried', 'dropped', 'planted', 'defused', 'exploded']), carrier: id.nullable(), point, site: z.enum(['A', 'B']), plantedTick: tick.nullable(), progress: tick, actor: id.nullable() }) })
const event = z.object({ tick, type: z.string().min(1).max(64), side: side.optional(), actor: id.optional(), target: id.optional(), point: point.optional(), from: point.optional(), reason: text, damage: number.min(0).max(1000).optional(), grenade: z.string().max(80).optional() })
const grenade = z.enum(['smoke', 'flash', 'he', 'fire', 'decoy']), grenadeId = z.string().min(1).max(80)
const utility = z.object({
    effects: z.array(z.object({ id: grenadeId, owner: id, kind: grenade, point, start: tick, end: tick, cells: z.array(point).max(1000).optional() })).max(8),
    flights: z.array(z.object({ id: grenadeId, owner: id, kind: grenade, point, velocity: point, start: tick, state: z.enum(['flying', 'resting', 'detonated', 'failed']), bounces: z.array(point).max(512), path: z.array(z.object({ tick, point })).max(6000), grounded: z.boolean() })).max(8),
    checks: z.array(z.object({ id: grenadeId, state: z.enum(['draft', 'matches-model', 'mismatch', 'failed', 'pending']), landingError: number.min(0).optional(), bounceErrors: z.array(number.min(0).nullable()).max(512), reason: text })).max(8),
})
const resultSchema = z.object({ version: z.literal(1), frames: z.array(frame).min(1).max(722), events: z.array(event).max(100000), outcome: z.enum(['T', 'CT', 'unresolved']), reason: text, utility: utility.optional(), metrics: z.object({ shots: number.min(0), damage: number.min(0), reports: number.min(0), waits: number.min(0), replans: number.min(0), minSeparation: number.min(0) }) })

/** Validate a recorded round without simulating it. A checksum is not proof of origin or calibrated physics. */
export async function importRoundReplay(raw: string, reference: SpatialReference): Promise<SpatialRoundReplay> {
    if (typeof raw !== 'string' || raw.length > MAX_ROUND_REPLAY_BYTES || new TextEncoder().encode(raw).length > MAX_ROUND_REPLAY_BYTES) throw Error('Replay exceeds the 12 MB limit')
    let replay: SpatialRoundReplay
    try { replay = JSON.parse(raw) } catch { throw Error('Choose a valid round replay JSON file') }
    if (!await verifyRoundReplay(replay)) throw Error('Replay checksum or engine version is invalid')
    if (replay.meshSha256 !== reference.meshSha256) throw Error('Replay uses a different collision reference')
    const project = parseLabProject(JSON.stringify(replay.project), reference)
    if (!project.teams) throw Error('Replay is missing its team setup')
    const parsed = resultSchema.safeParse(replay.result)
    if (!parsed.success) throw Error(`Invalid replay data at ${parsed.error.issues[0].path.join('.')}`)
    const result = parsed.data, maxTick = Math.floor(project.teams.seconds * 64), last = result.frames.at(-1)!
    if (result.frames[0].tick !== 0 || last.tick > maxTick || result.frames.some((f,i) => i > 0 && (f.tick <= result.frames[i-1].tick || f.tick - result.frames[i-1].tick > 8))) throw Error('Replay frames are missing or out of order')
    if (result.events.some((e,i) => e.tick > last.tick || i > 0 && e.tick < result.events[i-1].tick)) throw Error('Replay events are out of order')
    const members = new Map(project.teams.actors.map(a => [a.id, a])), health = new Map(project.teams.actors.map(a => [a.id, a.health]))
    const known = (value: string | null | undefined) => value == null || members.has(value)
    for (const e of result.events) if (!known(e.actor) || !known(e.target) || e.actor && e.side && members.get(e.actor)!.side !== e.side) throw Error('Replay event has a foreign actor or side')
    let cursor = 0
    for (const f of result.frames) {
        while (cursor < result.events.length && result.events[cursor].tick <= f.tick) {
            const e = result.events[cursor++]
            if (['damage', 'blast-damage', 'fire-damage'].includes(e.type)) {
                if (!e.actor || !e.target || e.damage === undefined) throw Error('Replay damage has no owner, target or amount')
                health.set(e.target, Math.max(0, health.get(e.target)! - e.damage))
            }
        }
        if (f.actors.length !== members.size || new Set(f.actors.map(a => a.id)).size !== members.size) throw Error('Replay roster changed during the round')
        for (const a of f.actors) if (!members.has(a.id) || a.side !== members.get(a.id)!.side || a.health !== health.get(a.id)) throw Error('Replay actor or health contradicts the event stream')
        for (const team of ['T', 'CT'] as const) {
            const contacts = [...f.reports[team], ...f.actors.filter(a => a.side === team).flatMap(a => a.contacts)]
            if (f.plans[team].since > f.tick || contacts.some(c => !members.has(c.enemy) || members.get(c.enemy)!.side === team || !members.has(c.source) || members.get(c.source)!.side !== team || c.seen > f.tick || c.received > f.tick)) throw Error('Replay knowledge contains a foreign or future observation')
        }
        if (!known(f.bomb.carrier) || !known(f.bomb.actor) || f.bomb.plantedTick !== null && f.bomb.plantedTick > f.tick) throw Error('Replay bomb state has an invalid actor or time')
    }
    if (result.utility && [...result.utility.effects, ...result.utility.flights].some(u => !known(u.owner))) throw Error('Replay utility has a foreign owner')
    const ts = last.actors.filter(a => a.side === 'T' && a.health > 0).length, cts = last.actors.filter(a => a.side === 'CT' && a.health > 0).length
    const outcome = last.bomb.state === 'exploded' ? 'T' : last.bomb.state === 'defused' ? 'CT' : !ts && last.bomb.state !== 'planted' ? 'CT' : !cts ? 'T' : last.bomb.state !== 'planted' && last.tick >= project.teams.roundSeconds * 64 ? 'CT' : 'unresolved'
    if (result.outcome !== outcome || outcome === 'unresolved' && last.tick !== maxTick) throw Error('Replay outcome contradicts its recorded objective state')
    return replay
}
