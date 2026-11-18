import { evaluatePlayer } from "@/engine/player-evaluation"
import type { PlayerSaveData } from "@/engine/save-types"

/** The five who play are the first five of `rosterIds` (selectActiveRosterIds). */
const STARTERS = 5

/** A bench player who is better than a starter, and the roster swap that puts him in the five. */
export interface LineupUpgrade {
    benchId: string
    benchIndex: number
    benchOvr: number
    starterId: string
    starterIndex: number
    starterOvr: number
}

type Rated = { id: string; index: number; ovr: number; role?: string }

function rate(rosterIds: string[], players: PlayerSaveData[], currentWeek?: number): Rated[] {
    const byId = new Map(players.map(p => [p.id, p]))
    const out: Rated[] = []
    rosterIds.forEach((id, index) => {
        const p = byId.get(id)
        if (!p || p.isRetired) return
        let ovr = p.skill ?? 0
        try { ovr = evaluatePlayer(p, undefined, undefined, currentWeek).overallRating } catch { /* keep the raw skill */ }
        out.push({ id, index, ovr, role: p.role ?? undefined })
    })
    return out
}

function weakest(list: Rated[]): Rated | undefined {
    return list.reduce<Rated | undefined>((w, r) => (!w || r.ovr < w.ovr ? r : w), undefined)
}

/**
 * NEWPLAYER-01: the swap that starts `playerId` (now on the bench) in place
 * of the weakest starter of his role, else the weakest starter. Null when he
 * already starts, is injured, or is not better than that starter.
 */
export function startingSwapFor(rosterIds: string[], players: PlayerSaveData[], playerId: string, currentWeek?: number): LineupUpgrade | null {
    const benchIndex = rosterIds.indexOf(playerId)
    if (benchIndex < STARTERS) return null
    const player = players.find(p => p.id === playerId)
    if (!player || player.injury) return null
    const rated = rate(rosterIds, players, currentWeek)
    const bench = rated.find(r => r.id === playerId)
    const starters = rated.filter(r => r.index < STARTERS)
    if (!bench || starters.length < STARTERS) return null
    const target = weakest(starters.filter(s => s.role && s.role === bench.role)) ?? weakest(starters)
    if (!target || bench.ovr <= target.ovr) return null
    return { benchId: bench.id, benchIndex: bench.index, benchOvr: bench.ovr, starterId: target.id, starterIndex: target.index, starterOvr: target.ovr }
}

/**
 * NEWPLAYER-01: a fit bench player rated above a starter of his own role
 * (the biggest such gap), for the one-line warning on match prep.
 */
export function benchedUpgrade(rosterIds: string[], players: PlayerSaveData[], currentWeek?: number): LineupUpgrade | null {
    const injured = new Set(players.filter(p => p.injury).map(p => p.id))
    const rated = rate(rosterIds, players, currentWeek)
    const starters = rated.filter(r => r.index < STARTERS)
    let best: LineupUpgrade | null = null
    for (const b of rated) {
        if (b.index < STARTERS || injured.has(b.id) || !b.role) continue
        const s = weakest(starters.filter(r => r.role === b.role))
        if (!s || b.ovr <= s.ovr) continue
        if (!best || b.ovr - s.ovr > best.benchOvr - best.starterOvr) {
            best = { benchId: b.id, benchIndex: b.index, benchOvr: b.ovr, starterId: s.id, starterIndex: s.index, starterOvr: s.ovr }
        }
    }
    return best
}
