/**
 * Regression tests for the approved balance tuning (E4 long-career campaign,
 * E5 L21 paired scenarios). One block per rule in lib/balance-tuning.ts.
 */
import { createLaunchFixture } from '../scripts/launch/fixtures'
import { CONDITION_TUNING, FREE_AGENT_TUNING, HALL_OF_FAME_TUNING, ROUND_ECONOMY_TUNING, SPONSOR_TUNING } from '@/lib/balance-tuning'
import { TrainingProcessor } from '@/engine/processors/training-processor'
import { PlayerLifecycleManager, applyFormResult, applyMoraleResult } from '@/engine/player-lifecycle'
import { SponsorGenerator, EconomyManager } from '@/engine/economy-manager'
import { EconomyEngine } from '@/engine/economy-engine'
import { SeededRNG } from '@/engine/rng'
import { recruitmentSalary, freeAgentWageFactor, buyerReputationFactor } from '@/engine/recruitment'
import { processFreeAgentMarket, freeAgentRetirementChance } from '@/engine/processors/free-agent-market'
import { applyAutoRegistration } from '@/engine/processors/auto-registration-processor'
import { hallOfFameAchievements, qualifiesForHallOfFame } from '@/engine/hall-of-fame-manager'
import { EventProcessor } from '@/engine/processors/event-processor'
import { getLossBonus } from '@/lib/constants'
import { AI_SQUAD_TUNING, sponsorWageBase } from '@/lib/balance-tuning'
import { renewExpiringContracts, upgradeFromFreeAgency, freeAgentsBySkill } from '@/engine/ai/squad-maintenance'
import { manageRoster, promoteAcademyToQuorum } from '@/engine/ai/roster-management'
import { AtomicWeekProcessor } from '@/engine/atomic-week-processor'
import { SaveManager } from '@/engine/save-manager'
import { FixtureStorage } from '../scripts/launch/fixtures'
import { TrainingFocus } from '@/types'
import { freeAgentPoolFactor, freeAgentScoutingFactor } from '@/engine/processors/free-agent-market'
import { SnapshotLoader as SnapshotLoaderClass } from '@/data/snapshot-loader'
import type { GameSave, PlayerSaveData, TournamentSaveData } from '@/engine/save-types'

const nextId = (_s: unknown, prefix: string, ...parts: Array<string | number | null | undefined>) => [prefix, ...parts].join('_')

describe('condition: recovery parity and real costs', () => {
    test('idle days recover every club identically and add no form or morale', () => {
        const save = createLaunchFixture('first-week', 41001)
        save.currentWeek = 5
        save.scheduledMatches = []
        save.completedMatches = []
        save.scheduledActivities = []
        for (const p of save.players) Object.assign(p, { energy: 40, fatigue: 50, form: 60, morale: 60 })
        TrainingProcessor.processRestDays(save, save.playerTeamId!)
        const managed = save.players.find(p => p.id === save.teams[0].rosterIds[0])!
        const ai = save.players.find(p => p.id === save.teams[1].rosterIds[0])!
        for (const p of [managed, ai]) {
            expect(p.form).toBe(60)
            expect(p.morale).toBe(60)
            expect(p.energy).toBe(100)
            expect(p.fatigue).toBeCloseTo(50 * (1 - CONDITION_TUNING.IDLE_DAY_FATIGUE_RECOVERY_RATE) ** 7, 6)
        }
        // The managed calendar rows are the exactly-once guard: a second pass changes nothing.
        const after = structuredClone(save.players)
        TrainingProcessor.processRestDays(save, save.playerTeamId!)
        expect(save.players.find(p => p.id === managed.id)).toEqual(after.find(p => p.id === managed.id))
        expect(save.scheduledActivities.filter(a => a.type === 'REST')).toHaveLength(7)
    })

    test('match days are not idle days for AI clubs either', () => {
        const save = createLaunchFixture('first-week', 41002)
        save.currentWeek = 5
        save.scheduledActivities = []
        save.scheduledMatches = []
        save.completedMatches = [0, 2, 4].map(day => ({ ...structuredClone(createLaunchFixture('first-week').scheduledMatches[0]), id: `m${day}`, week: 4, day, homeTeamId: save.teams[1].id, awayTeamId: save.teams[2].id })) as never
        for (const p of save.players) Object.assign(p, { energy: 0, fatigue: 0 })
        TrainingProcessor.processRestDays(save, save.playerTeamId!)
        const ai = save.players.find(p => p.id === save.teams[1].rosterIds[0])!
        const managed = save.players.find(p => p.id === save.teams[0].rosterIds[0])!
        expect(ai.energy).toBe(4 * CONDITION_TUNING.IDLE_DAY_ENERGY)
        expect(managed.energy).toBe(100)
    })

    test('form follows results and fatigue lowers the weekly drift target', () => {
        expect(applyFormResult(50, true)).toBe(50 + CONDITION_TUNING.FORM_PER_WIN)
        expect(applyFormResult(50, false)).toBe(50 + CONDITION_TUNING.FORM_PER_LOSS)
        expect(applyFormResult(99, true)).toBe(100)
        // Morale gains shrink near the cap; losses apply in full.
        expect(applyMoraleResult(40, 15)).toBe(55)
        expect(applyMoraleResult(75, 15)).toBe(83)
        expect(applyMoraleResult(98, 15)).toBe(99)
        expect(applyMoraleResult(98, -3)).toBe(95)
        const fresh = { age: 25, fatigue: 0, energy: 100, maxEnergy: 100, morale: 50, form: 50, reaction: 50, skill: 50, rifle: 50, clutch: 50 }
        const tired = { ...fresh, fatigue: 80 }
        PlayerLifecycleManager.processWeeklyUpdates(fresh, 2025, 10, 0, new SeededRNG(1))
        PlayerLifecycleManager.processWeeklyUpdates(tired, 2025, 10, 0, new SeededRNG(1))
        expect(fresh.form).toBe(50)
        expect(tired.form).toBeLessThan(50)
        expect(tired.morale).toBeLessThan(50)
    })
})

