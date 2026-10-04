/**
 * L27 (Oct 2026) behaviour-preservation checks for the week-tick / save
 * optimizations: single serialization of signed saves, FPL history compaction,
 * bridge input ownership, and role-filtered free-agent quoting.
 */
import { serializeSignedSave, saveTextFingerprint, fnv1a64Utf16, SaveManager } from '@/engine/save-manager'
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
    const flip = (text: string, i: number) => text.slice(0, i) + (text[i] === 'q' ? 'r' : 'q') + text.slice(i + 1)
    // The replaced sampler hashed the first/last 64 KiB and every 31st char between.
    const oldSamplerSkipped = (n: number) => [65537, 65536 + 15, Math.floor(n / 2) + 7, n - 65536 - 2].filter(i => (i - 65536) % 31 !== 0)

    test('identical text matches; uses SHA-256 and includes the exact length', async () => {
        const text = big(40000)
        const fp = await saveTextFingerprint(text)
        expect(fp).toBe(await saveTextFingerprint(text.slice(0)))
        expect(fp).toMatch(new RegExp(`^${text.length}:sha256u16:[0-9a-f]{64}$`))
        expect(await saveTextFingerprint(text.slice(0, -1))).not.toBe(fp)
        expect(await saveTextFingerprint('')).toBe(await saveTextFingerprint(''))
    })
    test('a single-character change at every position of a save text is detected', async () => {
        const text = big(100).slice(0, 1500)
        const fp = await saveTextFingerprint(text)
        const seen = new Set([fp])
        for (let i = 0; i < text.length; i++) seen.add(await saveTextFingerprint(flip(text, i)))
        expect(seen.size).toBe(text.length + 1)
    }, 60000)
    test('a single-character change where the old sampler never looked, or at a chunk boundary, is detected', async () => {
        const text = big(70000)
        expect(text.length).toBeGreaterThan((1 << 20) + 2)
        const fp = await saveTextFingerprint(text)
        const positions = [...oldSamplerSkipped(text.length), (1 << 20) - 1, 1 << 20, (1 << 20) + 1, text.length - 1]
        expect(positions.length).toBeGreaterThanOrEqual(3)
        for (const i of positions) expect(await saveTextFingerprint(flip(text, i))).not.toBe(fp)
    })
    test('full-length FNV-1a fallback: reference value, every position, lone surrogates', async () => {
        const reference = (s: string) => {
            let h = 0xcbf29ce484222325n
            for (let i = 0; i < s.length; i++) for (const b of [s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8]) h = ((h ^ BigInt(b)) * 0x100000001b3n) & 0xffffffffffffffffn
            return h.toString(16).padStart(16, '0')
        }
        for (const s of ['', 'a', 'save', '\u00e9\u4e2d\uFFFF', big(3)]) expect(fnv1a64Utf16(s)).toBe(reference(s))
        const text = big(100).slice(0, 1500)
        const seen = new Set([fnv1a64Utf16(text)])
        for (let i = 0; i < text.length; i++) seen.add(fnv1a64Utf16(flip(text, i)))
        expect(seen.size).toBe(text.length + 1)
        // Code units are hashed directly: a lone surrogate is not folded into U+FFFD.
        expect(await saveTextFingerprint('a\uD800b')).not.toBe(await saveTextFingerprint('a\uFFFDb'))
        expect(fnv1a64Utf16('a\uD800b')).not.toBe(fnv1a64Utf16('a\uFFFDb'))
        const subtle = globalThis.crypto.subtle
        Object.defineProperty(globalThis.crypto, 'subtle', { value: undefined, configurable: true })
        try {
            expect(await saveTextFingerprint(text)).toBe(`${text.length}:fnv64:${fnv1a64Utf16(text)}`)
        } finally {
            Object.defineProperty(globalThis.crypto, 'subtle', { value: subtle, configurable: true })
        }
    }, 60000)
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
    test('a same-length one-character change to the primary (at a position the old sampler skipped) is re-validated before rotation', async () => {
        const store = new Map<string, string>()
        const storage = { getItem: async (k: string) => store.get(k) ?? null, setItem: async (k: string, v: string) => { store.set(k, v) }, removeItem: async (k: string) => { store.delete(k) }, clear: async () => store.clear(), getAllKeys: async () => [...store.keys()] }
        const manager = new SaveManager(storage)
        const save = createLaunchFixture('first-week', 27104)
        // Grow the save past 2 x 64 KiB so the old sampler would have had unsampled positions.
        while (JSON.stringify(save).length < 4 * 65536) save.players.push(...structuredClone(save.players).map((p, k) => ({ ...p, id: `${p.id}_pad${save.players.length + k}`, teamId: null as unknown as string })))
        expect((await manager.saveGame(save)).success).toBe(true)
        const primaryKey = [...store.keys()].find(k => k.endsWith(save.saveId) && !k.includes('backup'))!
        const good = store.get(primaryKey)!
        expect(good.length).toBeGreaterThan(3 * 65536)
        // Change one digit inside the body: same length, still valid JSON, wrong integrity hash.
        let i = (65536 + Math.floor((good.length - 2 * 65536) / 2)) | 0
        while (!/[0-9]/.test(good[i]) || (i - 65536) % 31 === 0) i++
        const damaged = good.slice(0, i) + (good[i] === '1' ? '2' : '1') + good.slice(i + 1)
        expect(damaged.length).toBe(good.length)
        store.set(primaryKey, damaged)
        const parse = jest.spyOn(manager as unknown as { parseAndValidateSaveCandidate: () => unknown }, 'parseAndValidateSaveCandidate')
        save.currentDay = (save.currentDay ?? 0) + 1
        expect((await manager.saveGame(save)).success).toBe(true)
        expect(parse).toHaveBeenCalledTimes(1)
        expect([...store].some(([k, v]) => k.includes('backup') && k.endsWith('_1') && v === damaged)).toBe(false)
        expect([...store].some(([k, v]) => /corrupt/i.test(k) && v === damaged)).toBe(true)
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
