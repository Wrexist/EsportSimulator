import { createLaunchFixture, FixtureStorage } from '@/scripts/launch/fixtures'
import { JobOfferGenerator } from '@/engine/job-offer-generator'
import { computeSeasonSummary, updateCareerStats } from '@/engine/career-stats'
import { ensureBoardState, processSeasonBoardReview } from '@/engine/board-expectations'
import { generateCareerDecision } from '@/engine/career-decisions'
import { mergeCareerProgress, createEmptyCareerProfile } from '@/engine/manager-career-profile'
import { academyHeldPlayerIds } from '@/engine/recruitment'
import { SaveManager } from '@/engine/save-manager'
import { buildSaveSnapshot, type SaveSnapshotState } from '@/store/utils/build-save-snapshot'
import { createEventsSlice } from '@/store/slices/events-slice'
import { produce, enableMapSet } from 'immer'
import type { StoreState } from '@/store/types'
import type { GameSave } from '@/engine/save-types'

enableMapSet()
function offer(save: GameSave, teamId = save.teams[1].id, id = 'l20_offer') {
    save.eventsLog.push({ id, type: 'JOB_OFFER', week: save.currentWeek, acknowledged: true, data: { originTeamId: save.playerTeamId, offeringTeamId: teamId, offeringTeamName: teamId, salaryOffer: 5000, deadlineWeek: save.currentWeek + 2, negotiationPatience: 2, negotiationAttempts: 0 } })
    return id
}
function result(save: GameSave, teamId: string, week: number, id: string) {
    save.completedMatches.push({ id, week, homeTeamId: teamId, awayTeamId: 'opponent', result: { winnerId: teamId, homeScore: 2, awayScore: 0, maps: [] } } as any)
}

