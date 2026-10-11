/**
 * Logotype geometry — one source for the in-game <Logotype> and the static
 * store export (scripts/key-art/render-key-art.ts → public/key-art/logotype.svg).
 *
 * Units are SVG user units; the wordmark is set in Barlow Condensed and the
 * glyph metrics below were measured in Chromium at 100px (canvas measureText,
 * app/fonts/barlow-condensed-latin-{700,800}-normal.woff2). With the font
 * loaded the layout is exact; before it loads the SVG keeps the same box.
 *
 * Two lockups:
 *   stacked  owner trophy + "ESPORTS" tracked to the full width of "MANAGER",
 *            gold rule underneath with an optional subtitle at its right end
 *   inline   owner trophy + "ESPORTS MANAGER" on one line (header / compact)
 */

/** Per-glyph advance and ink bounds at 100px (left/right relative to the glyph origin). */
type Glyph = { ch: string; adv: number; l: number; r: number }

const ESPORTS_700: Glyph[] = [
    { ch: "E", adv: 43.8, l: 4, r: 42 },
    { ch: "S", adv: 44.4, l: 2, r: 43 },
    { ch: "P", adv: 46.5, l: 4, r: 45 },
    { ch: "O", adv: 47.3, l: 3, r: 45 },
    { ch: "R", adv: 47.1, l: 4, r: 46 },
    { ch: "T", adv: 46.8, l: 2, r: 45 },
    { ch: "S", adv: 44.4, l: 2, r: 43 },
]
/** "MANAGER" (800, kerned run): ink from 2 to 345.9, advance 347. */
const MANAGER_800 = { adv: 347, l: 2, r: 345.9 }
/** "ESPORTS" (700, run): ink from 4 to 318.6, advance 320. */
const ESPORTS_700_RUN = { adv: 320, l: 4, r: 318.6 }
/** Cap height / font size for Barlow Condensed 700–800. */
const CAP = 0.71
/** Advance per character of a 700 subtitle run (uppercase average) / font size. */
const SUBTITLE_ADV = 0.445

/** Owner trophy (public/logo.png, 512²): opaque bounds 108–403 × 54–457. */
export const TROPHY_SOURCE = { size: 512, x: 108, y: 54, width: 296, height: 404 } as const

export type GlyphRun = { text: string; x: number; y: number; size: number; weight: 600 | 700 | 800; tone: "primary" | "kicker" | "gold" }

