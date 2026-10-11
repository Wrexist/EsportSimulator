/**
 * Project-made trophy art: pure SVG built from code (no images, no fonts).
 * Rendered by scripts/key-art/render-key-art.ts to public/trophy-art/<kind>.svg
 * and a 512² WebP. The kinds match lib/trophy-art.ts.
 *
 * Metal is faked the classic way: every turned part (bowl, stem, foot) gets a
 * horizontal "lathe" gradient with two speculars, then a vertical light/shade
 * overlay. Silhouettes differ per tier so they read at thumbnail size.
 */

export type TrophyArtKind = "major" | "S" | "A" | "B" | "C" | "league" | "award"
export type Metal = "gold" | "silver" | "bronze" | "pewter"

const C = 256 // centre x

const LATHE: Record<Metal, string[]> = {
    gold: ["#4A2F08", "#8C5B16", "#E2A93F", "#FFF0C4", "#F6C35A", "#C48521", "#F0B549", "#9A6416", "#3E2706"],
    silver: ["#2E333A", "#5F6872", "#C2CAD3", "#FFFFFF", "#D9DFE6", "#8A949F", "#C9D0D8", "#66707B", "#262A30"],
    bronze: ["#3A1D0B", "#6F3B1B", "#C58552", "#FFD9B0", "#D99A62", "#94552A", "#C98A55", "#6E3C1D", "#2C1508"],
    pewter: ["#24282E", "#464D56", "#8B939D", "#D6DBE1", "#A4ACB6", "#5F6771", "#8E96A0", "#4A5159", "#1D2025"],
}
const LATHE_STOPS = [0, 0.1, 0.24, 0.33, 0.4, 0.55, 0.7, 0.82, 1]
/** Mid and deep tones per metal for engraving, rims and interiors. */
const TONE: Record<Metal, { mid: string; deep: string; light: string }> = {
    gold: { mid: "#C48521", deep: "#5A3A0C", light: "#FFE7A8" },
    silver: { mid: "#8A949F", deep: "#3A4048", light: "#F4F6F9" },
    bronze: { mid: "#94552A", deep: "#4A240E", light: "#F7C99C" },
    pewter: { mid: "#5F6771", deep: "#2A2F35", light: "#C9CFD6" },
}

function defs(metal: Metal, extra = ""): string {
    const lathe = LATHE[metal].map((c, i) => `<stop offset="${LATHE_STOPS[i]}" stop-color="${c}"/>`).join("")
    const t = TONE[metal]
    return `<defs>
<linearGradient id="lathe" x1="0" y1="0" x2="1" y2="0">${lathe}</linearGradient>
<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22"/><stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.38"/></linearGradient>
<linearGradient id="inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.deep}"/><stop offset="1" stop-color="${t.mid}"/></linearGradient>
<linearGradient id="ebony" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#323B49"/><stop offset="0.5" stop-color="#1A2029"/><stop offset="1" stop-color="#0E1217"/></linearGradient>
<linearGradient id="ebonySide" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/><stop offset="0.82" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>
<radialGradient id="floor" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<linearGradient id="spec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.25" stop-color="#FFFFFF" stop-opacity="0.75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
${extra}
</defs>`
}

/** A turned part: lathe fill + light/shade overlay + thin dark outline. */
function turned(d: string, outline = 0.6): string {
    return `<path d="${d}" fill="url(#lathe)"/><path d="${d}" fill="url(#shade)"/><path d="${d}" fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="${outline}"/>`
}

function floorShadow(y: number, rx: number): string {
    return `<ellipse cx="${C}" cy="${y}" rx="${rx}" ry="${Math.round(rx * 0.09)}" fill="url(#floor)"/>`
}

