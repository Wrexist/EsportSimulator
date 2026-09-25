import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SteamService } from '../engine/steam-service'
const { loadHandlers } = require('../scripts/launch/electron-handler-harness.cjs')
let directory: string
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'esim-l30-')) })
afterEach(() => {
    delete (globalThis as any).window
    expect(path.dirname(path.resolve(directory))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(directory)).toMatch(/^esim-l30-/)
    fs.rmSync(directory, { recursive: true, force: true })
})
function renderer(bridge?: any) {
    const cache = new Map<string, string>()
    ;(globalThis as any).window = { electron: bridge ? { steam: bridge } : undefined, localStorage: { getItem: (k: string) => cache.get(k) ?? null, setItem: (k: string, v: string) => cache.set(k, v) } }
    return { service: new (SteamService as any)() as SteamService, cache }
}
test('native achievement namespace and boolean acknowledgement match installed SDK', async () => {
    let accept = false
    const store = jest.fn(() => accept)
    const activate = jest.fn(() => accept)
    const h = loadHandlers({ directory, steamClient: { localplayer: { getName: () => 'Fixture' }, achievement: { activate, isActivated: () => true }, stats: { store } } })
    expect(await h.invoke('steam-set-achievement', 'FIRST_WIN')).toBe(false)
    expect(store).not.toHaveBeenCalled()
    accept = true
    expect(await h.invoke('steam-set-achievement', 'FIRST_WIN')).toBe(true)
    expect(await h.invoke('steam-is-achievement-unlocked', 'FIRST_WIN')).toBe(true)
    store.mockReturnValue(false)
    expect(await h.invoke('steam-store-stats')).toBe(false)
})
test('integer zero is valid and best-career stats cannot regress across careers', async () => {
    const values: Record<string, number> = { stat_total_wins: 20, stat_peak_ranking: 5, stat_total_kills: 0 }
    let accepted = true
    const h = loadHandlers({ directory, steamClient: { localplayer: { getName: () => 'Fixture' }, stats: { getInt: (k: string) => values[k] ?? null, setInt: (k: string, v: number) => { if (accepted) values[k] = v; return accepted } } } })
    expect(await h.invoke('steam-get-stat', 'stat_total_kills')).toBe(0)
    expect(await h.invoke('steam-set-stat', 'stat_total_wins', 2)).toBe(true)
    expect(values.stat_total_wins).toBe(20)
    expect(await h.invoke('steam-set-stat', 'stat_peak_ranking', 2)).toBe(true)
    expect(values.stat_peak_ranking).toBe(2)
    expect(await h.invoke('steam-set-stat', 'stat_total_wins', 1.5)).toBe(false)
    accepted = false
    expect(await h.invoke('steam-set-stat', 'stat_total_wins', 200)).toBe(false)
})
test('Cloud receipts block cross-account writes, reads and listings', async () => {
    let account = '123'
    const writeFile = jest.fn(() => true)
    const readFile = jest.fn(() => 'fixture')
    const h = loadHandlers({ directory, steamClient: { localplayer: { getName: () => 'Fixture', getSteamId: () => account }, cloud: { fileExists: () => false, writeFile, readFile, listFiles: () => [{ name: 'save_fixture.json', size: 10n }], isEnabledForAccount: () => true, isEnabledForApp: () => true } } })
    expect(await h.invoke('steam-cloud-write', 'save_fixture.json', '{}')).toBe(true)
    expect(await h.invoke('steam-cloud-list')).toEqual(['save_fixture.json'])
    account = '456'
    expect(await h.invoke('steam-cloud-write', 'save_fixture.json', '{}')).toBe(false)
    expect(await h.invoke('steam-cloud-read', 'save_fixture.json')).toBeNull()
    expect(await h.invoke('steam-cloud-list')).toEqual([])
    expect(writeFile).toHaveBeenCalledTimes(1)
    expect(readFile).not.toHaveBeenCalled()
})
test('missing career caches do not inherit another offline career achievements', async () => {
    const { service } = renderer()
    await service.initialize()
    await service.setActiveSave('career-a')
    await service.unlockAchievement('FIRST_WIN')
    expect(service.isUnlocked('FIRST_WIN')).toBe(true)
    await service.setActiveSave('career-b')
    expect(service.isUnlocked('FIRST_WIN')).toBe(false)
    await service.setActiveSave('career-a')
    expect(service.isUnlocked('FIRST_WIN')).toBe(true)
    expect(await service.unlockAchievement('constructor')).toBe(false)
})
test('rejected achievements retry for the same account without duplicate notifications', async () => {
    let accepted = false
    const setAchievement = jest.fn(async () => accepted)
    const onUnlock = jest.fn()
    const { service } = renderer({ getSteamId: async () => '123', isAchievementUnlocked: async () => accepted, setAchievement })
    await service.initialize(onUnlock)
    expect(await service.unlockAchievement('FIRST_WIN')).toBe(false)
    expect(service.isUnlocked('FIRST_WIN')).toBe(true)
    accepted = true
    await service.setActiveSave('career')
    expect(setAchievement).toHaveBeenCalledTimes(2)
    expect(onUnlock).toHaveBeenCalledTimes(1)
})
test('pending achievement queues do not transfer to a different Steam account', async () => {
    let account = '123'
    const setAchievement = jest.fn(async () => false)
    const { service } = renderer({ getSteamId: async () => account, isAchievementUnlocked: async () => false, setAchievement })
    await service.initialize()
    await service.unlockAchievement('FIRST_WIN')
    account = '456'
    await service.setActiveSave('career')
    expect(service.isUnlocked('FIRST_WIN')).toBe(false)
    expect(setAchievement).toHaveBeenCalledTimes(1)
})
test('concurrent unlock checks coalesce into one native attempt', async () => {
    const setAchievement = jest.fn(async () => false)
    const { service } = renderer({ getSteamId: async () => '123', isAchievementUnlocked: async () => false, setAchievement })
    await service.initialize()
    await Promise.all([service.unlockAchievement('FIRST_WIN'), service.unlockAchievement('FIRST_WIN')])
    expect(setAchievement).toHaveBeenCalledTimes(1)
})


test('Cloud rejects unseen remote changes and retains the preceding bytes before an observed replacement', async () => {
    let remote = 'original'
    const writeFile = jest.fn((_file: string, value: string) => { remote = value; return true })
    const h = loadHandlers({ directory, steamClient: { localplayer: { getName: () => 'Fixture', getSteamId: () => '123' }, cloud: { fileExists: () => true, readFile: () => remote, writeFile } } })
    expect(await h.invoke('steam-cloud-write', 'save_fixture.json', 'local')).toBe(false)
    expect(remote).toBe('original')
    expect(await h.invoke('steam-cloud-read', 'save_fixture.json')).toBe('original')
    remote = 'second-device'
    expect(await h.invoke('steam-cloud-write', 'save_fixture.json', 'local')).toBe(false)
    expect(remote).toBe('second-device')
    expect(await h.invoke('steam-cloud-read', 'save_fixture.json')).toBe('second-device')
    expect(await h.invoke('steam-cloud-write', 'save_fixture.json', 'chosen-local')).toBe(true)
    expect(fs.readFileSync(path.join(directory, 'steam-cloud-recovery/123/save_fixture.json'), 'utf8')).toBe('second-device')
    expect(remote).toBe('chosen-local')
    expect(writeFile).toHaveBeenCalledTimes(1)
})
