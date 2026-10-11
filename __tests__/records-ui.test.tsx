/**
 * Phase 5.1 screens render the recorded truth: the player's career record,
 * the manager's reputation and clubs, the trophy room's club records, the
 * Hall of Fame's career numbers and the awards ceremony (real fields only).
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useGameStore } from '@/store/game-store'
import { createLaunchFixture } from '@/scripts/launch/fixtures'
import { recordOfficialMatch, recordTitle } from '@/engine/official-stats'
import { closeSeason } from '@/engine/season-honours'
import { adjustManagerReputation, closeStint, openStint } from '@/engine/manager-timeline'
import { buildAnnualAwards } from '@/engine/pro-awards-engine'
import { hallOfFameEntry } from '@/engine/hall-of-fame-manager'
import { PlayerCareerRecord } from '@/components/player/PlayerCareerRecord'
import { ClubTimelinePanel, ReputationPanel } from '@/components/career/ManagerRecord'
import { ProAwardsModal } from '@/components/celebration/ProAwardsModal'
import TrophyRoomPage from '@/app/trophies/page'
import HallOfFamePage from '@/app/hall-of-fame/page'
import type { GameSave, MatchSaveData, PlayerSaveData } from '@/engine/save-types'
import type { MapResult, MatchResult, RoundResult } from '@/types'

jest.mock('@/engine/worker/week-processor-bridge', () => ({ weekProcessorBridge: { processWeek: jest.fn() } }))
jest.mock('@/engine/manager-career-profile', () => ({ recordCareerProgress: jest.fn().mockResolvedValue(undefined) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/', useParams: () => ({}) }))

const initial = { ...useGameStore.getState() }

function map(name: string, home: string[], away: string[], h: number, a: number): MapResult {
    const rounds: RoundResult[] = []
    const round = (w: string[], l: string[]): RoundResult => ({ roundNumber: rounds.length + 1, winner: 'ct', winType: 'ELIMINATION', ctTeam: 'x', tTeam: 'y', kills: [],
        events: l.map((v, i) => ({ type: 'KILL', time: i * 10, playerId: w[i % w.length], victimId: v } as never)), damage: Object.fromEntries(w.map(id => [id, 100])) })
    for (let i = 0; i < h; i++) rounds.push(round(home, away))
    for (let i = 0; i < a; i++) rounds.push(round(away, home))
    return { map: name, ctStartTeamId: 'x', tStartTeamId: 'y', rounds, finalScore: { team1: h, team2: a }, homeScore: h, awayScore: a, mvpPlayerId: home[0] } as unknown as MapResult
}

function career(): { save: GameSave; star: PlayerSaveData } {
    const save = createLaunchFixture('first-week', 53001)
    const [mine, rival] = save.teams
    openStint(save)
    for (let w = 2; w <= 30; w++) {
        const m: MatchSaveData = { id: `ui_${w}`, homeTeamId: mine.id, awayTeamId: rival.id, tournamentId: 'league_s1_ui_d1', stage: 'R', week: w, format: 'BO1', seed: w }
        const result: MatchResult = { engineVersion: 'script-v1', winnerId: mine.id, homeScore: 1, awayScore: 0, maps: [map('Mirage', mine.rosterIds, rival.rosterIds, 13, w % 9)], mvpPlayerId: mine.rosterIds[0], playerStats: {}, lineups: { [mine.id]: mine.rosterIds, [rival.id]: rival.rosterIds } }
        save.currentWeek = w
        recordOfficialMatch(save, m, result)
    }
    recordTitle(save, mine, { tournamentId: 'major_copenhagen_s1', name: 'Northern Major 2025', tier: 'S_TIER', week: 30, season: 1 })
    mine.trophies = [{ tournamentId: 'major_copenhagen_s1', tournamentName: 'Northern Major 2025', week: 30, tier: 'S_TIER' }]
    save.currentWeek = 52
    save.managerDetails.reputation = 50
    adjustManagerReputation(save, 6, 'Season 1 board review: expectations exceeded')
    save.currentWeek = 53
    closeSeason(save, 1)
    return { save, star: save.players.find(p => p.id === mine.rosterIds[0])! }
}

function load(save: GameSave) {
    useGameStore.setState({ ...initial, ...structuredClone(save), isLoading: false, isInitialized: true, _hasHydrated: true } as never)
    Object.assign(useGameStore.getInitialState(), useGameStore.getState())
}

afterEach(() => { Object.assign(useGameStore.getInitialState(), initial); useGameStore.setState(initial as never) })

test('player career record: totals, awards, bests and season lines from official maps', () => {
    const { save, star } = career()
    load(save)
    const html = renderToStaticMarkup(<PlayerCareerRecord player={useGameStore.getState().players.find(p => p.id === star.id)!} />)
    expect(html).toContain('Official maps')
    expect(html).toContain('>29<') // 29 official maps
    expect(html).toContain('Season MVP')
    expect(html).toContain('Best map rating')
    expect(html).toContain('S1')
    expect(html).toContain('1 Major')
    expect(html).not.toContain('Tournament MVP')
})

test('manager: reputation with its causes and the clubs managed', () => {
    const { save } = career()
    save.currentWeek = 60
    closeStint(save, 'sacked')
    save.managerDetails.dismissals = 1
    load(save)
    const rep = renderToStaticMarkup(<ReputationPanel />)
    expect(rep).toContain('Season 1 board review: expectations exceeded')
    expect(rep).toContain('+6 / +2')
    const timeline = renderToStaticMarkup(<ClubTimelinePanel />)
    expect(timeline).toContain(save.teams[0].name)
    expect(timeline).toContain('Sacked')
    expect(timeline).toContain('1 dismissal')
    expect(timeline).toContain('29<span class="text-ink-3">–</span>0')
})

test('trophy room: Majors are Majors and club records come from the record book', () => {
    const { save } = career()
    save.teams[0].trophies!.push({ tournamentId: 'iem_cologne_s1', tournamentName: 'Summer Open Colone 2025', week: 31, tier: 'S_TIER' })
    load(save)
    const html = renderToStaticMarkup(<TrophyRoomPage />)
    expect(html).toContain('Club records')
    expect(html).toContain('Biggest map win')
    expect(html).toContain('13-0')
    // Two S-tier titles, one Major.
    expect(html).toMatch(/Majors<\/p><p[^>]*>1</)
})

test('Hall of Fame shows the inducted career numbers', () => {
    const { save, star } = career()
    star.mapsPlayed = 300; star.avgRating = 1.24; star.isRetired = true
    save.hallOfFame = [hallOfFameEntry(star, save.currentWeek, save.teams[0].id)]
    load(save)
    const html = renderToStaticMarkup(<HallOfFamePage />)
    expect(html).toContain('1.24')
    expect(html).toContain('300')
    expect(html).toContain('official maps')
})

test('awards ceremony renders real season numbers; awards from older saves are not opened', () => {
    const { save } = career()
    load(save)
    const awards = buildAnnualAwards(save, save.recordBook!.honours[0], save.playerTeamId!)
    const html = renderToStaticMarkup(<ProAwardsModal isOpen onClose={() => {}} awards={awards} />)
    expect(html).toContain('Season 1')
    expect(renderToStaticMarkup(<ProAwardsModal isOpen onClose={() => {}} awards={{ year: 2, top20: [{ proRating: 1.3 }] } as never} />)).toBe('')
})