/** Ebony plinth: `tiers` blocks from `top` down to `bottom`, metal trim on each. */
function plinth(top: number, bottom: number, widths: number[], metal: Metal, plate: boolean): string {
    const t = TONE[metal]
    const h = (bottom - top) / widths.length
    let out = ""
    widths.forEach((w, i) => {
        const y = top + i * h
        out += `<rect x="${C - w}" y="${y}" width="${w * 2}" height="${h}" rx="3" fill="url(#ebony)"/>`
        out += `<rect x="${C - w}" y="${y}" width="${w * 2}" height="${h}" rx="3" fill="url(#ebonySide)"/>`
        out += `<rect x="${C - w + 0.5}" y="${y + 0.5}" width="${w * 2 - 1}" height="${h - 1}" rx="3" fill="none" stroke="#FFFFFF" stroke-opacity="0.09"/>`
        out += `<rect x="${C - w}" y="${y}" width="${w * 2}" height="3" fill="url(#lathe)"/>`
        out += `<rect x="${C - w + 2}" y="${y + 3}" width="${w * 2 - 4}" height="1" fill="#FFFFFF" fill-opacity="0.10"/>`
    })
    if (plate) {
        const y = top + h * (widths.length - 1) + h * 0.28
        const pw = Math.min(widths[widths.length - 1] * 0.55, 62)
        const ph = h * 0.46
        out += `<rect x="${C - pw}" y="${y}" width="${pw * 2}" height="${ph}" rx="2" fill="url(#lathe)"/>`
        out += `<rect x="${C - pw}" y="${y}" width="${pw * 2}" height="${ph}" rx="2" fill="url(#shade)"/>`
        out += `<rect x="${C - pw * 0.62}" y="${y + ph * 0.34}" width="${pw * 1.24}" height="1.6" rx="0.8" fill="${t.deep}" fill-opacity="0.75"/>`
        out += `<rect x="${C - pw * 0.4}" y="${y + ph * 0.62}" width="${pw * 0.8}" height="1.4" rx="0.7" fill="${t.deep}" fill-opacity="0.55"/>`
    }
    return out
}

/** Five-point star with alternating light/dark facets (embossed). */
function facetedStar(cx: number, cy: number, ro: number, metal: Metal, ri = ro * 0.42): string {
    const t = TONE[metal]
    const pts: [number, number][] = []
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? ro : ri
        pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    let out = ""
    for (let i = 0; i < 10; i++) {
        const [x1, y1] = pts[i]
        const [x2, y2] = pts[(i + 1) % 10]
        // Light from the upper left: facets facing that way are bright.
        const mx = (x1 + x2) / 2 - cx, my = (y1 + y2) / 2 - cy
        const lit = -mx * 0.7 - my * 0.7 > 0
        out += `<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} L${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${lit ? t.light : t.mid}"/>`
    }
    out += `<path d="M${pts.map(p => p.map(n => n.toFixed(2)).join(",")).join(" L")} Z" fill="none" stroke="${t.deep}" stroke-width="0.8" stroke-opacity="0.8"/>`
    return out
}

/** Laurel branch along an arc; `dir` 1 = clockwise. */
function laurel(cx: number, cy: number, r: number, from: number, to: number, count: number, len: number, wid: number, fill: string, stroke: string): string {
    let out = ""
    for (let i = 0; i < count; i++) {
        const a = from + ((to - from) * i) / (count - 1)
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        // Leaf tip (local −y) along the growth direction, splayed to both sides; smaller near the tip.
        const along = (a * 180) / Math.PI + (to > from ? 180 : 0)
        const k = 1 - 0.35 * (i / (count - 1))
        for (const side of [-1, 1]) {
            const rot = along + side * 38
            const l = len * k, w = wid * k
            out += `<path transform="translate(${x.toFixed(2)},${y.toFixed(2)}) rotate(${rot.toFixed(1)})" d="M0,0 C${w * 1.2},${(-l * 0.3).toFixed(2)} ${w * 0.9},${(-l * 0.8).toFixed(2)} 0,${-l.toFixed(2)} C${-w * 0.9},${(-l * 0.8).toFixed(2)} ${-w * 1.2},${(-l * 0.3).toFixed(2)} 0,0 Z" fill="${fill}" stroke="${stroke}" stroke-width="0.7"/>`
        }
    }
    const x0 = cx + r * Math.cos(from), y0 = cy + r * Math.sin(from)
    const x1 = cx + r * Math.cos(to), y1 = cy + r * Math.sin(to)
    const sweep = to > from ? 1 : 0
    out = `<path d="M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 ${sweep} ${x1.toFixed(2)},${y1.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="1.6"/>` + out
    return out
}

