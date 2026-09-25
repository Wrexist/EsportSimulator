import type { NavLocation } from './navigation'

/** Deterministic, conservative body spacing. Never invent or project a spawn. */
export function selectSpawnPositions(candidates: NavLocation[], count = 5): NavLocation[] {
    if (!Number.isInteger(count) || count < 1 || count > 5) throw Error('Spawn count must be between one and five')
    const remaining = [...candidates]
    const chosen: NavLocation[] = []
    const distance = (a: NavLocation, b: NavLocation) => Math.abs(a.point[2] - b.point[2]) >= 72
        ? Infinity : Math.hypot(a.point[0] - b.point[0], a.point[1] - b.point[1])
    while (remaining.length && chosen.length < count) {
        // The first candidate is the validator's central representative; spread subsequent players.
        if (chosen.length) remaining.sort((a, b) => {
            const da = Math.min(...chosen.map(p => distance(a, p))), db = Math.min(...chosen.map(p => distance(b, p)))
            return (da === db ? 0 : da > db ? -1 : 1) || a.area - b.area || a.point[0] - b.point[0] || a.point[1] - b.point[1]
        })
        const candidate = remaining.shift()!
        if (chosen.some(p => distance(candidate, p) < 32)) continue
        chosen.push({ area: candidate.area, point: [...candidate.point] })
    }
    return chosen
}
