import catalog from '@/data/team-identity-catalog.json'
import { CURATED_TEAM_MOTIFS, EMBLEM_DRAWINGS, emblemMotifFor, type EmblemMotif } from '@/lib/team-emblem-design'

type Identity = { motif: EmblemMotif; primary: string }
const assigned = new Map<string, Identity>()
const used = new Set<string>()
const motifs = Object.keys(EMBLEM_DRAWINGS) as EmblemMotif[]

// Canonical catalog order, independent of save/roster order. Authored studies win.
const ordered = [...catalog].sort((a, b) =>
    Number(Boolean(CURATED_TEAM_MOTIFS[b.id])) - Number(Boolean(CURATED_TEAM_MOTIFS[a.id])) || a.id.localeCompare(b.id, 'en'))
for (const team of ordered) {
    const preferred = emblemMotifFor(team.id, team.name)
    let primary = team.branding?.primaryColor || '#38bdf8'
    let motif = preferred
    let attempt = 0
    while (used.has(`${primary.toLowerCase()}:${motif}`)) {
        attempt++
        motif = motifs[(motifs.indexOf(preferred) + attempt) % motifs.length]
        if (attempt % motifs.length === 0) {
            // A crowded color family gets a subtle distinct tint after all silhouettes.
            const hex = primary.replace('#', '')
            primary = '#' + [0, 2, 4].map(offset => Math.min(255, parseInt(hex.slice(offset, offset + 2), 16) + 12).toString(16).padStart(2, '0')).join('')
        }
    }
    used.add(`${primary.toLowerCase()}:${motif}`)
    assigned.set(team.id, { motif, primary })
}
const stockColors = new Map(catalog.map(team => [team.id, team.branding?.primaryColor]))

/** Custom colors remain authoritative; stock marks remain stable across renames. */
export function teamEmblemIdentity(seed: string, name: string, primary: string): Identity {
    const stock = assigned.get(seed)
    return stock && stockColors.get(seed)?.toLowerCase() === primary.toLowerCase()
        ? stock : { motif: emblemMotifFor(seed, name), primary }
}
