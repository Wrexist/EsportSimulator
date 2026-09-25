import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { pinDatabase, bundleDirectory } = require('../electron/mod-assets')
const { STATS } = require('../electron/mod-content')
const { installDatabase, restoreDatabase } = require('../electron/mod-storage')
const { loadHandlers } = require('../scripts/launch/electron-handler-harness.cjs')
let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'esim-mod-art-')) })
afterEach(() => {
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(root)).toMatch(/^esim-mod-art-/)
    fs.rmSync(root, { recursive: true, force: true })
})
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6CkAAAAASUVORK5CYII=', 'base64')
function fixture() {
    const source = path.join(root, 'source'); fs.mkdirSync(path.join(source, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(source, 'assets/player.png'), png)
    const player = { id: 'mod-player', name: 'Fixture', nickname: 'fixture', age: 22, nationality: 'SE', role: 'RIFLER', tier: 'PRO', portraitPath: 'assets/player.png', ...Object.fromEntries(STATS.map((k: string) => [k, 50])) }
    fs.writeFileSync(path.join(source, 'database.json'), JSON.stringify({ schema: 1, players: [player] }))
    return source
}
test('portrait bytes and URLs survive source removal and database replacement/restore', async () => {
    const source = fixture()
    const pinned = await pinDatabase(source, root)
    expect(pinned.players[0].portraitPath).toMatch(/^\/mod-assets\/pinned\/[a-f0-9]{64}\/assets\/player.png$/)
    const cached = path.join(bundleDirectory(root, pinned.assetBundleId), 'assets/player.png')
    fs.unlinkSync(path.join(source, 'assets/player.png'))
    expect(fs.readFileSync(cached)).toEqual(png)
    const community = path.join(root, 'mods/community')
    installDatabase(community, JSON.stringify(pinned))
    installDatabase(community, '{"players":[]}')
    restoreDatabase(community)
    const h = loadHandlers({ directory: root })
    expect(JSON.parse(await h.invoke('mod-read', 'players.json'))[0].portraitPath).toBe(pinned.players[0].portraitPath)
    expect(await h.invoke('workshop-set-active', { source: 'none' })).toBe(true)
    expect(fs.readFileSync(cached)).toEqual(png)
})
test('missing and disguised image files reject instead of creating an incomplete active bundle', async () => {
    const source = fixture()
    fs.writeFileSync(path.join(source, 'assets/player.png'), '<html>not an image</html>')
    await expect(pinDatabase(source, root)).rejects.toThrow()
    fs.unlinkSync(path.join(source, 'assets/player.png'))
    await expect(pinDatabase(source, root)).rejects.toThrow()
})
test('different user-data roots never share an in-flight cache result', async () => {
    const source = fixture()
    const second = path.join(root, 'second'); fs.mkdirSync(second)
    const [a, b] = await Promise.all([pinDatabase(source, root), pinDatabase(source, second)])
    expect(a.assetBundleId).toBe(b.assetBundleId)
    expect(bundleDirectory(root, a.assetBundleId)).not.toBe(bundleDirectory(second, b.assetBundleId))
})


test('a selected cached Workshop database works offline and a missing bundle never selects community data', async () => {
    const source = fixture()
    const pinned = await pinDatabase(source, root)
    fs.mkdirSync(path.join(root, 'mods'), { recursive: true })
    fs.writeFileSync(path.join(root, 'mods/active.json'), JSON.stringify({source:'workshop',workshopId:'123',bundleId:pinned.assetBundleId}))
    const h = loadHandlers({ directory: root })
    expect(JSON.parse(await h.invoke('mod-read', 'players.json'))[0].portraitPath).toBe(pinned.players[0].portraitPath)
    installDatabase(path.join(root, 'mods/community'), '{"players":[]}')
    fs.writeFileSync(path.join(root, 'mods/active.json'), JSON.stringify({source:'workshop',workshopId:'123',bundleId:'a'.repeat(64)}))
    expect(await h.invoke('mod-read', 'players.json')).toBeNull()
})
