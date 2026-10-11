/**
 * Phase 5 stream 5.6: project-made key art (scripts/key-art/render-key-art.ts).
 *
 * The art files exist with the right sizes, stay self-contained (no external
 * references, no third-party marks), the generated title layout is coherent,
 * the logotype geometry is exact, trophy helpers resolve, and packaging keeps
 * the Valve radar overviews and real-event logos out while shipping the new art.
 */
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { minimatch } from "minimatch"
import { inlineLayout, stackedLayout, TROPHY_SOURCE } from "@/components/brand/logotype-geometry"
import { TITLE_HERO_LAYOUT } from "@/components/brand/title-hero-layout"
import { TROPHY_ART_KINDS, trophyArtFor, trophyKindForTournament } from "@/lib/trophy-art"

const ROOT = path.join(__dirname, "..")
const pub = (url: string) => path.join(ROOT, "public", url)

/** Canvas size from a WebP header (VP8X, VP8L or VP8 bitstreams). */
function webpSize(buf: Buffer): { width: number; height: number } {
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw Error("not a WebP file")
    const chunk = buf.toString("ascii", 12, 16)
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) } }
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    throw Error(`unknown WebP chunk ${chunk}`)
}

/** href/src/url() targets inside an SVG that are not data: URIs or fragments. */
function externalRefs(svg: string): string[] {
    const refs = [...svg.matchAll(/(?:href|src)="([^"]+)"/g), ...svg.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/^['"]|['"]$/g, ""))
    return refs.filter(r => !r.startsWith("data:") && !r.startsWith("#"))
}

