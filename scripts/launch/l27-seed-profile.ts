/**
 * L27: write one career into an ISOLATED Electron profile directory using the
 * packaged app's own disk layout (electron/game-storage.js) and SaveManager
 * signing, and point the persisted session at it so the app offers it on
 * launch. Never touches the real %APPDATA% profile.
 *
 *   npx tsx scripts/launch/l27-seed-profile.ts --profile=tmp/l27/pkg/<run>/profile --save=tmp/l27/x.json.gz
 *   npx tsx scripts/launch/l27-seed-profile.ts --profile=... --fresh        (new career, week 1)
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const root = process.cwd()
const arg = (key: string, fallback: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const profile = path.resolve(root, arg('profile', ''))
if (!profile.startsWith(path.join(root, 'tmp'))) throw Error('Profile must live under tmp/')

async function main() {
    const { SaveManager } = await import('../../engine/save-manager')
    type GameSave = import('../../engine/save-types').GameSave
    const { createGameStorage } = require(path.join(root, 'electron/game-storage.js'))
    fs.mkdirSync(profile, { recursive: true })
    const isStorageKey = (v: string) => v === 'cs2_manager_career_profile' || v === 'esports-sim-storage' || /^esports_[a-zA-Z0-9_-]{1,230}$/.test(v) || /^esports_save_[a-zA-Z0-9_-]{1,220}\.tmp$/.test(v)
    const disk = createGameStorage({ root: profile, isStorageKey, maxValueBytes: 32 * 1024 * 1024 })
    const adapter = {
        async getItem(k: string) { return disk.getItem(k) as string | null },
        async setItem(k: string, v: string) { if (Buffer.byteLength(v) > 32 * 1024 * 1024) throw Error(`Value for ${k} exceeds the 32 MiB IPC/disk limit`); if (disk.setItem(k, v) !== true) throw Error('disk write failed') },
        async removeItem(k: string) { disk.removeItem(k) },
        async clear() { disk.clear() },
        async getAllKeys() { return disk.getAllKeys() as string[] },
    }
    let save: GameSave
    if (process.argv.includes('--fresh')) {
        const { useGameStore } = await import('../../store/game-store')
        const { snapshotLoader } = await import('../../data')
        const { buildSaveSnapshot } = await import('../../store/utils/build-save-snapshot')
        ;(snapshotLoader as unknown as { snapshotPath: string }).snapshotPath = path.join(root, 'public/data/snapshot')
        const loaded = await snapshotLoader.loadSnapshot()
        if (!loaded.success) throw Error(loaded.error)
        const ranked = [...snapshotLoader.getSnapshot()!.teams].filter(t => t.rosterIds.length >= 5).sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
        await useGameStore.getState().initializeNewGame('L27 packaged', ranked[7].id)
        save = structuredClone(buildSaveSnapshot(useGameStore.getState() as never)) as GameSave
    } else {
        save = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(root, arg('save', '')))).toString('utf8'))
    }
    // Declared fixture edits: guide dismissed (no overlay intercepts keys), weekly time mode.
    save.firstSession = { version: 2, status: 'dismissed', reviewed: [] } as GameSave['firstSession']
    save.timeMode = 'WEEKLY'
    save.currentDay = 6
    // Pending one-shot modals from the source career (trophy, legend pick, recap) are cleared.
    const pending = save as unknown as Record<string, unknown>
    pending.pendingCelebration = null; pending.pendingLegendPick = null; pending.pendingSeasonRecap = null
    const manager = new SaveManager(adapter)
    const written = await manager.saveGame(save)
    if (!written.success) throw Error(`seed save failed: ${written.error}`)
    await adapter.setItem('esports-sim-storage', JSON.stringify({ state: { saveId: save.saveId, onboardingCompleted: true, tutorialCompleted: true, showTutorialOnNewGame: false, manualTutorialTrigger: 0, soundEnabled: false, masterVolume: 0, musicVolume: 0 }, version: 0 }))
    const primary = await adapter.getItem(`esports_save_${save.saveId}`)
    console.log(JSON.stringify({ profile, saveId: save.saveId, week: save.currentWeek, players: save.players.length, primaryBytes: primary ? Buffer.byteLength(primary) : 0 }))
    process.exit(0)
}
main().catch(error => { console.error(error); process.exit(1) })