describe('sponsors scale with reputation and the wage bill', () => {
    test('no offer pays more than its share of the wage bill', () => {
        const save = createLaunchFixture('first-week', 41003)
        const team = { ...save.teams[0], reputation: 100 }
        for (const wageBill of [0, 20_000, 60_000, 150_000, 1_000_000]) {
            const offers = SponsorGenerator.generateVariedOffers(team, 10, new SeededRNG(7), wageBill)
            const cap = SPONSOR_TUNING.MAX_SHARE_OF_WAGE_BILL * sponsorWageBase(wageBill, 100)
            for (const o of offers) expect(o.weeklyPayout * EconomyEngine.sponsorReputationFactor(100)).toBeLessThanOrEqual(cap + 1)
        }
        // Absolute ceiling: top reputation, best tier, betting premium.
        const uncapped = SponsorGenerator.generateVariedOffers(team, 10, new SeededRNG(7), 10_000_000)
        for (const o of uncapped) expect(o.weeklyPayout).toBeLessThanOrEqual(SPONSOR_TUNING.BASE_RANGE_REP_80[1] * SPONSOR_TUNING.ELITE_MULTIPLIER * 1.3)
    })

    test('three capped sponsors cannot out-earn the wage bill, and offers stay deterministic', () => {
        const save = createLaunchFixture('first-week', 41004)
        const team = { ...save.teams[0], reputation: 100 }
        const wage = 250_000
        const a = SponsorGenerator.generateVariedOffers(team, 10, new SeededRNG(9), wage)
        expect(SponsorGenerator.generateVariedOffers(team, 10, new SeededRNG(9), wage)).toEqual(a)
        const best3 = [...a].sort((x, y) => y.weeklyPayout - x.weeklyPayout).slice(0, 3)
        const income = EconomyEngine.calculateSponsorIncome({ ...team, sponsors: best3 })
        expect(income).toBeLessThanOrEqual(wage * 1.03)
        // A low-reputation club keeps ordinary offers (the wage floor protects lean payrolls).
        const small = SponsorGenerator.generateVariedOffers({ ...team, reputation: 20 }, 10, new SeededRNG(9), 3_000)
        expect(small.every(o => o.weeklyPayout >= SPONSOR_TUNING.BASE_RANGE_LOW[0])).toBe(true)
    })
})

