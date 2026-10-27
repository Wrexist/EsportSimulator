import { WORKLOAD_TUNING, injuryRiskPerWeek, needsWorkloadWarning, workloadOf } from '@/engine/workload'
import { applyChoiceEffects, type ChoiceTarget } from '@/engine/event-choice'
import { EventProcessor } from '@/engine/processors/event-processor'
import { SeededRNG } from '@/engine/rng'
import type { GameSave, PlayerSaveData, TeamSaveData } from '@/engine/save-types'

const player = (id: string, over: Partial<PlayerSaveData> = {}): PlayerSaveData => ({
    id, nickname: id, fatigue: 0, health: 100, age: 22, morale: 50, form: 50, loyalty: 50, ...over,
} as unknown as PlayerSaveData)

describe('C5: workload and injury risk', () => {
    it('matches the original weekly roll', () => {
        // fatigue 80, health 100, age 22: (0.002 + 30 * 0.002) * 0.5 * 0.2
        expect(injuryRiskPerWeek(player('a', { fatigue: 80 }))).toBeCloseTo(0.0062, 6)
        expect(injuryRiskPerWeek(player('a', { fatigue: 20 }))).toBeCloseTo(0.0002, 6)
        expect(injuryRiskPerWeek(player('a', { fatigue: 80, injury: { severity: 'MINOR' } as never }))).toBe(0)
    })

    it('bands the load and warns from the stated risk', () => {
        expect(workloadOf(player('a', { fatigue: 10 })).band).toBe('FRESH')
        expect(workloadOf(player('a', { fatigue: 50 })).band).toBe('NORMAL')
        expect(workloadOf(player('a', { fatigue: 65 })).band).toBe('HIGH')
        expect(workloadOf(player('a', { fatigue: 90 })).band).toBe('OVERLOADED')
        expect(needsWorkloadWarning(player('a', { fatigue: 60 }))).toBe(false)
        expect(needsWorkloadWarning(player('a', { fatigue: 80 }))).toBe(true)
    })

    const target = (players: PlayerSaveData[]): ChoiceTarget => ({
        currentWeek: 10, playerTeamId: 't',
        teams: [{ id: 't', rosterIds: players.map(p => p.id), budget: 0 } as unknown as TeamSaveData],
        players, financeLedger: [],
    })

    it('rest takes the load off and benches him for a fit substitute', () => {
        const ps = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => player(id, { fatigue: id === 'a' ? 85 : 20 }))
        const t = target(ps)
        const ok = applyChoiceEffects(t, { id: 'workload_a_10', type: 'INJURY', week: 10, data: { playerId: 'a' }, acknowledged: false } as never,
            { rest: { fatigue: WORKLOAD_TUNING.REST_FATIGUE, morale: 3 } }, { id: () => 'x', description: 'rest' })
        expect(ok).toBe(true)
        expect(ps[0].fatigue).toBe(85 - WORKLOAD_TUNING.REST_FATIGUE)
        expect(t.teams[0].rosterIds.indexOf('a')).toBe(5)
    })

    it('playing through a knock clears it, costs form and can worsen next week', () => {
        const a = player('a', { injury: { type: 'RSI', name: 'Wrist Strain', description: '', severity: 'MINOR', weeksRemaining: 2, isRecovering: true } })
        const t = target([a])
        applyChoiceEffects(t, { id: 'knock_a_10', type: 'INJURY', week: 10, data: { playerId: 'a' }, acknowledged: false } as never,
            { playThrough: { escalateChance: 1, form: -5 } }, { id: () => 'x', description: 'knock' })
        expect(a.injury).toBeUndefined()
        expect(a.form).toBe(45)
        expect(a.knock?.name).toBe('Wrist Strain')

        const save = { currentWeek: 11, playerTeamId: 't', teams: t.teams, players: [a], eventsLog: [], newsFeed: [] } as unknown as GameSave
        EventProcessor.processInjuryChecks(save, new SeededRNG(1))
        expect(a.knock).toBeUndefined()
        expect(a.injury?.severity).toBe('MODERATE')
        expect(a.injury?.name).toMatch(/worsened/)
    })

    it('turns a minor knock at the managed club into a decision', () => {
        // Overloaded squad so the roll hits within a few seeds.
        for (let seed = 1; seed < 400; seed++) {
            const ps = ['a', 'b', 'c', 'd', 'e'].map(id => player(id, { fatigue: 100, health: 0, age: 36 }))
            const save = { currentWeek: 5, playerTeamId: 't', teams: [{ id: 't', rosterIds: ps.map(p => p.id) }], players: ps, eventsLog: [], newsFeed: [] } as unknown as GameSave
            EventProcessor.processInjuryChecks(save, new SeededRNG(seed))
            const knock = save.eventsLog.find(e => e.id.startsWith('knock_'))
            if (knock) {
                expect(knock.choices?.map(c => c.id)).toEqual(['rest', 'play_through'])
                return
            }
        }
        throw new Error('no minor knock rolled')
    })

    it('warns after rest days, with the risk stated on the play answer', async () => {
        const save = {
            currentWeek: 5, eventsLog: [],
            teams: [{ id: 't', rosterIds: ['tired', 'fresh'] } as unknown as TeamSaveData],
            players: [player('tired', { fatigue: 95 }), player('fresh', { fatigue: 10 })],
        } as unknown as GameSave
        const tx = { generatedEventIds: [] as string[] }
        const saveManager = { recordEventGenerated: async (t: typeof tx, id: string) => { t.generatedEventIds.push(id) } }
        const n = await EventProcessor.generateWorkloadWarnings(save, tx as never, 't', saveManager as never)
        expect(n).toBe(1)
        expect(save.eventsLog[0].id).toBe('workload_tired_5')
        expect(save.eventsLog[0].choices?.find(c => c.id === 'play')?.effects.follows).toMatch(/^Injury chance .+% this week$/)
        // Resumed week: no duplicate.
        expect(await EventProcessor.generateWorkloadWarnings(save, tx as never, 't', saveManager as never)).toBe(0)
    })
})