/** Thick metal handle stroke with a highlight. */
function handle(d: string, width: number, metal: Metal): string {
    const t = TONE[metal]
    return `<path d="${d}" fill="none" stroke="${t.deep}" stroke-width="${width + 2.5}" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="url(#handleGrad)" stroke-width="${width}" stroke-linecap="round"/>
<path d="${d}" fill="none" stroke="${t.light}" stroke-opacity="0.75" stroke-width="${Math.max(1.2, width * 0.18)}" stroke-linecap="round" transform="translate(-1,-1.5)"/>`
}

function handleGrad(metal: Metal): string {
    const l = LATHE[metal]
    return `<linearGradient id="handleGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l[3]}"/><stop offset="0.35" stop-color="${l[2]}"/><stop offset="0.7" stop-color="${l[5]}"/><stop offset="1" stop-color="${l[7]}"/></linearGradient>`
}

/** Bowl rim: outer lip and dark opening. */
function rim(y: number, rx: number, metal: Metal): string {
    const t = TONE[metal]
    return `<ellipse cx="${C}" cy="${y}" rx="${rx}" ry="${Math.max(6, rx * 0.12)}" fill="url(#lathe)" stroke="#000" stroke-opacity="0.3" stroke-width="0.6"/>
<ellipse cx="${C}" cy="${y + 0.8}" rx="${rx - 6}" ry="${Math.max(4, rx * 0.12 - 3)}" fill="url(#inside)"/>
<ellipse cx="${C}" cy="${y + 0.8}" rx="${rx - 6}" ry="${Math.max(4, rx * 0.12 - 3)}" fill="none" stroke="${t.light}" stroke-opacity="0.45" stroke-width="0.8"/>`
}

/** Engraved band following the bowl curvature. */
function band(y: number, halfWidth: number, sag: number, metal: Metal): string {
    const t = TONE[metal]
    return `<path d="M${C - halfWidth},${y} Q${C},${y + sag} ${C + halfWidth},${y}" fill="none" stroke="${t.deep}" stroke-opacity="0.75" stroke-width="1.6"/>
<path d="M${C - halfWidth},${y + 2.2} Q${C},${y + sag + 2.2} ${C + halfWidth},${y + 2.2}" fill="none" stroke="${t.light}" stroke-opacity="0.55" stroke-width="1"/>`
}

/** Specular streak on a bowl, slightly blurred. */
function streak(x: number, top: number, bottom: number, w: number): string {
    return `<path d="M${x},${top} C${x - w},${(top + bottom) / 2} ${x - w * 0.6},${bottom - 10} ${x + w * 0.2},${bottom} C${x},${bottom - 14} ${x + w * 0.1},${(top + bottom) / 2} ${x + w * 0.9},${top} Z" fill="url(#spec)" opacity="0.55" filter="url(#soft)"/>`
}

function svg(body: string, metal: Metal, extraDefs = ""): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
${defs(metal, extraDefs)}
${body}
</svg>
`
}

// ─── Cups ────────────────────────────────────────────────────────────────

function majorCup(): string {
    const m: Metal = "gold"
    // Bowl: rim y 144 (±96), belly ±104 near y 196, base ±34 at 292.
    const bowlPath = "M160,144 C152,204 172,262 222,292 L290,292 C340,262 360,204 352,144 Z"
    const lid = "M170,138 C178,104 214,86 256,84 C298,86 334,104 342,138 Z"
    const finial = "M248,84 C246,70 240,62 244,52 C248,44 252,40 256,30 C260,40 264,44 268,52 C272,62 266,70 264,84 Z"
    const knob = "M232,300 C236,292 276,292 280,300 C284,310 280,318 272,322 L240,322 C232,318 228,310 232,300 Z"
    const stem = "M238,322 C244,336 244,352 236,364 L276,364 C268,352 268,336 274,322 Z"
    const node = "M228,362 C232,354 280,354 284,362 C288,372 280,380 270,382 L242,382 C232,380 224,372 228,362 Z"
    const foot = "M244,380 C240,392 214,398 180,404 L332,404 C298,398 272,392 268,380 Z"
    const hR = "M346,160 C424,132 440,214 378,236 C356,244 342,252 330,270"
    const hL = "M166,160 C88,132 72,214 134,236 C156,244 170,252 182,270"
    const curlR = "M378,236 C396,228 404,212 392,204"
    const curlL = "M134,236 C116,228 108,212 120,204"
    const body = `${floorShadow(474, 170)}