describe('free-agent market', () => {
    const player = () => createLaunchFixture('first-week', 41005).players.find(p => p.id === 'qa_free_agent')! as PlayerSaveData

    test('asking wage decays with time unsigned down to a floor, and scales with buyer reputation', () => {
        const p = player()
        const full = recruitmentSalary(p, 100)
        p.freeAgentSinceWeek = 100
        expect(recruitmentSalary(p, 100)).toBe(full)
        expect(recruitmentSalary(p, 110)).toBeLessThan(full)
        expect(freeAgentWageFactor(p, 100 + 1000)).toBe(FREE_AGENT_TUNING.WAGE_DECAY_FLOOR)
        expect(buyerReputationFactor({ reputation: 100 })).toBe(1)
        expect(buyerReputationFactor({ reputation: 0 })).toBe(FREE_AGENT_TUNING.BUYER_REPUTATION_MIN_FACTOR)
        expect(recruitmentSalary(p, 100, { reputation: 10 })).toBeLessThan(recruitmentSalary(p, 100, { reputation: 90 }))
        expect(recruitmentSalary(p, 100000, { reputation: 0 })).toBeGreaterThanOrEqual(200)
    })

    test('the clock starts unsigned, clears on signing, and long-unsigned players retire deterministically', () => {
        const run = () => {
            const save = createLaunchFixture('first-week', 41006)
            const extra = Array.from({ length: 200 }, (_, i) => ({ ...structuredClone(save.players.find(p => p.id === 'qa_free_agent')!), id: `fa_${i}`, age: 20 + (i % 15) }))
            save.players.push(...extra)
            save.players.push({ ...structuredClone(extra[0]), id: 'fa_legend', isLegendary: true }, { ...structuredClone(extra[0]), id: 'fpl_nonpro_1_1_1' })
            save.currentWeek = 10
            processFreeAgentMarket(save)
            expect(save.players.find(p => p.id === 'fa_0')!.freeAgentSinceWeek).toBe(10)
            expect(save.players.find(p => p.id === save.teams[0].rosterIds[0])!.freeAgentSinceWeek).toBeUndefined()
            const retiredByWeek: Record<number, number> = {}
            for (let w = 11; w <= 10 + 104; w++) {
                save.currentWeek = w
                const { retired } = processFreeAgentMarket(save)
                retiredByWeek[w] = retired.length
            }
            return { save, retiredByWeek }
        }
        const a = run(), b = run()
        expect(b.retiredByWeek).toEqual(a.retiredByWeek)
        for (let w = 11; w < 10 + FREE_AGENT_TUNING.RETIRE_GRACE_MIN_WEEKS; w++) expect(a.retiredByWeek[w]).toBe(0)
        // Full grace at a normal pool size; an oversized pool shortens it.
        expect(freeAgentRetirementChance(24, FREE_AGENT_TUNING.RETIRE_GRACE_WEEKS - 1, 1)).toBe(0)
        expect(freeAgentRetirementChance(24, FREE_AGENT_TUNING.RETIRE_GRACE_WEEKS - 1, 4)).toBeGreaterThan(0)
        const retired = a.save.players.filter(p => p.isRetired)
        expect(retired.length).toBeGreaterThan(50)
        expect(retired.length).toBeLessThan(200)
        expect(a.save.players.find(p => p.id === 'fa_legend')!.isRetired).toBeFalsy()
        expect(a.save.players.find(p => p.id === 'fpl_nonpro_1_1_1')!.isRetired).toBeFalsy()
        expect(freeAgentRetirementChance(30, 52)).toBeGreaterThan(freeAgentRetirementChance(24, 52))
        expect(freeAgentRetirementChance(18, 52)).toBeLessThan(freeAgentRetirementChance(24, 52))

        // Signing clears the clock.
        const save = a.save
        const fa = save.players.find(p => !p.isRetired && p.freeAgentSinceWeek !== undefined)!
        save.teams[1].rosterIds.push(fa.id)
        save.contracts.push({ playerId: fa.id, teamId: save.teams[1].id, salaryPerWeek: 500, startWeek: save.currentWeek, endWeek: save.currentWeek + 52, buyout: 0 })
        processFreeAgentMarket(save)
        expect(fa.freeAgentSinceWeek).toBeUndefined()
    })
})