describe("title key art", () => {
    it("ships a 2560×1440 stage and a table layer matching the generated layout", () => {
        expect(webpSize(readFileSync(pub(TITLE_HERO_LAYOUT.stage.src)))).toEqual({ width: 2560, height: 1440 })
        expect(webpSize(readFileSync(pub(TITLE_HERO_LAYOUT.table.src)))).toEqual({ width: TITLE_HERO_LAYOUT.table.pixelWidth, height: TITLE_HERO_LAYOUT.table.pixelHeight })
        const { left, top, width, height } = TITLE_HERO_LAYOUT.table
        expect(left).toBeGreaterThanOrEqual(0)
        expect(top).toBeGreaterThanOrEqual(0)
        expect(left + width).toBeLessThanOrEqual(100)
        expect(top + height).toBeLessThanOrEqual(100)
        // The table keeps clear of the menu column (left ~30% of the stage).
        expect(left).toBeGreaterThan(30)
        expect(TITLE_HERO_LAYOUT.table.pixelWidth / 2560).toBeCloseTo(width / 100, 3)
    })

    it("puts the radar ping inside the table top, with a sane perspective matrix", () => {
        const poly = TITLE_HERO_LAYOUT.tableTop
        expect(poly).toHaveLength(4)
        for (const p of poly) {
            expect(p.x).toBeGreaterThanOrEqual(0)
            expect(p.x).toBeLessThanOrEqual(100)
            expect(p.y).toBeGreaterThanOrEqual(0)
            expect(p.y).toBeLessThanOrEqual(100)
        }
        const { x, y, matrix, size } = TITLE_HERO_LAYOUT.ping
        let inside = false
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            if ((poly[i].y > y) !== (poly[j].y > y) && x < ((poly[j].x - poly[i].x) * (y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside
        }
        expect(inside).toBe(true)
        expect(size).toBeGreaterThan(2)
        expect(size).toBeLessThan(30)
        const [a, b, c, d] = matrix
        expect(matrix.every(Number.isFinite)).toBe(true)
        // Non-degenerate and not mirrored.
        expect(a * d - b * c).toBeGreaterThan(0.2)
    })

    it("ships a 2560×1440 season splash", () => {
        expect(webpSize(readFileSync(pub("/key-art/season-splash.webp")))).toEqual({ width: 2560, height: 1440 })
    })

    it("keeps all new shipped art within the 4 MB budget", () => {
        const files = ["key-art", "trophy-art"].flatMap(dir => readdirSync(path.join(ROOT, "public", dir)).map(f => path.join(ROOT, "public", dir, f)))
        const total = files.reduce((sum, f) => sum + statSync(f).size, 0)
        expect(files.length).toBeGreaterThanOrEqual(18)
        expect(total).toBeLessThan(4 * 1024 * 1024)
    })
})

describe("logotype", () => {
    it("static SVG is self-contained: fonts and trophy embedded, no external references", () => {
        const svg = readFileSync(pub("/key-art/logotype.svg"), "utf8")
        expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 1280 300"/)
        expect(svg).toContain("<title>Esports Manager</title>")
        expect((svg.match(/@font-face\{font-family:'Barlow Condensed'/g) ?? []).length).toBe(2)
        expect(svg).toMatch(/<image href="data:image\/png;base64,/)
        expect(externalRefs(svg)).toEqual([])
        // No third-party marks in the markup or text (base64 payloads stripped first).
        expect(svg.replace(/data:[^)"]+/g, "")).not.toMatch(/CS2|Counter-Strike|Valve/i)
        expect(statSync(pub("/key-art/logotype.svg")).size).toBeLessThan(512 * 1024) // Electron boot page limit
    })

    it("stacked lockup: ESPORTS spans exactly the ink of MANAGER", () => {
        const l = stackedLayout()
        const kicker = l.kicker!
        const s = kicker.size / 100
        // First glyph E (ink from 4) and last S (ink to 43) at 100px.
        const inkLeft = kicker.glyphs[0].x + 4 * s
        const inkRight = kicker.glyphs[kicker.glyphs.length - 1].x + 43 * s
        const managerLeft = l.primary[0].x + 2
        const managerRight = l.primary[0].x + 345.9
        expect(kicker.glyphs.map(g => g.ch).join("")).toBe("ESPORTS")
        expect(inkLeft).toBeCloseTo(managerLeft, 1)
        expect(inkRight).toBeCloseTo(managerRight, 1)
        expect(l.rule!.bar.x).toBeCloseTo(managerLeft, 1)
        expect(l.viewBox.x + l.viewBox.width).toBeGreaterThanOrEqual(managerRight)
    })

    it("subtitle sits at the right end of the rule and the trophy keeps its proportions", () => {
        const l = stackedLayout("FPS")
        const rule = l.rule!
        expect(l.subtitle!.text).toBe("FPS")
        expect(rule.hairline.x + rule.hairline.width).toBeLessThan(l.subtitle!.x)
        expect(l.trophy.width / l.trophy.height).toBeCloseTo(TROPHY_SOURCE.width / TROPHY_SOURCE.height, 3)
        for (const layout of [l, inlineLayout(true), inlineLayout(false)]) {
            expect(layout.trophy.y).toBeGreaterThanOrEqual(layout.viewBox.y)
            expect(layout.trophy.y + layout.trophy.height).toBeLessThanOrEqual(layout.viewBox.y + layout.viewBox.height + 0.01)
        }
        expect(inlineLayout(false).rule).toBeNull()
        expect(inlineLayout(true).primary.map(r => r.text)).toEqual(["ESPORTS", "MANAGER"])
    })
})

describe("trophy art", () => {
    it.each(TROPHY_ART_KINDS)("%s resolves to a 512² WebP and a pure SVG", kind => {
        const art = trophyArtFor(kind)
        expect(art.kind).toBe(kind)
        expect(webpSize(readFileSync(pub(art.src)))).toEqual({ width: 512, height: 512 })
        const svg = readFileSync(pub(art.svg), "utf8")
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 512 512"/)
        expect(svg).not.toMatch(/<image|<text|@font-face/)
        expect(externalRefs(svg)).toEqual([])
        expect(art.label.length).toBeGreaterThan(5)
    })

    it("uses distinct metals per tier", () => {
        expect(["major", "S", "A", "B", "C"].map(k => trophyArtFor(k as never).metal)).toEqual(["gold", "gold", "silver", "bronze", "pewter"])
        expect(new Set(TROPHY_ART_KINDS.map(k => trophyArtFor(k).src)).size).toBe(TROPHY_ART_KINDS.length)
    })

    it("maps tournaments to art kinds", () => {
        expect(trophyKindForTournament("S")).toBe("S")
        expect(trophyKindForTournament("A_TIER")).toBe("A")
        expect(trophyKindForTournament("b_tier")).toBe("B")
        expect(trophyKindForTournament("C")).toBe("C")
        expect(trophyKindForTournament("S", { major: true })).toBe("major")
        expect(trophyKindForTournament("B_TIER", { league: true })).toBe("league")
        expect(trophyKindForTournament(undefined)).toBe("C")
        expect(trophyKindForTournament("PLATINUM")).toBe("C")
    })
})

describe("packaging", () => {
    const patterns: string[] = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).build.files
    const shipped = (file: string) =>
        patterns.some(p => !p.startsWith("!") && minimatch(file, p, { dot: true })) &&
        !patterns.some(p => p.startsWith("!") && minimatch(file, p.slice(1), { dot: true }))

    it("keeps Valve radar overviews and real-event tournament logos out of the build", () => {
        const valve = readdirSync(pub("/maps")).filter(f => /radar_psd/.test(f))
        expect(valve.length).toBeGreaterThan(0)
        for (const f of valve) expect(shipped(`public/maps/${f}`)).toBe(false)
        const brands = readdirSync(pub("/assets/tournaments")).filter(f => /^logo_(cct|perfect_world|copenhagen_major|shanghai_major)\./.test(f))
        expect(brands.length).toBeGreaterThan(0)
        for (const f of brands) expect(shipped(`public/assets/tournaments/${f}`)).toBe(false)
    })

    it("ships the new art, the baked radar art and the fictional tournament logos", () => {
        for (const dir of ["key-art", "trophy-art", "radar-art"]) {
            for (const f of readdirSync(pub(`/${dir}`))) expect(shipped(`public/${dir}/${f}`)).toBe(true)
        }
        expect(shipped("public/assets/tournaments/logo_northern_major_2025.webp")).toBe(true)
        expect(shipped("public/logo.png")).toBe(true)
    })

    it("no runtime code references the excluded files", () => {
        const sources = ["lib/radar-art.ts", "store/slices/debug-slice.ts", "app/main-menu/page.tsx", "components/brand/TitleHero.tsx"]
        for (const f of sources) {
            const text = readFileSync(path.join(ROOT, f), "utf8")
            // File references only (doc comments may name the excluded pattern).
            expect(text).not.toMatch(/maps\/de_\w*radar_psd\w*\.png|logo_(cct|perfect_world|copenhagen_major|shanghai_major)\.|match-command-arena/)
        }
    })
})
