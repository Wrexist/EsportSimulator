/**
 * Regression (revamp audit 2026-10-09, §6): /staff requested
 * /assets/flags/uk.svg and /fpl requested /assets/flags/at.svg, both 404.
 * Every nationality the game can show must resolve to a flag file that
 * exists, or to a labelled glyph (regions, deliberately missing flags).
 */
import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Flag } from '@/src/components/ui/Flag'

const flagDir = path.join(process.cwd(), 'public/assets/flags')
const html = (code: string) => renderToStaticMarkup(<Flag code={code} />)
const flagSrc = (code: string) => html(code).match(/\/assets\/flags\/([a-z]{2})\.svg/)?.[1] ?? null

test('UK maps to the gb flag and Austria has a flag file', () => {
    expect(flagSrc('UK')).toBe('gb')
    expect(flagSrc('United Kingdom')).toBe('gb')
    expect(flagSrc('Austria')).toBe('at')
    expect(fs.existsSync(path.join(flagDir, 'at.svg'))).toBe(true)
})

test('tournament regions render a labelled glyph, not "?"', () => {
    for (const region of ['EU', 'NA', 'ASIA', 'INTERNATIONAL', 'MENA', 'CIS']) {
        const out = html(region)
        expect(out).not.toContain('/assets/flags/')
        expect(out).not.toContain('aria-label="?"')
    }
})

test('every nationality in the game data resolves to an existing flag file or a glyph', () => {
    const names = new Set<string>()
    const scanJson = (rel: string) => {
        const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
        for (const m of text.matchAll(/"nationality"\s*:\s*"([^"]+)"/g)) names.add(m[1])
    }
    scanJson('public/data/snapshot/players.json')
    const scanTs = (rel: string, re: RegExp) => {
        const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8')
        for (const m of text.matchAll(re)) m[1].split(',').map(s => s.replace(/["'\s]+/g, ' ').trim()).filter(Boolean).forEach(n => names.add(n))
    }
    scanTs('engine/staff-generator.ts', /NATIONALITIES = \[([^\]]+)\]/g)
    scanTs('engine/data-generator.ts', /private static nationalities = \[([^\]]+)\]/g)
    scanTs('engine/fpl-player-generator.ts', /nationalities:\s*\[([^\]]+)\]/g)
    scanTs('engine/prospect-generator.ts', /nationalities:\s*\[([^\]]+)\]/g)
    scanTs('engine/staff-db.ts', /"nationality":\s*"([^"]+)"/g)
    scanTs('engine/legendary-players-data.ts', /nationality:\s*"([^"]+)"/g)

    const broken: string[] = []
    for (const name of names) {
        const out = html(name)
        if (out.includes('aria-label="?"')) { broken.push(`${name}: unresolved`); continue }
        const code = flagSrc(name)
        if (code && !fs.existsSync(path.join(flagDir, `${code}.svg`))) broken.push(`${name}: missing ${code}.svg`)
    }
    expect(broken).toEqual([])
    expect(names.size).toBeGreaterThan(40)
})
