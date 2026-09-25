import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspectModPackage, sha256 } from '../scripts/mod-package'
import { mapOriginalIdentities } from '../scripts/mod-identity'
import { STATS } from '../electron/mod-content'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esim-mod-package-')) })
afterEach(() => {
    expect(path.dirname(path.resolve(dir))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(dir)).toMatch(/^esim-mod-package-/)
    fs.rmSync(dir, { recursive: true, force: true })
})
function fixture() {
    const manifest = { game: 'Esports Manager', schema: 1, appId: 4326170, teams: 0, players: 0 }
    const files = { 'players.json': '[]', 'teams.json': '[]', 'database.json': '{"players":[],"teams":[],"schema":1}' }
    const inventory = { schema: 1, files: Object.entries(files).map(([file, value]) => ({ path: file, bytes: Buffer.byteLength(value), sha256: sha256(value) })) }
    for (const [file, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), data)
    for (const [file, data] of Object.entries({ 'manifest.json': manifest, 'inventory.json': inventory, 'release-review.json': { status: 'blocked' } })) fs.writeFileSync(path.join(dir, file), JSON.stringify(data))
}
test('a valid draft passes integrity but is never release-ready', async () => {
    fixture()
    expect(await inspectModPackage(dir)).toMatchObject({ releaseReady: false, teams: 0, players: 0, files: 3 })
})
test('tampered and unlisted code cannot pass publisher preflight', async () => {
    fixture()
    fs.writeFileSync(path.join(dir, 'players.json'), '[{}]')
    await expect(inspectModPackage(dir)).rejects.toThrow('Integrity mismatch')
    fs.writeFileSync(path.join(dir, 'players.json'), '[]')
    fs.writeFileSync(path.join(dir, 'autorun.js'), 'throw new Error("must never execute")')
    await expect(inspectModPackage(dir)).rejects.toThrow('Unlisted package file')
})
test('stale review evidence cannot clear a changed inventory', async () => {
    fixture()
    fs.writeFileSync(path.join(dir, 'release-review.json'), JSON.stringify({ status: 'cleared', inventorySha256: 'stale', gameReleased: true, rightsEvidence: ['review'], packagedWorkshopEvidence: ['test'] }))
    expect((await inspectModPackage(dir)).releaseReady).toBe(false)
})
test('mapping remains correct after original rows are reordered, and fails closed on ambiguity', () => {
    const original = (id: string, skill: number) => ({ id, nationality: 'SE', ...Object.fromEntries(STATS.map(k => [k, k === 'skill' ? skill : 50])) })
    const raw = [original('player_1_real_alpha', 70), original('player_1_real_beta', 60)]
    const base = raw.map((p, i) => ({ ...p, id: `player_1_fictional_${i}` }))
    const realTeam = { id: 'team_1_real', rosterIds: raw.map(p => p.id) }
    const team = { id: 'team_1_fictional', rosterIds: base.map(p => p.id) }
    const result = mapOriginalIdentities([...raw].reverse(), [realTeam], base, [team])
    expect(result.mappings.map(m => m.originalId)).toEqual(raw.map(p => p.id))
    expect(() => mapOriginalIdentities([raw[0], { ...raw[0], id: 'player_1_ambiguous' }], [realTeam], base, [team])).toThrow('Ambiguous')
    expect(() => mapOriginalIdentities(raw, [realTeam], [{ ...base[0], skill: 99 }], [team])).toThrow('No verified original')
})
