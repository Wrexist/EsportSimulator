import { enableMapSet, produce } from 'immer'
import { createLaunchFixture, FixtureStorage } from '@/scripts/launch/fixtures'
import { createTeamFacilitiesSlice } from '@/store/slices/team-facilities-slice'
import { createStaffManagementSlice } from '@/store/slices/staff-management-slice'
import { EquipmentManager } from '@/engine/equipment-manager'
import { EconomyEngine } from '@/engine/economy-engine'
import { facilityWeeklyCost, staffDevelopmentEffects } from '@/engine/organization-effects'
import { TrainingProcessor } from '@/engine/processors/training-processor'
import { SaveManager } from '@/engine/save-manager'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { TrainingFocus } from '@/types'
import type { StoreState } from '@/store/types'
import type { SponsorSaveData, StaffSaveData, GameSave } from '@/engine/save-types'

enableMapSet()
function harness() {
    let state = createLaunchFixture('first-week', 3618) as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => {
        state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn }
    }
    return { get: () => state, set, org: createTeamFacilitiesSlice(set, () => state), staff: createStaffManagementSlice(set, () => state) }
}
function sponsor(tier: SponsorSaveData['tier'] = 'STANDARD'): SponsorSaveData {
    return { id: 'l18_offer', name: 'Studio QA', tier, weeklyPayout: 1000, remainingWeeks: 12, requirements: 'None' }
}
function coach(): StaffSaveData {
    return { id: 'l18_coach', name: 'QA Coach', role: 'coach', level: 1, salaryPerWeek: 1000, yearsRemaining: 1, specialization: 'Player Dev', stats: { development: 100 }, unlockedTalentIds: [] } as unknown as StaffSaveData
}
function forecast(state: StoreState) {
    const team = state.teams.find(t => t.id === state.playerTeamId)!
    return EconomyEngine.processWeeklyFinances(team, state.players, state.contracts, state.staff, state.currentWeek)
}

test('sponsor eligibility resolves the saved offer before tier and cooldown checks', () => {
    const h = harness()
    h.set(s => { s.teams[0].worldRanking = 80; s.teams[0].sponsors = []; s.sponsorOffers = [sponsor('ELITE')] })
    expect(h.org.signSponsor(h.get().playerTeamId!, { ...sponsor(), name: 'Pretend Basic' }).success).toBe(false)
    expect(h.get().teams[0].sponsors).toHaveLength(0)
    h.set(s => { s.sponsorOffers = [sponsor()]; s.teams[0].sponsorCooldowns = { 'Studio QA': s.currentWeek + 3 } })
    expect(h.org.signSponsor(h.get().playerTeamId!, { ...sponsor(), name: 'Bypass cooldown' }).success).toBe(false)
})

test('organization actions cannot spend another club cash or construct an unknown facility', () => {
    const h = harness(), before = JSON.stringify(h.get().teams)
    expect(h.org.upgradeFacility(h.get().teams[1].id, 'TRAINING').success).toBe(false)
    expect(h.org.upgradeMerchStore(h.get().teams[1].id).success).toBe(false)
    expect(h.org.upgradeFacility(h.get().playerTeamId!, 'MAGIC').success).toBe(false)
    expect(JSON.stringify(h.get().teams)).toBe(before)
})

test('sponsor preview includes the income floor, reputation and difficulty used at settlement', () => {
    const h = harness(), team = structuredClone(h.get().teams[0])
    team.sponsors = []
    const floor = EconomyEngine.calculateSponsorIncome(team)
    team.sponsors = [sponsor()]
    expect(EconomyEngine.calculateSponsorIncome(team)).toBe(floor)
    team.sponsors[0].weeklyPayout = 25000
    const increased = EconomyEngine.calculateSponsorIncome(team)
    expect(increased).toBeGreaterThan(floor)
    team.difficultySettings = { ...team.difficultySettings, incomeMultiplier: 0.8 } as never
    const report = EconomyEngine.processWeeklyFinances(team, h.get().players, h.get().contracts, h.get().staff)
    expect(report.income.sponsors).toBe(EconomyEngine.calculateSponsorIncome(team))
    expect(report.income.sponsors).toBe(Math.floor(increased * 0.8))
})