describe('AI squad maintenance uses the human rules', () => {
    test('AI clubs renew expiring keepers on the Renew-button terms when affordable', () => {
        const save = createLaunchFixture('first-week', 41009)
        save.currentWeek = 100
        const team = save.teams[1]
        team.budget = 1_000_000
        const c = save.contracts.find(x => x.teamId === team.id)!
        c.endWeek = 102
        c.salaryPerWeek = 1000
        const players = new Map(save.players.map(p => [p.id, p]))
        expect(renewExpiringContracts(team, save, players)).toBe(1)
        expect(c).toMatchObject({ salaryPerWeek: Math.round(1000 * AI_SQUAD_TUNING.RENEWAL_SALARY_MULTIPLIER), endWeek: 102 + AI_SQUAD_TUNING.RENEWAL_EXTENSION_WEEKS })
        // Not affordable: no runway for the raise.
        const poor = createLaunchFixture('first-week', 41009)
        poor.currentWeek = 100
        poor.teams[1].budget = 0
        const pc = poor.contracts.find(x => x.teamId === poor.teams[1].id)!
        pc.endWeek = 102
        expect(renewExpiringContracts(poor.teams[1], poor, new Map(poor.players.map(p => [p.id, p])))).toBe(0)
        expect(pc.endWeek).toBe(102)
    })

    test('an indebted AI club below five can still sign a cheap free agent (quorum allowance)', () => {
        const save = createLaunchFixture('first-week', 41011)
        const team = save.teams[1]
        team.budget = -500_000
        const gone = team.rosterIds.pop()!
        save.contracts = save.contracts.filter(c => c.playerId !== gone)
        save.players.find(p => p.id === gone)!.isRetired = true
        const fa = save.players.find(p => p.id === 'qa_free_agent')!
        Object.assign(fa, { skill: 40, potential: 45, age: 30, rifle: 40, awp: 40 })
        fa.freeAgentSinceWeek = save.currentWeek - 100 // long unsigned: ask at the decay floor
        expect(recruitmentSalary(fa, save.currentWeek, team)).toBeLessThanOrEqual(FREE_AGENT_TUNING.QUORUM_WAGE_ALLOWANCE)
        manageRoster(team, save)
        expect(team.rosterIds).toContain(fa.id)
    })

    test('AI clubs sign a clearly better affordable free agent into the starting five', () => {
        const save = createLaunchFixture('first-week', 41010)
        const team = save.teams[1]
        team.budget = 5_000_000
        team.financialState = 'STABLE'
        for (const id of team.rosterIds) save.players.find(p => p.id === id)!.skill = 50
        const star = save.players.find(p => p.id === 'qa_free_agent')!
        star.skill = 80
        const players = new Map(save.players.map(p => [p.id, p]))
        let signed = null
        for (let w = 1; w <= AI_SQUAD_TUNING.UPGRADE_EVERY_WEEKS && !signed; w++) {
            save.currentWeek = w
            signed = upgradeFromFreeAgency(team, save, freeAgentsBySkill(save), players)
        }
        expect(signed?.id).toBe(star.id)
        expect(team.rosterIds.slice(0, 5)).toContain(star.id)
        expect(team.rosterIds).toHaveLength(6)
        expect(save.contracts.some(c => c.playerId === star.id && c.teamId === team.id)).toBe(true)
    })
})

