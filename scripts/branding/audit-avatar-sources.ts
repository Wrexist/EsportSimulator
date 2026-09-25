/** Inventory every stock player's own source; never infer identity from roster position. */
import fs from 'node:fs'
import path from 'node:path'
import { mapOriginalIdentities } from '../mod-identity'
import { safeNickSlug } from '../../lib/safe-branding/name-transform'

const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'))
const players = read('public/data/snapshot/players.json')
const teams = read('public/data/snapshot/teams.json')
const { byBaseId } = mapOriginalIdentities(read('raw-data/snapshot/players.json'), read('raw-data/snapshot/teams.json'), players, teams)
const files = fs.readdirSync('public/assets/teams', { recursive: true }).map(String)
    .filter(p => /[/\\]players[/\\].+\.(png|webp|jpg|jpeg)$/i.test(p))
    .map(p => '/assets/teams/' + p.replaceAll('\\', '/'))
const exists = (p: string) => Boolean(p && fs.existsSync(path.join('public', p)))
const rows = players.map((p: any) => {
    const original = byBaseId.get(p.id)!
    const stem = safeNickSlug(original.nickname || original.name)
    const authored = files.filter(f => f.endsWith(`/players/${stem}.png`))
    const sourceCandidates = files.filter(f => f.endsWith(`/players/${stem}.webp`))
    const originalPhoto = exists(original.portraitPath) ? original.portraitPath : null
    const rawBase = (original.portraitPath || '').replace(/^\/assets\//, 'raw-data/').replace(/\.[^.]+$/, '')
    const archivedPhotos = ['.png','.webp','.jpg','.jpeg'].map(ext => rawBase + ext).filter(f => fs.existsSync(f))
    return { id: p.id, nickname: p.nickname || p.name, originalId: original.id,
        originalPhoto, archivedPhotos, authoredCandidates: authored, otherSourceCandidates: sourceCandidates,
        status: originalPhoto || archivedPhotos.length > 0 || authored.length === 1 || sourceCandidates.length === 1 ? 'own-source-needs-review' :
            authored.length + sourceCandidates.length > 1 ? 'ambiguous-needs-review' : 'no-local-source',
        current: p.portraitPath }
})
const counts = rows.reduce((a: Record<string, number>, p: any) => { a[p.status] = (a[p.status] || 0) + 1; return a }, {})
fs.mkdirSync('docs/ui-review/portraits', { recursive: true })
fs.writeFileSync('docs/ui-review/portraits/all-player-source-audit.json', JSON.stringify({
    note: 'Candidates require visual review: file existence does not prove a unique real portrait. No production mapping changes made by this audit.', counts, rows,
}, null, 2) + '\n')
console.log(JSON.stringify(counts))