test('equipment re-clicks do not charge; cheaper replacement reduces upkeep without stacking', () => {
    const h = harness()
    expect(h.org.purchaseEquipment('mouse_t3').success).toBe(true)
    const paid = h.get().teams[0].budget, expensive = forecast(h.get()).expenses.equipment
    expect(h.org.purchaseEquipment('mouse_t3').success).toBe(false)
    expect(h.get().teams[0].budget).toBe(paid)
    expect(h.org.purchaseEquipment('mouse_t1').success).toBe(true)
    expect(h.get().teams[0].equipment.filter(e => e.type === 'MOUSE')).toHaveLength(1)
    expect(forecast(h.get()).expenses.equipment).toBeLessThan(expensive)
    expect(EquipmentManager.strengthBonus(h.get().teams[0])).toBeCloseTo(2 / 80)
    expect(h.get().financeLedger.filter(e => e.description.startsWith('Equipment purchase')).map(e => e.amount))
        .toEqual([EquipmentManager.getCatalogItem('mouse_t3')!.purchaseCost, EquipmentManager.getCatalogItem('mouse_t1')!.purchaseCost])
})

test('legacy duplicate gear slots and corrupt ratings cannot stack unbounded strength', () => {
    const h = harness(); h.org.purchaseEquipment('mouse_t3')
    const team = structuredClone(h.get().teams[0])
    team.equipment = Array.from({ length: 20 }, () => ({ ...team.equipment[0], bonus: { stat: 'reaction', value: 1e9 } }))
    expect(EquipmentManager.strengthBonus(team)).toBeCloseTo(0.1)
    expect(EquipmentManager.calculateWeeklyCost(team)).toBe(EquipmentManager.getCatalogItem('mouse_t3')!.weeklyCost)
})

test('staff cannot be hired from a stale market entry when already employed', () => {
    const h = harness(), employee = coach()
    h.set(s => { s.marketStaff = [employee] })
    expect(h.staff.hireStaff(employee.id).success).toBe(true)
    const paid = h.get().teams[0].budget
    h.set(s => { s.marketStaff.push(employee) })
    expect(h.staff.hireStaff(employee.id).success).toBe(false)
    expect(h.get().teams[0].budget).toBe(paid)
    h.set(s => { s.currentWeek = s.staff.find(p => p.id === employee.id)!.contractEndWeek! })
    expect(h.staff.renewStaffContract(employee.id, 1000, 52).success).toBe(false)
})

test('shared staff preview matches development, including specialist and zero-stat behavior', () => {
    const h = harness(), teamId = h.get().playerTeamId!
    const baseline = structuredClone(h.get()) as unknown as GameSave
    baseline.teams[0].facilities = []
    baseline.staff = []
    baseline.players.forEach(p => { p.skill = 30; p.rifle = 30; p.potential = 99; p.trainingFocus = 'BALANCED' })
    const improved = structuredClone(baseline)
    improved.staff = [{ ...coach(), teamId }]
    const before = baseline.players[0].rifle
    const config = new Map([[teamId, { focus: TrainingFocus.AIM, intensity: 3 }]])
    TrainingProcessor.processTraining(baseline, config)
    TrainingProcessor.processTraining(improved, config)
    expect(baseline.players[0].rifle).toBeGreaterThan(before)
    expect((improved.players[0].rifle - before) / (baseline.players[0].rifle - before))
        .toBeCloseTo(staffDevelopmentEffects(improved.staff).trainingMultiplier)
    expect(staffDevelopmentEffects([{ ...coach(), stats: { development: 0 } }]).trainingMultiplier).toBe(1)
})

test('paid organization state and recurring forecast survive production save/load', async () => {
    const h = harness(), teamId = h.get().playerTeamId!
    h.set(s => { s.teams[0].facilities = []; s.teams[0].sponsors = []; s.marketStaff = [coach()]; s.sponsorOffers = [sponsor()] })
    expect(h.org.upgradeFacility(teamId, 'RECOVERY').success).toBe(true)
    expect(h.org.purchaseEquipment('pc_t1').success).toBe(true)
    expect(h.staff.hireStaff('l18_coach').success).toBe(true)
    expect(h.org.signSponsor(teamId, sponsor()).success).toBe(true)
    expect(forecast(h.get()).expenses.facilities).toBe(Math.floor(facilityWeeklyCost(1)))
    const manager = new SaveManager(new FixtureStorage())
    const snapshot = buildSaveSnapshot(h.get() as unknown as SaveSnapshotState)
    expect((await manager.saveGame(snapshot)).success).toBe(true)
    const loaded = (await manager.loadGame(snapshot.saveId)).save!
    expect(loaded.teams[0]).toEqual(snapshot.teams[0])
    expect(forecast(loaded as unknown as StoreState)).toEqual(forecast(h.get()))
})