describe('automatic entry to open qualifiers', () => {
    function withQualifiers(): GameSave {
        const save = createLaunchFixture('first-week', 41007)
        save.currentWeek = 8
        const mk = (series: string): TournamentSaveData => ({ id: `${series}_s1`, seriesId: series, name: series, tier: 'QUALIFIER', startWeek: 11, endWeek: 12, seasonNumber: 1, teamIds: [], isCompleted: false } as unknown as TournamentSaveData)
        save.tournaments = [mk('copenhagen_rmr_na'), mk('copenhagen_rmr_eu'), mk('iem_katowice_closed_eu')]
        save.tournaments[2].startWeek = 9
        return save
    }

    test('an eligible club is entered in exactly one open qualifier per main event', () => {
        const save = withQualifiers()
        applyAutoRegistration(save, { playerTeamId: save.playerTeamId!, nextId })
        const regs = save.tournamentQualifications.filter(q => q.teamId === save.playerTeamId)
        expect(regs.map(q => q.tournamentId).filter(id => id.includes('rmr'))).toHaveLength(1)
        // Open events without an instance yet are entered from the calendar (WePlay Academy, week 8).
        expect(regs.map(q => q.tournamentId)).toContain('weplay_academy_s1')
        // Closed qualifiers still need qualification.
        expect(regs.some(q => q.tournamentId.startsWith('iem_katowice_closed'))).toBe(false)
        // Idempotent.
        applyAutoRegistration(save, { playerTeamId: save.playerTeamId!, nextId })
        expect(save.tournamentQualifications.filter(q => q.teamId === save.playerTeamId)).toHaveLength(regs.length)
    })

    test('no qualifier entry while already in the main event, or without a full squad', () => {
        const save = withQualifiers()
        save.tournamentQualifications.push({ tournamentId: 'major_copenhagen_s1', seriesId: 'major_copenhagen', instanceId: 'major_copenhagen_s1', seasonNumber: 1, teamId: save.playerTeamId!, status: 'QUALIFIED' } as never)
        applyAutoRegistration(save, { playerTeamId: save.playerTeamId!, nextId })
        expect(save.tournamentQualifications.filter(q => q.tournamentId.includes('rmr'))).toHaveLength(0)

        const short = withQualifiers()
        short.teams[0].rosterIds.pop()
        applyAutoRegistration(short, { playerTeamId: short.playerTeamId!, nextId })
        expect(short.tournamentQualifications).toHaveLength(0)
    })
})

describe('Hall of Fame thresholds', () => {
    test('a routine long career no longer qualifies; a standout one does', () => {
        const routine = { matchesPlayed: 260, totalKills: 1500, totalMVPs: 9, avgRating: 0, majorWins: 0 }
        expect(qualifiesForHallOfFame(routine)).toBe(false)
        const standout = { matchesPlayed: HALL_OF_FAME_TUNING.CAREER_MATCHES, totalKills: HALL_OF_FAME_TUNING.CAREER_KILLS, totalMVPs: 3, avgRating: 0, majorWins: 0 }
        expect(hallOfFameAchievements(standout)).toHaveLength(2)
        expect(qualifiesForHallOfFame(standout)).toBe(true)
        expect(qualifiesForHallOfFame({ ...routine, majorWins: HALL_OF_FAME_TUNING.AUTO_MAJOR_WINS })).toBe(true)
        // A high rating over a handful of matches is not a career.
        expect(qualifiesForHallOfFame({ ...routine, matchesPlayed: 20, avgRating: 1.4 })).toBe(false)
    })

    test('season-end retirement inducts only qualifying careers', () => {
        const save = createLaunchFixture('first-week', 41008)
        save.currentWeek = 52
        const base = save.players.find(p => p.id === 'qa_free_agent')!
        save.players.push(
            { ...structuredClone(base), id: 'hof_routine', age: 38, matchesPlayed: 260, totalKills: 1500, totalMVPs: 9 },
            { ...structuredClone(base), id: 'hof_great', age: 38, matchesPlayed: 450, totalKills: 3500, totalMVPs: 25 },
        )
        EventProcessor.processRetirements(save, new SeededRNG(3))
        expect(save.players.find(p => p.id === 'hof_routine')!.isRetired).toBe(true)
        expect(save.players.find(p => p.id === 'hof_routine')!.isLegendary).toBeFalsy()
        expect(save.players.find(p => p.id === 'hof_great')!.isLegendary).toBe(true)
    })
})

describe('round economy trade-off', () => {
    test('default buys FULL at rifle + helmet money and saves when short', () => {
        expect(EconomyManager.getTeamStrategy(ROUND_ECONOMY_TUNING.FULL_MIN_AVG_CASH)).toBe('FULL')
        expect(EconomyManager.getTeamStrategy(ROUND_ECONOMY_TUNING.FULL_MIN_AVG_CASH - 1)).toBe('SEMIBUY')
        expect(EconomyManager.getTeamStrategy(ROUND_ECONOMY_TUNING.FORCE_MIN_AVG_CASH - 1)).toBe('ECO')
        // After a lost pistol round (vest bought, first loss bonus) the default saves.
        expect(EconomyManager.getTeamStrategy(800 - 650 + getLossBonus(0))).toBe('ECO')
    })

    test('loss bonus ladder rewards consecutive losses and is capped', () => {
        expect([0, 1, 2, 3, 4, 9].map(getLossBonus)).toEqual([1400, 1900, 2400, 2900, 3400, 3400])
    })
})

