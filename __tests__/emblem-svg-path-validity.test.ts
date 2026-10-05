/**
 * Regression: the "wave" emblem facet (Tide, team_15_tide) ended its cubic
 * curve on a 2-number fragment, so every dashboard/match render logged
 * `Error: <path> attribute d: Expected number, "...0 30 33 12 57 13Z"`
 * (seen in the L27 packaged week-168 session).
 */
import { EMBLEM_DRAWINGS } from '@/lib/team-emblem-design'

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/** Problems with an SVG path string's command argument counts (empty = valid). */
function pathProblems(d: string): string[] {
    const problems: string[] = []
    const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
    if (!/^[Mm]$/.test(tokens[0] ?? '')) problems.push('must start with M')
    for (let i = 0; i < tokens.length;) {
        const cmd = tokens[i++].toUpperCase()
        if (!(cmd in ARITY)) { problems.push(`unknown command ${cmd}`); continue }
        let n = 0
        while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) { n++; i++ }
        const arity = ARITY[cmd]
        if (arity === 0 ? n !== 0 : n === 0 || n % arity !== 0) problems.push(`${cmd} has ${n} numbers (needs a multiple of ${arity})`)
    }
    return problems
}

test('the validator rejects the shipped broken facet and accepts a well-formed curve', () => {
    expect(pathProblems('M57 13C34 27 31 43 30 57 30 72 49 83 63 86 40 84 24 79 15 71 11 57 20 30 33 12 57 13Z')).not.toHaveLength(0)
    expect(pathProblems('M11 57C20 30 33 12 57 13Z')).toEqual([])
})

test.each(Object.entries(EMBLEM_DRAWINGS))('emblem %s has well-formed SVG paths', (_motif, drawing) => {
    for (const part of ['body', 'facet', 'detail'] as const) {
        expect({ part, problems: pathProblems(drawing[part]) }).toEqual({ part, problems: [] })
    }
})
