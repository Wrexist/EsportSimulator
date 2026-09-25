/** Restore authored faces by verified stock identity, never by roster position. */
import fs from 'node:fs'
import crypto from 'node:crypto'
import { mapOriginalIdentities } from '../mod-identity'
import { safeNickSlug } from '../../lib/safe-branding/name-transform'
import aliases from '../../data/portrait-asset-aliases.json'

const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'))
const teams = read('public/data/snapshot/teams.json')
const players = read('public/data/snapshot/players.json')
const rawTeams = read('raw-data/snapshot/teams.json')
const { byBaseId } = mapOriginalIdentities(read('raw-data/snapshot/players.json'), rawTeams, players, teams)
const retained = aliases as Record<string, string>
const crops = read('data/player-portrait-face-crops.json') as Array<{id: string; source: string; destination: string; sha256: string; sourceSha256: string}>
const identities: Record<string, string> = {}
const evidence: object[] = [], missing: object[] = []
for (const team of teams.slice().sort((a: any, b: any) => b.reputation - a.reputation).slice(0, 25)) {
    for (const id of team.rosterIds) {
        const original = byBaseId.get(id)!
        // Team naming changed after baking. Match the original pipeline's exact
        // nickname stem, rejecting ambiguous entries instead of guessing a face.
        const stem = safeNickSlug(original.nickname || original.name)
        const crop = crops.find(p => p.id === id)
        if (crop) {
            if (!crop.source.endsWith(`/players/${stem}.webp`)) throw Error(`Crop identity mismatch: ${id}`)
            for (const [file, expected] of [[crop.source, crop.sourceSha256], [crop.destination, crop.sha256]]) {
                if (crypto.createHash('sha256').update(fs.readFileSync(`public${file}`)).digest('hex') !== expected) throw Error(`Crop changed: ${file}`)
            }
            identities[id] = crop.destination
            evidence.push({...crop, team: team.name})
            continue
        }
        const sources = Object.keys(retained).filter(p => p.endsWith(`/players/${stem}.png`))
        if (sources.length !== 1) { missing.push({ id, team: team.name, stem, candidates: sources }); continue }
        const source = sources[0], destination = retained[source]
        const bytes = fs.readFileSync(`public${destination}`)
        if (!bytes.equals(fs.readFileSync(`public${source}`))) throw Error(`Retained face differs: ${id}`)
        identities[id] = destination
        evidence.push({ id, team: team.name, source, destination, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
    }
}
if (process.argv.includes('--write')) {
    fs.mkdirSync('tmp/portrait-sync-backup', { recursive: true })
    const backup = 'tmp/portrait-sync-backup/players.json'
    if (!fs.existsSync(backup)) fs.copyFileSync('public/data/snapshot/players.json', backup)
    fs.writeFileSync('data/player-portrait-identities.json', JSON.stringify(identities, null, 2) + '\n')
    for (const p of players) if (identities[p.id]) p.portraitPath = identities[p.id]
    fs.writeFileSync('public/data/snapshot/players.json', JSON.stringify(players, null, 2) + '\n')
    fs.writeFileSync('docs/launch-readiness/evidence/2026-09-25-portrait-sync.json', JSON.stringify({
        scope: 'Top 25 stock teams; verified stylized PNGs and original-face crops. Original photographs and branded full-body source images remain excluded. Other players keep stable existing fallbacks.',
        evidence, missing,
    }, null, 2) + '\n')
}
console.log(JSON.stringify({ matched: evidence.length, missing }, null, 2))
