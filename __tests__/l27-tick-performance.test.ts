/**
 * L27 (Oct 2026) behaviour-preservation checks for the week-tick / save
 * optimizations: single serialization of signed saves, FPL history compaction,
 * bridge input ownership, and role-filtered free-agent quoting.
 */
import { serializeSignedSave, saveTextFingerprint, SaveManager } from '@/engine/save-manager'
import { SaveIntegrityManager } from '@/engine/save-integrity'
import { compactPersistentState } from '@/engine/processors/save-compactor'
import { ARRAY_CAPS } from '@/lib/constants'
import { WeekProcessorBridge } from '@/engine/worker/week-processor-client'
import { computeWeek } from '@/engine/worker/compute-week'
import { SeededRNG } from '@/engine/rng'
import { signFreeAgent, scoreSigningCandidate } from '@/engine/ai/roster-management'
import * as recruitment from '@/engine/recruitment'
import { createLaunchFixture } from '../scripts/launch/fixtures'
import type { GameSave } from '@/engine/save-types'

jest.mock('@/engine/worker/compute-week', () => ({ computeWeek: jest.fn() }))

describe('signed save text', () => {
    const memory = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, clear: async () => {}, getAllKeys: async () => [] }
    test('reusing the hashed payload yields exactly JSON.stringify(save)', async () => {
        const integrity = new SaveIntegrityManager(memory)
        const save = createLaunchFixture('first-week', 27101) as unknown as Record<string, unknown>
        delete save.integrityHash
        save.note = 'quotes " and \\ unicode é  '
        save.skipped = undefined
        const payload = integrity.serializeForIntegrity(save)
        save.integrityHash = await integrity.computeIntegrityHashFromPayload(payload)
        expect(serializeSignedSave(save, payload)).toBe(JSON.stringify(save))
        expect(save.integrityHash).toBe(await integrity.computeIntegrityHash(save))
    })
    test('an integrityHash key earlier in key order falls back to a full stringify', () => {
        const save: Record<string, unknown> = { integrityHash: 'old', a: 1, b: [1, 2] }
        const { integrityHash: _omit, ...rest } = save
        void _omit
        const payload = JSON.stringify(rest)
        save.integrityHash = 'v3:new'
        expect(serializeSignedSave(save, payload)).toBe(JSON.stringify(save))
        expect(serializeSignedSave({ integrityHash: 'v3:x' }, '{}')).toBe('{"integrityHash":"v3:x"}')
    })
})

describe('verified-primary fingerprint (L27.A3: no retained save text)', () => {
    const big = (n: number) => `{"saveId":"x"${',"p":"abcdefghij"'.repeat(n)},"integrityHash":"v3:1"}`
    test('identical text matches; length, head, tail and bulk damage do not', () => {
        const text = big(40000)
        expect(saveTextFingerprint(text)).toBe(saveTextFingerprint(text.slice(0)))
        expect(saveTextFingerprint(text.slice(0, -1))).not.toBe(saveTextFingerprint(text))
        expect(saveTextFingerprint(text.replace('"saveId":"x"', '"saveId":"y"'))).not.toBe(saveTextFingerprint(text))
        expect(saveTextFingerprint(text.replace('v3:1', 'v3:2'))).not.toBe(saveTextFingerprint(text))
        const mid = Math.floor(text.length / 2)
        expect(saveTextFingerprint(text.slice(0, mid) + 'Z'.repeat(64) + text.slice(mid + 64))).not.toBe(saveTextFingerprint(text))
        expect(saveTextFingerprint('')).toBe(saveTextFingerprint(''))
    })
    test('a save rotates its own verified primary without keeping the text, and still quarantines a foreign one', async () => {
        const store = new Map<string, string>()
        const storage = { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => { store.set(k, v) }, removeItem: async (k: string) => { store.delete(k) }, clear: async () => store.clear(), getAllKeys: async () => [...store.keys()] }
        const manager = new SaveManager(storage)
        const save = createLaunchFixture('first-week', 27103)
        expect((await manager.saveGame(save)).success).toBe(true)
        const primaryKey = [...store.keys()].find(k => k.endsWith(save.saveId) && !k.includes('backup'))!
        const first = store.get(primaryKey)!
        const held = (manager as unknown as { lastVerifiedPrimary: Record<string, unknown> }).lastVerifiedPrimary
        expect(Object.values(held).some(v => v === first)).toBe(false)
        const parse = jest.spyOn(manager as unknown as { parseAndValidateSaveCandidate: () => unknown }, 'parseAndValidateSaveCandidate')
        save.currentDay = (save.currentDay ?? 0) + 1
        expect((await manager.saveGame(save)).success).toBe(true)
        expect(parse).not.toHaveBeenCalled()
        expect([...store].some(([k, v]) => k.includes('backup') && k.endsWith('_1') && v === first)).toBe(true)
        // Someone else replaced the primary: it must be validated (and kept aside as corrupt).
        store.set(primaryKey, 'not a save')
        expect((await manager.saveGame(save)).success).toBe(true)
        expect(parse).toHaveBeenCalledTimes(1)
        expect([...store].some(([k, v]) => /corrupt/i.test(k) && v === 'not a save')).toBe(true)
        parse.mockRestore()
    })
})

