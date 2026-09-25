// Isolated integration fixture, bundled only by save-recovery-native.cjs, never by Next.
import { SaveManager } from '../../engine/save-manager'
import { LocalStorageAdapter, IndexedDBAdapter, ElectronStorageAdapter, type AsyncStorage } from '../../engine/storage-adapter'
import { createDefaultTactics } from '../../engine/default-tactics'
import { STORAGE_KEYS } from '../../engine/save-types'

declare global { interface Window { recoveryQA: { fault: (on: boolean) => Promise<void> } } }
const check = (value: unknown, message: string) => { if (!value) throw new Error(message) }
const params = new URLSearchParams(location.search)
const mode = params.get('mode')!
const readOnly = params.has('read')
const local = new LocalStorageAdapter()
const storage: AsyncStorage = mode === 'disk' ? new ElectronStorageAdapter(local) : mode === 'idb' ? new IndexedDBAdapter(local) : local
const sm = new SaveManager(storage)
const saveId = `save_l03_${mode}`
const key = STORAGE_KEYS.SAVE_PREFIX + saveId
async function run() {
    const checks: string[] = []
    if (readOnly) {
        const loaded = await sm.loadGame(saveId)
        check(loaded.save?.currentWeek === 3, `${mode} fresh process lost last-good week`)
        check(loaded.save?.customTactics?.FULL.ct.primaryWeaponId === 'qa-custom', 'custom loadout lost')
        check(loaded.save?.lastCommittedWeekTick === 2, 'committed tick marker lost')
        check(loaded.save?.watchlistedPlayerIds?.[0] === 'qa-prospect', 'watchlist lost')
        check(loaded.save?.activeMatchState?.timeoutsRemaining === 0, 'live-match timeout checkpoint lost')
        check(await storage.getItem('esports-sim-storage') === mode, 'career bootstrap key lost')
        return ['fresh-process durable reload: week, custom tactic, committed tick, watchlist, live-match checkpoint']
    }
    const save = sm.createSave('Isolated L03 QA', {
        playerTeamId: 'qa', teams: [{ id: 'qa', name: 'QA', budget: 100000, rosterIds: [], trophies: [], facilities: [], sponsors: [], fanbase: 1 } as any], players: [],
    })
    save.saveId = saveId
    await storage.setItem('esports-sim-storage', mode)
    save.customTactics = createDefaultTactics()
    save.customTactics.FULL.ct.primaryWeaponId = 'qa-custom'
    save.watchlistedPlayerIds = ['qa-prospect']
    save.activeMatchId = 'qa-match'
    save.activeMatchState = {
        matchId: 'qa-match', gameState: {}, simState: { currentRound: 12 }, homeRoster: [], awayRoster: [], logs: [],
        originalHomePlayers: [], originalAwayPlayers: [], matchResult: {}, roundTime: 60, bombTime: 0,
        isBombPlanted: false, isWaitingForStrategy: true, timeoutsRemaining: 0,
    } as any
    check((await sm.saveGame(save)).success, `${mode} initial write rejected`)
    const good = await storage.getItem(key)
    check(!!good, 'initial primary missing')
    if (mode === 'disk') await window.recoveryQA.fault(true)
    const originalPut = IDBObjectStore.prototype.put
    const originalSet = Storage.prototype.setItem
    if (mode === 'idb') IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        const request = originalPut.apply(this, args)
        // Abort after request success, before transaction commit: the original adapter falsely passed.
        request.addEventListener('success', () => this.transaction.abort(), { once: true })
        return request
    }
    if (mode === 'local') Storage.prototype.setItem = function () { throw new DOMException('Synthetic full disk', 'QuotaExceededError') }
    try {
        const failed = await sm.saveGame({ ...save, currentWeek: 2 })
        check(!failed.success, `${mode} failed write reported success`)
    } finally {
        IDBObjectStore.prototype.put = originalPut
        Storage.prototype.setItem = originalSet
        if (mode === 'disk') await window.recoveryQA.fault(false)
    }
    check(await storage.getItem(key) === good, `${mode} fault damaged primary`)
    checks.push('real adapter fault rejects; last-good bytes unchanged')
    check((await sm.saveGame({ ...save, currentWeek: 2 })).success, 'retry failed')
    await storage.setItem(key, '{corrupt')
    const recovered = await sm.loadGame(saveId)
    check(recovered.restoredFromBackup && recovered.save?.currentWeek === 1, 'backup recovery failed')
    checks.push('corrupted primary restored from validated backup')
    await storage.setItem(key + '.tmp', '{interrupted')
    check((await sm.loadGame(saveId)).save?.currentWeek === 1, 'staging damaged primary')
    check(await storage.getItem(key + '.tmp') === null, 'staging not cleaned')
    checks.push('interrupted staging discarded; primary intact')
    const duplicate = await Promise.all([sm.saveGame({ ...save, currentWeek: 2 }), sm.saveGame({ ...save, currentWeek: 3, lastCommittedWeekTick: 2 })])
    check(duplicate.every(r => r.success), 'duplicate save failed')
    check((await sm.loadGame(saveId)).save?.currentWeek === 3, 'queued saves out of order')
    checks.push('duplicate saves serialize; successful retry remains durable')
    return checks
}
run().then(checks => fetch('/report', { method: 'POST', body: JSON.stringify({ mode, passed: true, checks }) }))
    .catch(error => fetch('/report', { method: 'POST', body: JSON.stringify({ mode, passed: false, error: String(error) }) }))