describe('balance pass 2', () => {
    test('AI clubs train every week under the managed default regimen (same processor, potential cap)', async () => {
        const run = async (managedConfig: boolean) => {
            const save = createLaunchFixture('first-week', 42001)
            save.scheduledMatches = []
            for (const p of save.players) Object.assign(p, { rifle: 40, potential: 80, productivity: 80 })
            const processor = new AtomicWeekProcessor(new SaveManager(new FixtureStorage()))
            const focus = new Map(managedConfig ? [[save.playerTeamId!, { focus: TrainingFocus.AIM, intensity: AI_SQUAD_TUNING.TRAINING_INTENSITY }]] : [])
            expect((await processor.processWeek(save, { playerTeamId: save.playerTeamId!, trainingFocus: focus }, new SeededRNG(5))).success).toBe(true)
            return save
        }
        const save = await run(true)
        const managed = save.players.find(p => p.id === save.teams[0].rosterIds[1])!
        const ai = save.players.find(p => p.id === save.teams[1].rosterIds[1])!
        expect(ai.rifle).toBeGreaterThan(40)
        expect(ai.rifle).toBeCloseTo(managed.rifle, 6)
        expect(ai.rifle).toBeLessThanOrEqual(80)
    })

    test('opening contracts are staggered deterministically, never shorter than the minimum', () => {
        const ends = (seed: number) => {
            const loader = new (SnapshotLoaderClass as never as new () => { generateContracts: (...a: unknown[]) => Array<{ endWeek: number }> })()
            const players = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, age: 25, tier: 'PRO', skill: 60, defaultContractYears: 2 }))
            return loader.generateContracts(players, [{ id: 't', rosterIds: players.map(p => p.id) }], 1, new SeededRNG(seed)).map(c => c.endWeek)
        }
        const a = ends(7)
        expect(ends(7)).toEqual(a)
        expect(new Set(a.map(w => (w - 1) % 52)).size).toBeGreaterThan(5)
        expect(Math.min(...a)).toBeGreaterThanOrEqual(1 + AI_SQUAD_TUNING.INITIAL_CONTRACT_MIN_WEEKS)
    })

    test('free-agent retirement and AI scouting respond to pool size', () => {
        expect(freeAgentPoolFactor(10, 100)).toBe(FREE_AGENT_TUNING.POOL_FACTOR_MIN)
        expect(freeAgentPoolFactor(FREE_AGENT_TUNING.POOL_TARGET_PER_CLUB * 100, 100)).toBe(1)
        expect(freeAgentPoolFactor(5000, 100)).toBe(FREE_AGENT_TUNING.POOL_FACTOR_MAX)
        const save = createLaunchFixture('first-week', 42002)
        expect(freeAgentScoutingFactor(save)).toBe(1)
        save.players.push(...Array.from({ length: 300 }, (_, i) => ({ ...structuredClone(save.players[0]), id: `fa${i}` })))
        expect(freeAgentScoutingFactor(save)).toBe(FREE_AGENT_TUNING.SCOUTING_FACTOR_MIN)
    })

    test('a short AI club promotes its own academy prospect on a normal quote', () => {
        const save = createLaunchFixture('first-week', 42003)
        const team = save.teams[1]
        team.budget = 1_000_000
        const gone = team.rosterIds.pop()!
        save.contracts = save.contracts.filter(c => c.playerId !== gone)
        save.players.find(p => p.id === gone)!.isRetired = true
        const prospect = { ...structuredClone(save.players[0]), id: 'youth_1', skill: 45, potential: 70, age: 17 }
        save.players.push(prospect)
        team.youthAcademyIds = ['youth_1']
        expect(promoteAcademyToQuorum(team, save)).toBe(1)
        expect(team.rosterIds).toContain('youth_1')
        expect(team.youthAcademyIds).toEqual([])
        expect(save.contracts.find(c => c.playerId === 'youth_1')!.salaryPerWeek).toBe(recruitmentSalary(prospect, save.currentWeek, team))
    })
})