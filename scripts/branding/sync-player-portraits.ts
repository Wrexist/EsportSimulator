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
const reviewed = read('data/player-portrait-reviewed.json') as Array<{id: string; source: string; sourceFile?: string; destination: string; sha256: string; sourceSha256: string; canonicalPortraitId?: string}>
const historicalAliases = read('docs/ui-review/portraits/alternate-identity-confirmed.json') as Array<{id: string; canonicalId: string; source: string; identityEvidence: {original: string; candidate: string}}>
const topTeamIds = new Set(teams.slice().sort((a: any, b: any) => b.reputation - a.reputation).slice(0,25).map((t: any) => t.id))
const reviewedIds = new Set(reviewed.map(p => p.id))
if (reviewedIds.size !== reviewed.length) throw Error('Duplicate reviewed portrait identity')
for (const id of reviewedIds) if (!players.some((p: any) => p.id === id)) throw Error(`Unknown reviewed player: ${id}`)
const evidence: object[] = [], missing: object[] = []
const rosteredIds = new Set(teams.flatMap((team: any) => team.rosterIds))
// Free agents and historical roster entries still have permanent identities.
// Review coverage must not depend on whether a club currently lists them.
const portraitGroups = [
    ...teams.slice().sort((a: any, b: any) => b.reputation - a.reputation),
    { id: 'unrostered-reviewed', name: 'Unrostered reviewed players', rosterIds: [...reviewedIds].filter(id => !rosteredIds.has(id)) },
]
for (const team of portraitGroups) {
    for (const id of team.rosterIds) {
        if (!topTeamIds.has(team.id) && !reviewedIds.has(id)) continue
        const original = byBaseId.get(id)!
        // Team naming changed after baking. Match the original pipeline's exact
        // nickname stem, rejecting ambiguous entries instead of guessing a face.
        const stem = safeNickSlug(original.nickname || original.name)
        const polished = reviewed.find(p => p.id === id)
        if (polished) {
            const sameOriginalStem = polished.source.replace(/\.[^.]+$/, '') === original.portraitPath?.replace(/\.[^.]+$/, '')
            let verifiedHistoricalAlias = false
            if (polished.canonicalPortraitId) {
                const alias = historicalAliases.find(a => a.id === id && a.canonicalId === polished.canonicalPortraitId)
                const canonical = reviewed.find(p => p.id === polished.canonicalPortraitId)
                if (alias && canonical && alias.source === polished.sourceFile && canonical.destination === polished.destination) {
                    const oldMetadata = read(alias.identityEvidence.original)
                    const sourceMetadata = read(alias.identityEvidence.candidate)
                    verifiedHistoricalAlias = Boolean(oldMetadata.name) && oldMetadata.name === sourceMetadata.name &&
                        oldMetadata.countryCode === sourceMetadata.countryCode && oldMetadata.age === sourceMetadata.age &&
                        canonical.source.replace(/^\/assets\//, 'raw-data/').replace(/\.[^.]+$/, '.json') === alias.identityEvidence.candidate
                }
                if (!verifiedHistoricalAlias) throw Error(`Unverified historical portrait identity: ${id}`)
            }
            if (!sameOriginalStem && !polished.source.includes(`/players/${stem}.`) && !verifiedHistoricalAlias) throw Error(`Reviewed identity mismatch: ${id}`)
            const sourceFile = polished.sourceFile || `public${polished.source}`
            const archiveFile = polished.source.replace(/^\/assets\//, 'raw-data/')
            if (sourceFile !== `public${polished.source}` && sourceFile !== archiveFile) throw Error(`Unexpected reference location: ${id}`)
            for (const [file, expected] of [[sourceFile, polished.sourceSha256], [`public${polished.destination}`, polished.sha256]]) {
                if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw Error(`Reviewed artwork changed: ${file}`)
            }
            identities[id] = polished.destination
            evidence.push({...polished, team: team.name})
            continue
        }
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
for (const polished of reviewed) {
    if (identities[polished.id] !== polished.destination) throw Error(`Reviewed portrait was not mapped: ${polished.id}`)
}
if (process.argv.includes('--write')) {
    fs.mkdirSync('tmp/portrait-sync-backup', { recursive: true })
    const backup = 'tmp/portrait-sync-backup/players.json'
    if (!fs.existsSync(backup)) fs.copyFileSync('public/data/snapshot/players.json', backup)
    fs.writeFileSync('data/player-portrait-identities.json', JSON.stringify(identities, null, 2) + '\n')
    for (const p of players) if (identities[p.id]) p.portraitPath = identities[p.id]
    fs.writeFileSync('public/data/snapshot/players.json', JSON.stringify(players, null, 2) + '\n')
    fs.writeFileSync('docs/launch-readiness/evidence/2026-09-25-portrait-sync.json', JSON.stringify({
        scope: 'Top 25 stock teams plus individually reviewed portraits outside that group. Reviewed imagegen edits take priority over retained stylized PNGs and face crops. Original photographs and branded sources remain excluded. Unreviewed players retain existing fallbacks pending individual source review.',
        evidence, missing,
    }, null, 2) + '\n')
}
console.log(JSON.stringify({ matched: evidence.length, missing }, null, 2))
