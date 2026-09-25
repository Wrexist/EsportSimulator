import { auditMatchManagement, matchFixture, economy } from '@/scripts/launch/l21-match-audit'
import { getActivePlayersByRosterOrder } from '@/lib/live-match-builders'
import { resultLineup, matchFollowup } from '@/lib/match-followup'
import { createDefaultTactics } from '@/engine/default-tactics'
import { simulationEngineV2 } from '@/engine/match-simulation'
import { SeededRNG } from '@/engine/rng'
import type { MatchResult, PlayerMatchStats } from '@/types'

test('L21 actual paired round effects, BO1/3/5 contracts, loadout ownership and canonical save/load', async () => {
    expect((await auditMatchManagement()).canonicalSaveRoundtrip).toBe(true)
})

test('L21 active lineup counts distinct resolved nonretired starters; a bench does not silently replace missing selected players', () => {
    const { save } = matchFixture(), team = save.teams[0]
    team.rosterIds = [team.rosterIds[0], ...team.rosterIds]
    expect(getActivePlayersByRosterOrder(team, save.players)).toHaveLength(5)
    save.players[0].isRetired = true
    expect(getActivePlayersByRosterOrder(team, save.players)).toHaveLength(4)
    save.players[1].id = 'missing-selected-player'
    expect(getActivePlayersByRosterOrder(team, save.players)).toHaveLength(3)
})

test('L21 historical report retains participants after transfers and handles legacy reports', () => {
    const result = { lineups: { home: ['old-player'] } } as unknown as MatchResult
    expect(resultLineup(JSON.parse(JSON.stringify(result)), 'home', ['new-player'])).toEqual(['old-player'])
    expect(resultLineup(undefined, 'home', ['legacy'])).toEqual(['legacy'])
    expect(matchFollowup([{ firstKills: 2, firstDeaths: 7 } as PlayerMatchStats])).toContain('2 opening kills and 7 opening deaths')
    expect(matchFollowup([])).toContain('lineup')
})

test('L21 loadout slot identifiers survive reordered saved arrays', () => {
    const { hp } = matchFixture(), tactics = createDefaultTactics(), reversed = structuredClone(tactics)
    reversed.FULL.ct.playerLoadouts!.reverse()
    const normal = economy(hp), reordered = economy(hp)
    simulationEngineV2.performBuyPhase(hp, normal, 'FULL', true, new SeededRNG(92), tactics)
    simulationEngineV2.performBuyPhase(hp, reordered, 'FULL', true, new SeededRNG(92), reversed)
    expect(reordered).toEqual(normal)
})