${plinth(404, 470, [102, 128], m, true)}
${turned(foot)}<ellipse cx="${C}" cy="404" rx="76" ry="5" fill="url(#lathe)"/>
${turned(node)}${turned(stem)}${turned(knob)}
${handle(hR, 11, m)}${handle(hL, 11, m)}${handle(curlR, 7, m)}${handle(curlL, 7, m)}
${turned(bowlPath, 0.8)}
${band(176, 98, 10, m)}${band(270, 52, 6, m)}
${laurel(C, 214, 40, Math.PI * 0.6, Math.PI * 1.12, 6, 15, 5, TONE[m].light, TONE[m].deep)}
${laurel(C, 214, 40, Math.PI * 0.4, Math.PI * -0.12, 6, 15, 5, TONE[m].light, TONE[m].deep)}
${facetedStar(C, 212, 21, m)}
${streak(196, 160, 270, 14)}
${rim(144, 98, m)}
${turned(lid, 0.8)}
<path d="M182,128 C200,106 228,96 256,95" fill="none" stroke="${TONE[m].light}" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round"/>
<ellipse cx="${C}" cy="138" rx="88" ry="7" fill="url(#lathe)" stroke="#000" stroke-opacity="0.3" stroke-width="0.6"/>
${turned(finial)}<circle cx="${C}" cy="86" r="10" fill="url(#lathe)" stroke="#000" stroke-opacity="0.3" stroke-width="0.6"/>`
    return svg(body, m, handleGrad(m))
}

function sCup(): string {
    const m: Metal = "gold"
    const bowl = "M166,150 C160,214 180,272 228,300 L284,300 C332,272 352,214 346,150 Z"
    const stem = "M242,300 C246,314 246,326 238,338 C232,346 236,354 244,358 C248,366 246,372 242,378 L270,378 C266,372 264,366 268,358 C276,354 280,346 274,338 C266,326 266,314 270,300 Z"
    const foot = "M246,376 C240,388 214,394 186,402 L326,402 C298,394 272,388 266,376 Z"
    const hR = "M340,168 C410,150 418,236 352,256 C340,260 330,266 322,276"
    const hL = "M172,168 C102,150 94,236 160,256 C172,260 182,266 190,276"
    const body = `${floorShadow(472, 160)}
${plinth(402, 468, [96, 118], m, true)}
${turned(foot)}<ellipse cx="${C}" cy="402" rx="70" ry="5" fill="url(#lathe)"/>
${turned(stem)}
${handle(hR, 11, m)}${handle(hL, 11, m)}
${turned(bowl, 0.8)}
${band(186, 90, 9, m)}${band(194, 90, 9, m)}
${facetedStar(C, 240, 26, m)}
${streak(200, 168, 282, 14)}
${rim(150, 92, m)}`
    return svg(body, m, handleGrad(m))
}

function aCup(): string {
    const m: Metal = "silver"
    // Tulip bowl: flared lip, narrow waist.
    const bowl = "M176,132 C186,152 184,190 196,226 C206,256 224,278 236,290 L276,290 C288,278 306,256 316,226 C328,190 326,152 336,132 Z"
    const stem = "M244,290 C248,312 248,334 244,356 L268,356 C264,334 264,312 268,290 Z"
    const knob = "M236,318 C240,310 272,310 276,318 C280,326 272,332 264,334 L248,334 C240,332 232,326 236,318 Z"
    const foot = "M246,354 C240,370 218,382 192,394 L320,394 C294,382 272,370 266,354 Z"
    const hR = "M318,178 C362,170 368,226 324,240"
    const hL = "M194,178 C150,170 144,226 188,240"
    const body = `${floorShadow(470, 150)}
