import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseModContent, validateModContent, validateModReferences, STATS, MAX_MOD_BYTES } from '../electron/mod-content'
import { validateModPayload, loadModSnapshot } from '../engine/mod-loader'
const { loadHandlers } = require('../scripts/launch/electron-handler-harness.cjs')
const { installDatabase, readDatabase } = require('../electron/mod-storage')
const player = (id = 'mod-player') => ({ id, name: 'Example', nickname: 'example', nationality: 'Sweden', age: 21, role: 'RIFLER', tier: 'PRO', portraitPath: 'assets/example.png', ...Object.fromEntries(STATS.map(k => [k, 50])) })
let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'esim-l29-')) })
afterEach(() => {
    expect(path.dirname(path.resolve(dir))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(dir)).toMatch(/^esim-l29-/)
    fs.rmSync(dir, { recursive: true, force: true })
    delete (globalThis as any).window
})

test.each(['../x.png', 'assets\\x.png', 'assets/%2e%2e/x.png', '/assets/x.png?x=1', 'assets/x.svg#x', 'C:/x.png', 'https://x/x.png', 'assets/x.html', 'assets//x.png'])('rejects unsafe media path %s', portraitPath => {
    expect(validateModPayload({ players: [{ ...player(), portraitPath }] }).ok).toBe(false)
})
test('bounded/versioned data and duplicate identities reject before install', () => {
    expect(parseModContent(' '.repeat(MAX_MOD_BYTES + 1)).ok).toBe(false)
    expect(parseModContent('{"players":[],"__proto__":{}}').ok).toBe(false)
    expect(validateModContent({ schema: 2, players: [] }).ok).toBe(false)
    expect(validateModContent({ players: [player(), player()] }).ok).toBe(false)
    expect(validateModContent({ players: [{ ...player(), skill: 101 }] }).ok).toBe(false)
    expect(validateModContent({ tournaments: [{ id: 't', name: 'Partial record' }] }).ok).toBe(false)
})
test('partial import references resolve against merged base and reject double ownership', () => {
    expect(validateModReferences([{ id: 'p' }], [{ id: 't', rosterIds: ['p'] }], [])).toBeNull()
    expect(validateModReferences([], [{ id: 't', rosterIds: ['missing'] }], [])).toContain('unknown player')
    expect(validateModReferences([{ id: 'p' }], [{ id: 't', rosterIds: ['p'] }, { id: 'other', rosterIds: ['p'] }], [])).toContain('multiple rosters')
})
test('actual desktop handlers replace all sections, retain rollback, and leave saves alone', async () => {
    const h = loadHandlers({ directory: dir })
    h.values.esports_save_owner = 'untouched'
    expect(await h.invoke('mod-install', JSON.stringify({ players: [{ ...player(), portraitPath: "" }], teams: [] }))).toBe(true)
    expect(await h.invoke('mod-install', JSON.stringify({ players: [] }))).toBe(true)
    expect(await h.invoke('mod-read', 'teams.json')).toBeNull()
    expect(await h.invoke('mod-restore')).toBe(true)
    expect(JSON.parse(await h.invoke('mod-read', 'players.json'))[0].id).toBe('mod-player')
    expect(await h.invoke('mod-clear')).toBe(true)
    expect(await h.invoke('mod-exists')).toBe(false)
    expect(await h.invoke('mod-restore')).toBe(true)
    expect(h.values.esports_save_owner).toBe('untouched')
})
test('a failed commit retains the complete previous database and backup', () => {
    installDatabase(dir, JSON.stringify({ players: [player()] }))
    const rename = jest.spyOn(fs, 'renameSync').mockImplementationOnce((from, to) => {
        // Allow backup commit; fail only the following live database rename.
        rename.mockRestore()
        fs.renameSync(from, to)
        jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('Simulated disk failure') })
    })
    try { expect(() => installDatabase(dir, '{"teams":[]}')).toThrow('Simulated disk failure') }
    finally { jest.restoreAllMocks() }
    expect(readDatabase(dir).players[0].id).toBe('mod-player')
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'database.previous.json'), 'utf8')).players[0].id).toBe('mod-player')
})
test('base-game selection and unavailable Workshop never activate a stale community import', async () => {
    const h = loadHandlers({ directory: dir })
    expect(await h.invoke('mod-install', JSON.stringify({ players: [player()] }))).toBe(true)
    expect(await h.invoke('workshop-set-active', { source: 'none' })).toBe(true)
    expect(await h.invoke('mod-exists')).toBe(false)
    fs.writeFileSync(path.join(dir, 'mods/active.json'), '{"source":"workshop","workshopId":"123"}')
    expect(await h.invoke('mod-exists')).toBe(false)
    expect(await h.invoke('mod-read', 'players.json')).toBeNull()
    fs.writeFileSync(path.join(dir, 'mods/active.json'), '{corrupt')
    expect(await h.invoke('mod-exists')).toBe(false)
})
test('malformed supplied section rejects the whole runtime overlay', async () => {
    ;(globalThis as any).window = { electron: { mods: { exists: async () => true, read: async (name: string) => name === 'players.json' ? '{bad' : name === 'teams.json' ? '[]' : null } } }
    expect(await loadModSnapshot()).toBeNull()
})
test('a hand-edited wrong section type rejects the whole runtime overlay', async () => {
    ;(globalThis as any).window = { electron: { mods: { exists: async () => true, read: async (name: string) => name === 'players.json' ? '{}' : name === 'teams.json' ? '[]' : null } } }
    expect(await loadModSnapshot()).toBeNull()
})