describe('FPL match history compaction', () => {
    const withHistory = (n: number) => {
        const save = createLaunchFixture('first-week', 27102)
        save.fplData = { matchHistory: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, week: Math.floor(i / 28) + 1 })) } as unknown as GameSave['fplData']
        return save
    }
    test('keeps exactly the newest records once over the cap', () => {
        const save = withHistory(ARRAY_CAPS.fplMatchHistory + 137)
        const newest = save.fplData!.matchHistory.slice(-ARRAY_CAPS.fplMatchHistory)
        compactPersistentState(save)
        expect(save.fplData!.matchHistory).toEqual(newest)
        expect(save.fplData!.matchHistory[0]).toBe(newest[0])
    })
    test('leaves a history within the cap untouched', () => {
        const save = withHistory(ARRAY_CAPS.fplMatchHistory)
        const before = save.fplData!.matchHistory
        compactPersistentState(save)
        expect(save.fplData!.matchHistory).toBe(before)
    })
})

describe('week bridge input ownership', () => {
    const save = () => ({ saveId: 'owned', currentWeek: 1 } as GameSave)
    const config = () => ({ playerTeamId: 'team', trainingFocus: new Map() })
    beforeEach(() => jest.mocked(computeWeek).mockReset().mockImplementation(async input => ({ save: input, rngState: 9, result: { success: true } as Awaited<ReturnType<typeof computeWeek>>['result'] })))
    const bridge = () => new WeekProcessorBridge(() => { throw new Error('No Worker support') })
    test('an owned input is computed in place; the default still captures a copy', async () => {
        const owned = save()
        expect((await bridge().processWeek(owned, config(), new SeededRNG(1), { inputOwned: true })).save).toBe(owned)
        const shared = save()
        const copy = (await bridge().processWeek(shared, config(), new SeededRNG(1))).save
        expect(copy).not.toBe(shared)
        expect(copy).toEqual(shared)
    })
})

describe('role-filtered free-agent quotes', () => {
    test('a full-strength club missing roles quotes only eligible candidates and picks the same best one', () => {
        const save = createLaunchFixture('first-week', 27103)
        const team = save.teams[0]
        team.budget = 50_000_000
        const roster = team.rosterIds.slice(0, 5)
        team.rosterIds = [...roster]
        for (const id of roster) save.players.find(p => p.id === id)!.role = 'RIFLER' as never
        const template = save.players.find(p => p.id === roster[0])!
        for (let i = 0; i < 40; i++) save.players.push({ ...template, id: `l27_fa_${i}`, nickname: `FA ${i}`, skill: 40 + i, potential: 60 + i, role: (i % 2 ? 'RIFLER' : 'AWPER') as never })
        const owned = new Set(save.teams.flatMap(t => t.rosterIds))
        const contracted = new Set(save.contracts.filter(c => c.endWeek > save.currentWeek).map(c => c.playerId))
        const held = recruitment.academyHeldPlayerIds(save)
        const free = save.players.filter(p => !owned.has(p.id) && !p.isRetired && !contracted.has(p.id) && !held.has(p.id))
        const missing = new Set(['IGL', 'AWPER', 'ENTRY_FRAGGER', 'SUPPORT'])
        const eligible = free.filter(p => missing.has(recruitment.recruitmentRole(p.role)))
        const expected = [...eligible].sort((a, b) => scoreSigningCandidate(b, recruitment.recruitmentSalary(b, save.currentWeek), missing) - scoreSigningCandidate(a, recruitment.recruitmentSalary(a, save.currentWeek), missing))[0]
        const spy = jest.spyOn(recruitment, 'recruitmentSalary')
        try {
            signFreeAgent(team, save)
            const quoted = new Set(spy.mock.calls.map(([p]) => p.id))
            expect([...quoted].sort()).toEqual(eligible.map(p => p.id).sort())
            expect(team.rosterIds.at(-1)).toBe(expected.id)
        } finally { spy.mockRestore() }
    })
})
