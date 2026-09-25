// Source integration only. Real database/handlers; synthetic isolated Electron services.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { SnapshotLoader } from '../../data/snapshot-loader'
import { refreshStockIdentities } from '../../lib/identity-refresh'
const { loadHandlers } = require('./electron-handler-harness.cjs')
const root = process.cwd()
const parent = path.join(root, 'tmp/l29-mod-smoke')
fs.mkdirSync(parent, { recursive: true })
const directory = fs.mkdtempSync(path.join(parent, 'run-'))
const h = loadHandlers({ directory })
const originalFetch = globalThis.fetch
const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window')
const originalWindow = globalThis.window
async function main() {
    const file = path.join(root, 'dist-mod/real-teams-2026/database.json')
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
    const baseTeams = JSON.parse(fs.readFileSync(path.join(root, 'public/data/snapshot/teams.json'), 'utf8'))
    const basePlayers = JSON.parse(fs.readFileSync(path.join(root, 'public/data/snapshot/players.json'), 'utf8'))
    ;(globalThis as any).window = { electron: { mods: { exists: () => h.invoke('mod-exists'), read: (name: string) => h.invoke('mod-read', name) } } }
    globalThis.fetch = async input => {
        const url = String(input).split('?')[0]
        if (!/^\/data\/snapshot\/(players|teams|tournaments|sources)\.json$/.test(url)) throw new Error('Unexpected fixture URL')
        return new Response(fs.readFileSync(path.join(root, 'public', url)), { status: 200 })
    }
    assert.equal(await h.invoke('mod-install', JSON.stringify(payload)), true)
    const loader = new SnapshotLoader()
    assert.equal((await loader.loadSnapshot()).success, true)
    const snapshot = loader.getSnapshot()!
    assert.equal(snapshot.teams[0].name, 'Vitality')
    for (const player of payload.players) {
        const loaded = snapshot.players.find(p => p.id === player.id)!
        assert.equal(loaded.nickname, player.nickname)
        assert.equal(loaded.portraitPath, player.portraitPath ? '/mod-assets/' + player.portraitPath : '')
    }
    const career = loader.createCareerFromSnapshot('Isolated L29 mod verification', payload.teams[0].id)!
    refreshStockIdentities(career)
    for (const player of payload.players) assert.equal(career.players.find(p => p.id === player.id)!.nickname, player.nickname)
    for (const team of payload.teams) assert.equal(career.teams.find(t => t.id === team.id)!.name, team.name)
    assert.equal(await h.invoke('workshop-set-active', { source: 'none' }), true)
    const baseLoader = new SnapshotLoader()
    assert.equal((await baseLoader.loadSnapshot()).success, true)
    assert.deepEqual(baseLoader.getSnapshot()!.teams, baseTeams)
    assert.deepEqual(baseLoader.getSnapshot()!.players, basePlayers)
    // The in-memory career is unchanged when a different database is selected.
    assert.equal(career.teams[0].name, 'Vitality')
    const result = { passed: true, directory, teams: payload.teams.length, players: payload.players.length, portraits: payload.players.filter((p: any) => p.portraitPath).length, cases: ['Actual desktop import handler', 'Snapshot overlay and asset URL mapping', 'In-memory career creation', 'Hydration identity preservation', 'Explicit unmodded base fallback'], limitations: ['No owner career/storage opened', 'No Steam client calls', 'No renderer visual acceptance or packaged testing', 'Active mod image retention across switches remains unsupported'] }
    fs.writeFileSync(path.join(root, 'docs/launch-readiness/evidence/L29-mod-smoke.json'), JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
    globalThis.fetch = originalFetch
    if (hadWindow) (globalThis as any).window = originalWindow
    else delete (globalThis as any).window
})
