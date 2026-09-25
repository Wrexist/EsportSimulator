import { STATS } from "../electron/mod-content"
const fingerprint = (p: any) => JSON.stringify([p.id.split("_")[1], p.nationality, ...STATS.map(k => p[k])])

export function mapOriginalIdentities(rawPlayers: any[], rawTeams: any[], basePlayers: any[], baseTeams: any[]) {
    const candidates = new Map<string, any>()
    for (const p of rawPlayers) {
        const key = fingerprint(p)
        if (candidates.has(key)) throw new Error(`Ambiguous original player fingerprint: ${p.id}`)
        candidates.set(key, p)
    }
    const mappings = basePlayers.map(p => {
        const original = candidates.get(fingerprint(p))
        if (!original) throw new Error(`No verified original identity for ${p.id}`)
        return { baseId: p.id, originalId: original.id, original }
    })
    if (new Set(mappings.map(m => m.originalId)).size !== basePlayers.length) throw new Error("Original identity reused")
    const byBaseId = new Map(mappings.map(m => [m.baseId, m.original]))
    const teamMappings = baseTeams.map(t => {
        const originalIds = t.rosterIds.map((id: string) => byBaseId.get(id)?.id)
        const matches = rawTeams.filter(r => r.id.split("_")[1] === t.id.split("_")[1] && originalIds.length > 0 && originalIds.every((id: string) => r.rosterIds.includes(id)))
        if (matches.length !== 1) throw new Error(`Ambiguous or incomplete original team roster for ${t.id}`)
        return { baseId: t.id, originalId: matches[0].id, original: matches[0] }
    })
    return { mappings, teamMappings, byBaseId }
}