export interface LogotypeLayout {
    viewBox: { x: number; y: number; width: number; height: number }
    /** Where the trophy's opaque bounds sit; the 512² image overflows it with transparent padding. */
    trophy: { x: number; y: number; width: number; height: number }
    /** The 512² trophy image rect that puts the opaque bounds at `trophy`. */
    trophyImage: { x: number; y: number; width: number; height: number }
    kicker: { glyphs: { ch: string; x: number }[]; y: number; size: number; weight: 700 } | null
    primary: GlyphRun[]
    rule: { bar: { x: number; y: number; width: number; height: number }; hairline: { x: number; y: number; width: number; height: number } } | null
    subtitle: GlyphRun & { letterSpacing: number } | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

function trophyAt(x: number, top: number, height: number) {
    const k = height / TROPHY_SOURCE.height
    const trophy = { x, y: top, width: r2(TROPHY_SOURCE.width * k), height: r2(height) }
    const trophyImage = {
        x: r2(x - TROPHY_SOURCE.x * k),
        y: r2(top - TROPHY_SOURCE.y * k),
        width: r2(TROPHY_SOURCE.size * k),
        height: r2(TROPHY_SOURCE.size * k),
    }
    return { trophy, trophyImage }
}

/** Stacked hero lockup. `subtitle` (e.g. "FPS") sits at the right end of the gold rule. */
export function stackedLayout(subtitle?: string): LogotypeLayout {
    const manager = 100
    const kickerSize = 33
    const kickerCap = kickerSize * CAP
    const gap = 15
    const managerTop = kickerCap + gap
    const managerBaseline = managerTop + manager * CAP
    const ruleY = managerBaseline + 19

    const trophyTop = -6
    const trophyHeight = ruleY + 13 - trophyTop
    const { trophy, trophyImage } = trophyAt(0, trophyTop, trophyHeight)
    const wx = r2(trophy.width + 26)
    const inkLeft = wx
    const inkRight = wx + (MANAGER_800.r - MANAGER_800.l) * (manager / 100)

    // "ESPORTS": letters spread so its ink spans exactly the ink of "MANAGER", equal ink gaps.
    const s = kickerSize / 100
    const inkWidths = ESPORTS_700.map(g => (g.r - g.l) * s)
    const gapX = (inkRight - inkLeft - inkWidths.reduce((a, b) => a + b, 0)) / (ESPORTS_700.length - 1)
    const glyphs: { ch: string; x: number }[] = []
    let cursor = inkLeft
    for (const g of ESPORTS_700) {
        glyphs.push({ ch: g.ch, x: r2(cursor - g.l * s) })
        cursor += (g.r - g.l) * s + gapX
    }

    const barWidth = 58
    let subtitleRun: LogotypeLayout["subtitle"] = null
    let hairlineEnd = inkRight
    if (subtitle) {
        const size = 22
        const letterSpacing = 0.22 * size
        const width = subtitle.length * SUBTITLE_ADV * size + (subtitle.length - 1) * letterSpacing
        subtitleRun = { text: subtitle, x: r2(inkRight - width), y: r2(ruleY + (size * CAP) / 2), size, weight: 700, tone: "gold", letterSpacing: r2(letterSpacing) }
        hairlineEnd = inkRight - width - 14
    }

    return {
        viewBox: { x: 0, y: trophyTop, width: r2(inkRight + 2), height: r2(trophyHeight) },
        trophy,
        trophyImage,
        kicker: { glyphs, y: r2(kickerCap), size: kickerSize, weight: 700 },
        primary: [{ text: "MANAGER", x: r2(wx - MANAGER_800.l * (manager / 100)), y: r2(managerBaseline), size: manager, weight: 800, tone: "primary" }],
        rule: {
            bar: { x: wx, y: r2(ruleY - 2.5), width: barWidth, height: 5 },
            hairline: { x: r2(wx + barWidth + 8), y: r2(ruleY - 0.75), width: r2(Math.max(0, hairlineEnd - wx - barWidth - 8)), height: 1.5 },
        },
        subtitle: subtitleRun,
    }
}

/** One-line lockup for headers and compact placements. */
export function inlineLayout(withRule: boolean): LogotypeLayout {
    const size = 100
    const cap = size * CAP
    const trophyHeight = withRule ? 132 : 118
    const { trophy, trophyImage } = trophyAt(0, 0, trophyHeight)
    const textLeft = trophy.width + 24
    const capTop = (trophyHeight - cap) / 2 - (withRule ? 8 : 0)
    const baseline = capTop + cap
    const esportsX = textLeft - ESPORTS_700_RUN.l
    const managerX = esportsX + ESPORTS_700_RUN.adv + 24
    const inkRight = managerX + MANAGER_800.r
    return {
        viewBox: { x: 0, y: 0, width: r2(inkRight + 2), height: trophyHeight },
        trophy,
        trophyImage,
        kicker: null,
        primary: [
            { text: "ESPORTS", x: r2(esportsX), y: r2(baseline), size, weight: 700, tone: "kicker" },
            { text: "MANAGER", x: r2(managerX), y: r2(baseline), size, weight: 800, tone: "primary" },
        ],
        rule: withRule
            ? {
                bar: { x: r2(textLeft), y: r2(baseline + 16), width: 64, height: 6 },
                hairline: { x: r2(textLeft + 72), y: r2(baseline + 18.25), width: r2(inkRight - textLeft - 72), height: 1.5 },
            }
            : null,
        subtitle: null,
    }
}

/** Brand colors used by the lockup (design system v2). */
export const LOGOTYPE_COLORS = {
    primaryTop: "#FFFFFF",
    primaryBottom: "#D3D9E1",
    kicker: "#AEB6C2",
    gold: "#F2B53A",
    goldDeep: "#C98E1E",
} as const
