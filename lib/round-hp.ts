/**
 * HP over one round for every player: one model for the live roster and the
 * radar, so both always show the same number.
 *
 * Exact (script-v1 rounds with per-hit data): every non-lethal hit is
 * recorded — a duel winner's chip on the KILL (`chip`, the loser's last
 * shots) and a damaging grenade on its throw (`hit` / `dmg`) — so HP is
 * 100 minus the hits taken so far, and 0 from the death.
 *
 * Estimate (script-v1 rounds recorded before per-hit data): a KILL's
 * `damage` is the victim's HP when killed, so a victim's earlier chip
 * (100 − damage) is exact; it is shown at their last won duel (where the
 * engine chips the winner) or just before the death. Survivors' chip is only
 * known per round (`RoundResult.damage`): what the other team dealt beyond
 * 100 per kill is split over the survivors by duels won and shown at those
 * duels. Team totals match the engine; the per-player split is an estimate.
 *
 * legacy-v2 rounds carry no damage: HP stays 100 until death.
 *
 * Every step is revealed when its time is reached (`t <= now`), the rule the
 * kill feed, the roster and the radar share.
 */

import type { MatchEvent, RoundResult } from "@/types"

export const MAX_HP = 100

export interface HpStep { t: number; hp: number }

/** A non-lethal hit (exact rounds: every one; estimate: where the chip is placed). */
export interface HpHit {
    t: number
    victimId: string
    /** Who dealt it (duel: the loser who died; grenade: the thrower). */
    attackerId?: string
    dmg: number
    /** Duel chip (from the dying loser) or a grenade (from where it landed). */
    source: "duel" | "grenade"
}

export interface RoundHp {
    /** HP after each change in time order, ending with 0 at the death (absent = 100 all round). */
    steps: Record<string, HpStep[]>
    hits: HpHit[]
    /** The round recorded every hit. */
    exact: boolean
    /** Survivors' chip is an estimate (older script-v1 rounds). */
    estimated: boolean
    /** Any HP information at all (false for legacy-v2 rounds: no HP ring on the radar). */
    known: boolean
}

export interface RoundHpSource {
    round: Pick<RoundResult, "events" | "damage" | "utility">
    /** Both lineups (estimate: the other team's damage is split over a team's survivors). */
    homeIds: readonly string[]
    awayIds: readonly string[]
}

type Kill = MatchEvent & { playerId: string; victimId: string }

/** HP steps and hits of a round. Pure. */
export function roundHp(src: RoundHpSource): RoundHp {
    const events = [...(src.round.events ?? [])].filter(e => Number.isFinite(e.time)).sort((a, b) => a.time - b.time)
    const kills = events.filter((e): e is Kill => e.type === "KILL" && !!e.playerId && !!e.victimId)
    const deathT = new Map<string, number>()
    const killTimes = new Map<string, number[]>()
    for (const k of kills) {
        if (deathT.has(k.victimId)) continue
        deathT.set(k.victimId, k.time)
        const list = killTimes.get(k.playerId) ?? []
        list.push(k.time)
        killTimes.set(k.playerId, list)
    }
    const grenadeHits = (src.round.utility ?? []).filter(u => !!u.hit && typeof u.dmg === "number" && u.dmg > 0 && Number.isFinite(u.t))
    const exact = kills.some(k => typeof k.chip === "number") || grenadeHits.length > 0
    const known = exact || kills.some(k => typeof k.damage === "number") || !!src.round.damage

    const hits: HpHit[] = []
    let estimated = false
    if (exact) {
        for (const k of kills) {
            if (typeof k.chip === "number" && k.chip > 0) hits.push({ t: k.time, victimId: k.playerId, attackerId: k.victimId, dmg: k.chip, source: "duel" })
        }
        for (const u of grenadeHits) hits.push({ t: u.t, victimId: u.hit!, attackerId: u.playerId, dmg: u.dmg!, source: "grenade" })
    } else {
        // Victims: their exact chip, at their last won duel (else just before the death).
        const lastKillBefore = (id: string, t: number) => {
            const before = (killTimes.get(id) ?? []).filter(k => k < t - 0.05)
            return before.length ? before[before.length - 1] : undefined
        }
        for (const k of kills) {
            if (deathT.get(k.victimId) !== k.time || typeof k.damage !== "number") continue
            const chip = MAX_HP - Math.max(0, Math.min(MAX_HP, k.damage))
            if (chip <= 0) continue
            const at = lastKillBefore(k.victimId, k.time)
            hits.push({ t: at ?? Math.max(0, k.time - 1.2), victimId: k.victimId, dmg: chip, source: "duel", ...(at !== undefined ? { attackerId: victimOfKill(kills, k.victimId, at) } : {}) })
        }
        // Survivors: the rest of the other team's damage, split by duels won.
        const dealt = src.round.damage
        if (dealt && Object.keys(dealt).length) {
            const lastKillT = kills.length ? kills[kills.length - 1].time : 0
            for (const team of ["home", "away"] as const) {
                const ids = team === "home" ? src.homeIds : src.awayIds
                const foes = team === "home" ? src.awayIds : src.homeIds
                const dead = ids.filter(id => deathT.has(id)).length
                const rest = foes.reduce((s, id) => s + (dealt[id] ?? 0), 0) - MAX_HP * dead
                const survivors = ids.filter(id => !deathT.has(id))
                if (rest <= 0 || !survivors.length) continue
                estimated = true
                const weights = survivors.map(id => (killTimes.get(id)?.length ?? 0) + 0.5)
                const total = weights.reduce((s, w) => s + w, 0)
                survivors.forEach((id, i) => {
                    const share = Math.min(MAX_HP - 1, Math.round(rest * weights[i] / total))
                    const own = killTimes.get(id)
                    const times = own?.length ? own : [lastKillT]
                    const per = Math.floor(share / times.length)
                    times.forEach((t, j) => {
                        const dmg = j === times.length - 1 ? share - per * (times.length - 1) : per
                        if (dmg > 0) hits.push({ t, victimId: id, dmg, source: "duel", ...(own?.length ? { attackerId: victimOfKill(kills, id, t) } : {}) })
                    })
                })
            }
        }
    }
    hits.sort((a, b) => a.t - b.t)

    const steps: Record<string, HpStep[]> = {}
    const hp = new Map<string, number>()
    for (const h of hits) {
        const death = deathT.get(h.victimId)
        if (death !== undefined && h.t > death) continue
        const cur = Math.max(1, (hp.get(h.victimId) ?? MAX_HP) - h.dmg)
        hp.set(h.victimId, cur)
        ;(steps[h.victimId] ??= []).push({ t: h.t, hp: cur })
    }
    for (const [id, t] of deathT) (steps[id] ??= []).push({ t, hp: 0 })
    return { steps, hits, exact, estimated, known }
}

/** The player `killerId` killed at time `t` (the duel that chipped them). */
function victimOfKill(kills: readonly Kill[], killerId: string, t: number): string | undefined {
    return kills.find(k => k.playerId === killerId && k.time === t)?.victimId
}

/** HP at round time `t` from a player's steps (100 before the first). */
export function hpAt(steps: readonly HpStep[] | undefined, t: number): number {
    let hp = MAX_HP
    if (!steps) return hp
    for (const s of steps) {
        if (s.t > t) break
        hp = s.hp
    }
    return hp
}
