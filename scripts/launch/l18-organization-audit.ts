import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { produce, enableMapSet } from 'immer'
import { createLaunchFixture, FixtureStorage } from './fixtures'
import { createTeamFacilitiesSlice } from '../../store/slices/team-facilities-slice'
import { createStaffManagementSlice } from '../../store/slices/staff-management-slice'
import { computeWeek } from '../../engine/worker/compute-week'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import { SaveManager } from '../../engine/save-manager'
import { EconomyEngine } from '../../engine/economy-engine'
import { EquipmentManager } from '../../engine/equipment-manager'
import { buildSaveSnapshot, type SaveSnapshotState } from '../../store/utils/build-save-snapshot'
import { TrainingFocus } from '../../types'
import type { StoreState } from '../../store/types'
import type { StaffSaveData } from '../../engine/save-types'

enableMapSet()
async function run(tier: 1 | 3) {
    const initial = createLaunchFixture('first-week', 3618)
    let state = initial as unknown as StoreState
    const set = (fn: Partial<StoreState> | ((s: StoreState) => void)) => { state = typeof fn === 'function' ? produce(state, fn) : { ...state, ...fn } }
    const org = createTeamFacilitiesSlice(set, () => state), staff = createStaffManagementSlice(set, () => state)
    const teamId = state.playerTeamId!
    state.teams[0].facilities = []; state.teams[0].sponsors = []; state.teams[0].equipment = []
    state.sponsorOffers = [{ id: 'l18_basic', name: 'QA Studio', tier: 'STANDARD', weeklyPayout: 1000, remainingWeeks: 13, requirements: 'None' }]
    state.marketStaff = [{ id: 'l18_coach', name: 'QA Coach', role: 'coach', level: 1, stats: { development: 80 }, specialization: 'Player Dev', salaryPerWeek: 1000, yearsRemaining: 1, unlockedTalentIds: [] } as unknown as StaffSaveData]
    const startingCash = state.teams[0].budget
    assert.ok(org.signSponsor(teamId, state.sponsorOffers[0]).success)
    assert.ok(staff.hireStaff('l18_coach', { salary: 1000, duration: 13, signingBonus: 2000 }).success)
    for (const type of ['TRAINING', 'RECOVERY', 'TACTICAL', 'FANZONE']) {
        for (let level = 0; level < (tier === 3 ? 2 : 1); level++) assert.ok(org.upgradeFacility(teamId, type).success)
    }
    for (const slot of ['mouse', 'keyboard', 'monitor', 'headset', 'chair', 'pc']) assert.ok(org.purchaseEquipment(`${slot}_t${tier}`).success)
    const spent = startingCash - state.teams[0].budget
    assert.equal(state.financeLedger.filter(e => e.teamId === teamId && e.type === 'EXPENSE').reduce((sum, e) => sum + e.amount, 0), spent)
    const equipmentStrength = EquipmentManager.strengthBonus(state.teams[0])
    const opening = EconomyEngine.processWeeklyFinances(state.teams[0], state.players, state.contracts, state.staff, state.currentWeek)
    const manager = new SaveManager(new FixtureStorage())
    const weeks = []
    for (let tick = 0; tick < 52; tick++) {
        const result = await computeWeek(JSON.parse(JSON.stringify(buildSaveSnapshot(state as unknown as SaveSnapshotState))),
            { playerTeamId: teamId, trainingFocus: new Map([[teamId, { focus: TrainingFocus.AIM, intensity: 3 }]]) }, state.lastRngSeed)
        assert.ok(result.result.success, result.result.error)
        state = { ...result.save, lastRngSeed: result.rngState } as unknown as StoreState
        assert.ok(Number.isFinite(state.teams[0].budget))
        assert.equal(new Set(state.financeLedger.map(e => e.id)).size, state.financeLedger.length)
        const snapshot = buildSaveSnapshot(state as unknown as SaveSnapshotState)
        assert.ok((await manager.saveGame(snapshot)).success)
        const loaded = (await manager.loadGame(snapshot.saveId)).save!
        assert.equal(loaded.saveId, snapshot.saveId)
        state = loaded as unknown as StoreState
        weeks.push({ week: state.currentWeek, cash: state.teams[0].budget, coaches: state.staff.filter(s => s.id === 'l18_coach').length,
            sponsorActive: state.teams[0].sponsors?.some(s => s.id === 'l18_basic') ?? false, roster: state.teams[0].rosterIds.length })
    }
    assert.equal(weeks.at(-1)!.coaches, 0, 'Fixed staff contract must expire')
    assert.equal(weeks.at(-1)!.sponsorActive, false, 'Fixed sponsor deal must expire')
    return { equipmentTier: tier, facilityLevel: tier === 3 ? 2 : 1, spent, opening, equipmentStrength, weeks, canonicalSha256: createHash('sha256').update(canonicalWeekState(buildSaveSnapshot(state as unknown as SaveSnapshotState))).digest('hex') }
}
async function main() {
    const standard = await run(1), standardRepeat = await run(1), advanced = await run(3), advancedRepeat = await run(3)
    assert.deepEqual(standard, standardRepeat); assert.deepEqual(advanced, advancedRepeat)
    assert.ok(standard.spent < advanced.spent)
    assert.ok(standard.opening.expenses.total < advanced.opening.expenses.total)
    assert.ok(standard.equipmentStrength < advanced.equipmentStrength)
    const report = { passed: true, repeatedExactly: true, seed: 3618, scope: 'Two investment plans through real organization actions, 52 computeWeek ticks each, repeated, weekly production save/load, unique ledger IDs and contract expiry. Three-club fixture; not full-career balance or installed Windows acceptance.', standard, advanced }
    fs.writeFileSync('docs/launch-readiness/evidence/L18-runtime.json', JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ passed: true, standard: { spent: standard.spent, net: standard.opening.net }, advanced: { spent: advanced.spent, net: advanced.opening.net } }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