describe('L20 careers', () => {
    test('declining an offer pays loyalty once; read status does not resolve an offer', () => {
        const save = createLaunchFixture('first-week', 20), id = offer(save)
        const team = save.teams[0]; team.chemistry = 50
        expect(JobOfferGenerator.declineJobOffer(save, id).success).toBe(true)
        expect(team.chemistry).toBe(55)
        expect(JobOfferGenerator.declineJobOffer(save, id).success).toBe(false)
        expect(JobOfferGenerator.acceptJobOffer(save, id).success).toBe(false)
        expect(JobOfferGenerator.negotiateJobOffer(save, id).success).toBe(false)
        expect(team.chemistry).toBe(55)
    })

    test('switch preserves club academy, reports and board through canonical save/load and a return', async () => {
        let save = createLaunchFixture('first-week', 20)
        save.currentWeek = 20
        const oldId = save.playerTeamId, academyId = 'qa_free_agent'
        save.academyPlayers = [{ id: 'enrollment', playerId: academyId, enrolledWeek: 1 }] as any
        save.academyRoster = { IGL: 'enrollment' }
        save.academyTrainingSchedule = { 0: 'aim_intensive' }
        save.watchlistedPlayerIds = ['qa_free_agent']
        ensureBoardState(save).confidence = 18
        const id = offer(save)
        expect(JobOfferGenerator.acceptJobOffer(save, id).success).toBe(true)
        expect(save.boardState?.confidence).toBe(60)
        expect(save.academyPlayers).toEqual([])
        expect(save.watchlistedPlayerIds).toEqual([])
        expect(academyHeldPlayerIds(save).has(academyId)).toBe(true)
        const budget = save.teams[1].budget
        save.currentWeek = 40
        expect(JobOfferGenerator.acceptJobOffer(save, id).success).toBe(false)
        expect(save.teams[1].budget).toBe(budget)
        const manager = new SaveManager(new FixtureStorage())
        const snapshot = buildSaveSnapshot(save as unknown as SaveSnapshotState)
        expect((await manager.saveGame(snapshot)).success).toBe(true)
        save = (await manager.loadGame(snapshot.saveId)).save!
        expect(JobOfferGenerator.acceptJobOffer(save, offer(save, oldId, 'return')).success).toBe(true)
        expect(save.academyPlayers[0].playerId).toBe(academyId)
        expect(save.academyTrainingSchedule[0]).toBe('aim_intensive')
        expect(save.boardState?.confidence).toBe(18)
        expect(save.teams.find(t => t.id === oldId)?.managementState).toBeUndefined()
    })

    test('active matches, withdrawn offers, foreign tenure and ended careers reject a move', () => {
        for (const mode of ['active', 'withdrawn', 'foreign', 'ended']) {
            const save = createLaunchFixture('first-week', 20), id = offer(save)
            if (mode === 'active') save.activeMatchId = 'playing'
            if (mode === 'withdrawn') save.eventsLog.at(-1)!.data.isWithdrawn = true
            if (mode === 'foreign') save.eventsLog.at(-1)!.data.originTeamId = 'previous'
            if (mode === 'ended') save.gameOverReason = 'SACKED'
            const before = JSON.stringify(save)
            expect(JobOfferGenerator.acceptJobOffer(save, id).success).toBe(false)
            expect(JSON.stringify(save)).toBe(before)
        }
    })

    test('joining an established club does not inherit its old trophies into manager legacy', () => {
        const save = createLaunchFixture('first-week', 20)
        save.teams[1].trophies = [{ tournamentId: 'historic', tournamentName: 'Historic title', week: 1, tier: 'S_TIER' }] as any
        save.currentWeek = 20
        expect(JobOfferGenerator.acceptJobOffer(save, offer(save)).success).toBe(true)
        expect(mergeCareerProgress(createEmptyCareerProfile(), save).bestCareerTrophies).toBe(0)
        save.teams[1].trophies.push({ tournamentId: 'managed', tournamentName: 'Managed title', week: 21, tier: 'S_TIER' } as any)
        expect(mergeCareerProgress(createEmptyCareerProfile(), save).bestCareerMajors).toBe(1)
    })

    test('season history includes both stints and excludes the new club pre-arrival record', () => {
        const save = createLaunchFixture('first-week', 20)
        save.currentWeek = 20
        result(save, save.teams[0].id, 10, 'old-win')
        result(save, save.teams[1].id, 10, 'not-managed')
        expect(JobOfferGenerator.acceptJobOffer(save, offer(save)).success).toBe(true)
        result(save, save.playerTeamId, 30, 'new-win')
        save.currentWeek = 52
        save.careerStats = updateCareerStats(save)
        expect(save.careerStats.totalSeasons).toBe(1)
        expect(save.careerStats.seasons).toHaveLength(2)
        expect(save.careerStats.totalMatches).toBe(2)
        expect(save.careerStats.seasons.map(s => [s.startWeek,s.endWeek])).toEqual([[1,20],[21,52]])
        expect(updateCareerStats(save)).toEqual(save.careerStats)
    })

    test('prize money excludes ordinary revenue and board targets are reachable for a small club', () => {
        const save = createLaunchFixture('first-week', 20)
        save.teams[0].worldRanking = 175; save.teams[0].reputation = 20
        expect(ensureBoardState(save).rankTarget).toBe(158)
        save.financeLedger = [{ id: 'income', week: 1, teamId: save.playerTeamId, type: 'INCOME', category: 'OTHER', amount: 10000 }, { id: 'prize', week: 1, teamId: save.playerTeamId, type: 'INCOME', category: 'PRIZE', amount: 500 }] as any
        expect(computeSeasonSummary(save).prizeMoney).toBe(500)
        expect(updateCareerStats(save).totalPrizeMoney).toBe(500)
    })

    test('late arrival gets a grace review, while sacking requires an earlier notice', () => {
        const save = createLaunchFixture('first-week', 20)
        save.currentWeek = 50
        JobOfferGenerator.acceptJobOffer(save, offer(save))
        save.currentWeek = 52
        const rep = save.managerDetails.reputation, budget = save.teams[1].budget
        expect(processSeasonBoardReview(save).confidenceDelta).toBe(0)
        expect(save.managerDetails.reputation).toBe(rep)
        expect(save.teams[1].budget).toBe(budget)
        expect(processSeasonBoardReview(save).reviewed).toBe(false)
        save.currentWeek = 104
        save.boardState!.onNotice = true; save.boardState!.confidence = 10
        save.boardState!.seasonExpectation = 'WIN'; save.boardState!.rankTarget = 3
        save.teams[1].worldRanking = 200
        expect(processSeasonBoardReview(save).sacked).toBe(true)
        expect(save.gameOverReason).toBe('SACKED')
    })

    test('career decisions are contextual, affordable, bounded and one-time', () => {
        let state = createLaunchFixture('first-week', 20) as unknown as StoreState
        state.players[0].fatigue = 90
        state.players.forEach(p => { p.morale = 60 })
        generateCareerDecision(state as unknown as GameSave)
        const event = state.eventsLog.find(e => e.id.startsWith('career_decision_'))!
        expect(event.data.title).toContain('running on empty')
        const slice = createEventsSlice((fn: any) => { state = produce(state, fn) }, () => state)
        const cash = state.teams[0].budget
        slice.resolveEventChoice(event.id, 'recovery')
        expect(state.players[0].fatigue).toBe(80)
        expect(state.teams[0].budget).toBe(cash - 750)
        slice.resolveEventChoice(event.id, 'recovery')
        expect(state.teams[0].budget).toBe(cash - 750)
        state = structuredClone(state)
        generateCareerDecision(state as unknown as GameSave)
        expect(state.eventsLog.filter(e => e.id.startsWith('career_decision_'))).toHaveLength(1)
    })
})
