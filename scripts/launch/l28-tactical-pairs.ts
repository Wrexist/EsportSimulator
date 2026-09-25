import fs from 'node:fs'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { createLaunchFixture } from './fixtures'
import { getActivePlayersByRosterOrder } from '../../lib/live-match-builders'
import { simulationEngineV2 } from '../../engine/match-simulation'
import { MapId } from '../../types/enums'
import type { Team, Match } from '../../types'

const styles = ['aggressive', 'structured', 'balanced'] as const
const fixture = createLaunchFixture('first-week', 28001)
const hp = getActivePlayersByRosterOrder(fixture.teams[0], fixture.players)
const ap = hp.map((player, i) => ({ ...structuredClone(player), id: `l28_opponent_${i}` }))
const results: Array<{ seed: number; homeStyle: string; awayStyle: string; homeWon: boolean; homeRounds?: number; awayRounds?: number; hash: string }> = []
for (let seed = 28001; seed <= 28030; seed++) {
    for (const homeStyle of styles) for (const awayStyle of styles) {
        const home = { ...structuredClone(fixture.teams[0]), playstyle: homeStyle } as unknown as Team
        const away = { ...structuredClone(fixture.teams[0]), id: 'l28_opponent', rosterIds: ap.map(p => p.id), playstyle: awayStyle } as unknown as Team
        const match = { ...fixture.scheduledMatches[0], seed, homeTeamId: home.id, awayTeamId: away.id,
            maps: [MapId.MIRAGE], mapStartingSides: { [MapId.MIRAGE]: seed % 2 ? home.id : away.id } } as unknown as Match
        const result = simulationEngineV2.simulateMatch(match, home, away, structuredClone(hp), structuredClone(ap))
        assert.ok(result.winnerId && [home.id, away.id].includes(result.winnerId))
        const map = result.maps[0]
        results.push({ seed, homeStyle, awayStyle, homeWon: result.winnerId === home.id, homeRounds: map.homeScore, awayRounds: map.awayScore,
            hash: crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex') })
    }
}
const groups = styles.flatMap(homeStyle => styles.map(awayStyle => {
    const rows = results.filter(r => r.homeStyle === homeStyle && r.awayStyle === awayStyle)
    const n = rows.length, wins = rows.filter(r => r.homeWon).length, p = wins / n, z = 1.96
    const denominator = 1 + z * z / n, center = (p + z * z / (2 * n)) / denominator
    const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return { homeStyle, awayStyle, n, wins, winRate: p, wilson95: [center - half, center + half] }
}))
fs.writeFileSync('docs/launch-readiness/evidence/L28-tactical-pairs.json', JSON.stringify({ seeds: 30, matches: results.length, groups, results,
    limitation: 'Legacy aggregate BO1 Mirage simulation; mirrored player abilities, equal clubs, alternating CT starts and common seeds. No spatial 5v5 integration, live utility calibration or human tactical acceptance. Small sample intervals are descriptive; nine comparisons are not independent proof of superiority.' }, null, 2))
console.log(JSON.stringify(groups))