${plinth(394, 466, [86, 108], m, true)}
${turned(foot)}<ellipse cx="${C}" cy="394" rx="64" ry="4.5" fill="url(#lathe)"/>
${turned(stem)}${turned(knob)}
${handle(hR, 8, m)}${handle(hL, 8, m)}
${turned(bowl, 0.8)}
${band(212, 62, 7, m)}
${facetedStar(C, 246, 18, m)}
${streak(214, 150, 270, 11)}
${rim(132, 80, m)}`
    return svg(body, m, handleGrad(m))
}

function bCup(): string {
    const m: Metal = "bronze"
    // Coupe: wide, shallow bowl on a short stem; no handles.
    const bowl = "M148,190 C150,236 196,270 236,280 L276,280 C316,270 362,236 364,190 Z"
    const stem = "M244,280 C250,300 250,322 244,344 L268,344 C262,322 262,300 268,280 Z"
    const node = "M234,316 C238,306 274,306 278,316 C282,326 274,332 266,334 L246,334 C238,332 230,326 234,316 Z"
    const foot = "M246,342 C238,360 214,372 186,386 L326,386 C298,372 274,360 266,342 Z"
    const body = `${floorShadow(466, 150)}
${plinth(386, 462, [118], m, true)}
${turned(foot)}<ellipse cx="${C}" cy="386" rx="70" ry="5" fill="url(#lathe)"/>
${turned(stem)}${turned(node)}
${turned(bowl, 0.8)}
${band(214, 104, 12, m)}
${facetedStar(C, 246, 16, m)}
${streak(206, 198, 262, 12)}
${rim(190, 108, m)}`
    return svg(body, m)
}

function cCup(): string {
    const m: Metal = "pewter"
    // Small straight-sided cup with ring handles on a single block.
    const bowl = "M196,196 C198,250 210,288 236,304 L276,304 C302,288 314,250 316,196 Z"
    const stem = "M246,304 C250,318 250,330 246,344 L266,344 C262,330 262,318 266,304 Z"
    const foot = "M248,342 C242,356 224,366 202,376 L310,376 C288,366 270,356 264,342 Z"
    const hR = "M312,214 C344,212 346,252 314,256"
    const hL = "M200,214 C168,212 166,252 198,256"
    const body = `${floorShadow(462, 130)}
${plinth(376, 458, [100], m, true)}
${turned(foot)}<ellipse cx="${C}" cy="376" rx="54" ry="4" fill="url(#lathe)"/>
${turned(stem)}
${handle(hR, 7, m)}${handle(hL, 7, m)}
${turned(bowl, 0.8)}
${band(226, 58, 6, m)}${band(286, 34, 4, m)}
${streak(222, 210, 290, 10)}
${rim(196, 60, m)}`
    return svg(body, m, handleGrad(m))
}

// ─── League shield ───────────────────────────────────────────────────────

function leagueShield(): string {
    const m: Metal = "silver"
    const g: Metal = "gold"
    const outer = "M140,92 C190,84 222,76 256,62 C290,76 322,84 372,92 L372,210 C372,288 320,340 256,372 C192,340 140,288 140,210 Z"
    const inner = "M156,106 C200,99 228,92 256,80 C284,92 312,99 356,106 L356,210 C356,278 310,324 256,352 C202,324 156,278 156,210 Z"
    const enamel = `<linearGradient id="enamel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D2633"/><stop offset="1" stop-color="#0C1016"/></linearGradient>
<linearGradient id="goldLathe" x1="0" y1="0" x2="1" y2="0">${LATHE.gold.map((c, i) => `<stop offset="${LATHE_STOPS[i]}" stop-color="${c}"/>`).join("")}</linearGradient>`
    const chevron = "M196,250 L256,214 L316,250 L316,268 L256,232 L196,268 Z"
    const body = `${floorShadow(470, 140)}
