import fs from 'node:fs'
import { FULL_TOURNAMENT_CALENDAR } from '../../data/tournament-calendar'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createLaunchFixture, FixtureStorage } from './fixtures'
import { TournamentManager } from '../../engine/tournament-manager'
import { updateStandings } from '../../engine/processors/standings-processor'
import { SeededRNG } from '../../engine/rng'
import { SaveManager } from '../../engine/save-manager'
import { canonicalWeekState } from '../../engine/worker/week-replay'
import type { TournamentSaveData } from '../../engine/save-types'

export function tournamentFixture(format: string, count: number, startWeek = 1) {
    const save = createLaunchFixture('first-week', 3719)
    const originalTeam = save.teams[0], originalPlayers = save.players.filter(p => originalTeam.rosterIds.includes(p.id))
    save.teams = []; save.players = []; save.contracts = []; save.staff = []
    for (let i = 0; i < count; i++) {
        const id = `l19_team_${String(i).padStart(2, '0')}`
        const players = originalPlayers.map((p, slot) => ({ ...structuredClone(p), id: `${id}_p${slot}` }))
        save.players.push(...players)
        save.teams.push({ ...structuredClone(originalTeam), id, name: id, rosterIds: players.map(p => p.id), worldRanking: i + 1 })
    }
    save.playerTeamId = originalTeam.id
    save.currentWeek = startWeek; save.currentDay = 6; save.timeMode = 'WEEKLY'
    save.completedMatches = []; save.scheduledMatches = []; save.circuitPoints = []; save.tournamentQualifications = []
    const tournament: TournamentSaveData = {
        id: `l19_${format}_${count}_s${Math.ceil(startWeek / 52)}`, name: `QA ${format} ${count}`, shortName: 'QA', tier: 'B_TIER', region: 'GLOBAL',
        format, teamIds: save.teams.map(t => t.id), startWeek, endWeek: startWeek + 8, duration: 9, prizePool: 100000,
        currentStage: 'Scheduled', isCompleted: false, rewardsGranted: false,
        standings: save.teams.map(t => ({ teamId: t.id, matchesPlayed: 0, wins: 0, losses: 0, mapsWon: 0, mapsLost: 0, points: 0, mapDiff: 0, roundDiff: 0 })),
    }
    save.teams.push(structuredClone(originalTeam))
    save.players.push(...structuredClone(originalPlayers))
    save.tournaments = [tournament]
    return save
}

async function run(format: string, count: number, startWeek = 1, qualifierId?: string) {
    let save = tournamentFixture(format, count, startWeek)
    if (qualifierId) save.tournaments[0].id = `${qualifierId}_s${Math.ceil(startWeek / 52)}`
    const id = save.tournaments[0].id, rng = new SeededRNG(3719), manager = new SaveManager(new FixtureStorage())
    TournamentManager.initializeTournament(save, id, save.tournaments[0].teamIds, rng)
    let maxPending = 0
    for (let tick = 0; tick < 64; tick++) {
        save.currentWeek = startWeek + tick
        TournamentManager.simulateConcurrentMatches(save, id, 'absent_manager_team', '', rng)
        TournamentManager.repairTournamentProgression(save, id)
        updateStandings(save)
        assert.ok(save.completedMatches.every(m => m.week <= save.currentWeek), 'Played a future fixture')
        assert.equal(new Set(save.completedMatches.map(m => m.id)).size, save.completedMatches.length)
        const slots = new Set<string>()
        for (const match of [...save.completedMatches, ...save.scheduledMatches]) {
            assert.notEqual(match.homeTeamId, match.awayTeamId)
            for (const team of [match.homeTeamId, match.awayTeamId]) {
                const key = `${team}:${match.week}:${match.day}`
                assert.ok(!slots.has(key), `Double booking: ${key}`); slots.add(key)
            }
        }
        maxPending = Math.max(maxPending, save.scheduledMatches.length)
        save.lastRngSeed = rng.getState()
        assert.ok((await manager.saveGame(save)).success)
        save = (await manager.loadGame(save.saveId)).save!
        if (save.tournaments[0].rewardsGranted) break
    }
    const tournament = save.tournaments[0]
    const payout = save.financeLedger.filter(e => e.category === 'PRIZE').reduce((sum, e) => sum + e.amount, 0)
    const placements = TournamentManager.calculatePlacements(save, tournament)
    assert.equal(new Set(placements.map(p => p.teamId)).size, count, 'Missing or duplicate placements')
    let promoted = 0
    if (qualifierId) {
        const definition = FULL_TOURNAMENT_CALENDAR.find(t => t.id === qualifierId)!
        const target = `${definition.qualifierFor}_s${Math.ceil(startWeek / 52)}`
        const qualified = save.tournamentQualifications.filter(q => q.tournamentId === target && q.status === 'QUALIFIED')
        promoted = qualified.length
        const spots = definition.qualifierSlots || (definition.slots <= 8 ? 2 : 4)
        assert.equal(promoted, spots)
        assert.deepEqual(new Set(qualified.map(q => q.teamId)), new Set(placements.filter(p => p.position <= spots).map(p => p.teamId)))
    }
    for (const match of save.completedMatches) {
        const required = match.format === 'BO5' ? 3 : match.format === 'BO3' ? 2 : 1
        assert.equal(Math.max(match.result.homeScore, match.result.awayScore), required, 'Wrong series winning score')
        assert.equal(match.result.maps.length, match.result.homeScore + match.result.awayScore, 'Wrong map count')
    }
    const before = canonicalWeekState(save)
    updateStandings(save)
    assert.equal(canonicalWeekState(save), before, 'Repeated standings changed rewards')
    assert.ok(payout <= tournament.prizePool)
    const involved = new Set(save.completedMatches.flatMap(m => [m.homeTeamId, m.awayTeamId]))
    return { format, count, startWeek, qualifierId, promoted, placements: placements.length, passed: !!tournament.rewardsGranted && involved.size === count, champion: tournament.winnerId,
        completedWeek: save.currentWeek, matches: save.completedMatches.length, entrantsPlayed: involved.size, payout, maxPending,
        pending: save.scheduledMatches.length, stage: tournament.currentStage, sha256: createHash('sha256').update(canonicalWeekState(save)).digest('hex') }
}

async function main() {
    const cases: [string, number, number, string?][] = [['bracket', 8, 1], ['bracket', 12, 1], ['bracket', 16, 1], ['bracket', 32, 1],
        ['swiss', 16, 1], ['swiss', 24, 1], ['double_elim', 16, 1], ['league', 12, 1], ['league', 16, 1], ['league', 20, 1], ['league', 24, 1], ['bracket', 12, 52]]
    const qualifier = FULL_TOURNAMENT_CALENDAR.find(t => t.qualifierFor && t.format === 'bracket')!
    cases.push([qualifier.format, qualifier.slots, 53, qualifier.id])
    const results = []
    for (const args of cases) {
        const first = await run(...args), repeat = await run(...args)
        assert.deepEqual(first, repeat)
        results.push(first); console.log(JSON.stringify(first))
    }
    assert.ok(results.every(r => r.passed), 'A tournament did not finish')
    fs.writeFileSync('docs/launch-readiness/evidence/L19-formats.json', JSON.stringify({ passed: results.every(r => r.passed), repeatedExactly: true,
        scope: 'All declared format/field-size combinations plus rollover. Real MatchEngine and tournament scheduled progression, absent manager, weekly normal save/load; not full computeWeek careers or packaged acceptance.', results }, null, 2))
}
if (process.argv[1]?.includes('l19-tournament-audit')) main().catch(error => { console.error(error); process.exitCode = 1 })