${plinth(404, 466, [92, 114], m, true)}
<path d="M240,368 L272,368 L280,404 L232,404 Z" fill="url(#lathe)"/><path d="M240,368 L272,368 L280,404 L232,404 Z" fill="url(#shade)"/>
${turned(outer, 1)}
<path d="${inner}" fill="url(#enamel)"/>
<path d="${inner}" fill="none" stroke="url(#goldLathe)" stroke-width="3"/>
<path d="M164,112 C204,106 230,99 256,88" fill="none" stroke="#FFFFFF" stroke-opacity="0.12" stroke-width="2"/>
<g>${laurel(C, 212, 76, Math.PI * 0.62, Math.PI * 1.15, 7, 22, 7, TONE[g].light, TONE[g].deep)}
${laurel(C, 212, 76, Math.PI * 0.38, Math.PI * -0.15, 7, 22, 7, TONE[g].light, TONE[g].deep)}</g>
<path d="${chevron}" fill="url(#goldLathe)" stroke="${TONE[g].deep}" stroke-width="0.8"/>
<path d="${chevron}" transform="translate(0,26)" fill="url(#goldLathe)" stroke="${TONE[g].deep}" stroke-width="0.8" opacity="0.85"/>
${facetedStar(C, 168, 26, g)}`
    return svg(body, m, enamel)
}

// ─── Award medal ─────────────────────────────────────────────────────────

function awardMedal(): string {
    const m: Metal = "gold"
    const ribbon = `<linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#16202E"/><stop offset="0.5" stop-color="#2A3A52"/><stop offset="1" stop-color="#121A26"/></linearGradient>
<radialGradient id="disc" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#FFF0C4"/><stop offset="0.35" stop-color="#F2B53A"/><stop offset="0.75" stop-color="#B07418"/><stop offset="1" stop-color="#5A3A0C"/></radialGradient>
<radialGradient id="field" cx="0.5" cy="0.42" r="0.62"><stop offset="0" stop-color="#E9AE45"/><stop offset="0.7" stop-color="#C48521"/><stop offset="1" stop-color="#8C5B16"/></radialGradient>`
    const strapL = "M150,26 L218,26 L284,204 L236,214 Z"
    const strapR = "M362,26 L294,26 L228,204 L276,214 Z"
    const cx = C, cy = 318, R = 120
    const rings = [0.86, 0.8].map(k => `<circle cx="${cx}" cy="${cy}" r="${(R * k).toFixed(1)}" fill="none" stroke="${TONE[m].deep}" stroke-opacity="0.45" stroke-width="1.2"/>`).join("")
    const body = `<ellipse cx="${C}" cy="470" rx="110" ry="9" fill="url(#floor)"/>
<path d="${strapL}" fill="url(#ribbon)"/><path d="${strapR}" fill="url(#ribbon)"/>
<path d="M178,26 L190,26 L262,208 L252,210 Z" fill="${TONE[m].mid}"/>
<path d="M334,26 L322,26 L250,208 L260,210 Z" fill="${TONE[m].mid}"/>
<path d="${strapL}" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1.2"/><path d="${strapR}" fill="none" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1.2"/>
<rect x="226" y="190" width="60" height="16" rx="4" fill="url(#lathe)"/><rect x="226" y="190" width="60" height="16" rx="4" fill="url(#shade)"/>
<circle cx="${cx}" cy="${cy - R - 2}" r="11" fill="none" stroke="url(#lathe)" stroke-width="7"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#disc)" stroke="#000" stroke-opacity="0.35" stroke-width="1"/>
<circle cx="${cx}" cy="${cy}" r="${R * 0.9}" fill="url(#field)"/>
<circle cx="${cx}" cy="${cy}" r="${R * 0.9}" fill="none" stroke="${TONE[m].light}" stroke-opacity="0.55" stroke-width="1.5"/>
${rings}
${laurel(cx, cy, R * 0.68, Math.PI * 0.6, Math.PI * 1.18, 7, 24, 8, TONE[m].light, TONE[m].deep)}
${laurel(cx, cy, R * 0.68, Math.PI * 0.4, Math.PI * -0.18, 7, 24, 8, TONE[m].light, TONE[m].deep)}
${facetedStar(cx, cy - 6, 42, m)}
<path d="M${cx - R * 0.7},${cy - R * 0.5} A${R * 0.86},${R * 0.86} 0 0 1 ${cx + R * 0.2},${cy - R * 0.84}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" filter="url(#soft)"/>`
    return svg(body, m, ribbon)
}

export const TROPHY_ART_KINDS: TrophyArtKind[] = ["major", "S", "A", "B", "C", "league", "award"]

export function trophySvg(kind: TrophyArtKind): string {
    switch (kind) {
        case "major": return majorCup()
        case "S": return sCup()
        case "A": return aCup()
        case "B": return bCup()
        case "C": return cCup()
        case "league": return leagueShield()
        case "award": return awardMedal()
    }
}
