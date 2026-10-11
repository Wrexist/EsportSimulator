#!/usr/bin/env tsx
/**
 * Project-made key art (Phase 5 stream 5.6). No AI generation, no third-party images.
 *
 *   npx tsx scripts/key-art/render-key-art.ts                    # everything
 *   npx tsx scripts/key-art/render-key-art.ts title trophies     # some sections
 *   npx tsx scripts/key-art/render-key-art.ts --review           # also previews in tmp/phase5/key-art
 *
 * Sections and outputs
 *   logotype  public/key-art/logotype.svg  (self-contained: owner trophy mark + Barlow Condensed
 *             embedded, geometry from components/brand/logotype-geometry.ts)
 *             tmp/phase5/key-art/logotype-1280x300.png (store-use render, transparent)
 *   title     public/key-art/title-stage.webp  (2560×1440 background: floor grid, light, dust, vignette)
 *             public/key-art/title-table.webp  (the tilted radar "broadcast table", transparent)
 *             components/brand/title-hero-layout.ts (generated: table box, table-top corners, ping anchor)
 *   season    public/key-art/season-splash.webp (season-review background, gold title lighting)
 *   trophies  public/trophy-art/<kind>.svg + <kind>.webp (512²) for lib/trophy-art.ts
 *
 * Inputs are all project-made: the baked radar art (scripts/bake-radar-art.ts → public/radar-art),
 * round-map data (data/round-maps), the bundled OFL fonts (app/fonts) and the owner's trophy logo
 * (public/logo.png; the full-resolution master in marketing/approved-brand is read, never written).
 * Rendering is Playwright Chromium screenshots of HTML/SVG/CSS built in scripts/key-art/scene.ts and
 * scripts/key-art/trophy-svg.ts, encoded with sharp. Output is deterministic for a given Chromium.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { chromium, type Browser, type Page } from "playwright"
import sharp, { type WebpOptions } from "sharp"
import { LOGOTYPE_COLORS, stackedLayout, type LogotypeLayout } from "../../components/brand/logotype-geometry"
import { sceneHtml, type SceneOptions } from "./scene"
import { trophySvg, TROPHY_ART_KINDS } from "./trophy-svg"

const ROOT = process.cwd()
const KEY_ART = path.join(ROOT, "public/key-art")
const TROPHY_ART = path.join(ROOT, "public/trophy-art")
const BUILD = path.join(ROOT, "tmp/key-art-build")
const REVIEW = path.join(ROOT, "tmp/phase5/key-art")
const LAYOUT_TS = path.join(ROOT, "components/brand/title-hero-layout.ts")

const args = process.argv.slice(2)
const review = args.includes("--review")
const wanted = args.filter(a => !a.startsWith("--"))
const SECTIONS = ["logotype", "title", "season", "trophies"] as const
const run = (s: (typeof SECTIONS)[number]) => wanted.length === 0 || wanted.includes(s)

const STAGE_W = 2560
const STAGE_H = 1440

export const TITLE_SCENE: Omit<SceneOptions, "pass"> = {
    width: STAGE_W, height: STAGE_H, map: "Mirage",
    focus: { x: 1720, y: 700 },
    camera: { perspective: 2800, originX: 1720, originY: -400, tiltX: 52, spinZ: -20, lift: 56 },
    table: { width: 940, height: 940, radar: 910 },
    light: "title", seed: 7,
}

export const SEASON_SCENE: Omit<SceneOptions, "pass"> = {
    width: STAGE_W, height: STAGE_H, map: "Inferno",
    focus: { x: 1280, y: 930 },
    camera: { perspective: 2600, originX: 1280, originY: -500, tiltX: 64, spinZ: 0, lift: 48 },
    table: { width: 1240, height: 820, radar: 800 },
    light: "season", seed: 11,
}

function log(msg: string) {
    process.stdout.write(`${msg}\n`)
}

function kb(bytes: number) {
    return `${(bytes / 1024).toFixed(1)} KB`
}

async function openPage(browser: Browser, html: string, name: string, width: number, height: number): Promise<Page> {
    mkdirSync(BUILD, { recursive: true })
    const file = path.join(BUILD, `${name}.html`)
    writeFileSync(file, html)
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    await page.goto(pathToFileURL(file).href)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => Array.from(document.images).every(img => img.complete))
    await page.waitForTimeout(250)
    return page
}

async function scenePage(browser: Browser, scene: Omit<SceneOptions, "pass">, pass: SceneOptions["pass"], name: string) {
    const page = await openPage(browser, sceneHtml({ ...scene, pass }), name, scene.width, scene.height)
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true)
    return page
}

async function writeWebp(file: string, input: Buffer, opts: WebpOptions) {
    const out = await sharp(input).webp({ effort: 6, ...opts }).toBuffer()
    writeFileSync(file, out)
    log(`  ${path.relative(ROOT, file)}  ${kb(out.length)}`)
    return out
}

// ─── Logotype ───────────────────────────────────────────────────────────

async function trophyMarkPng(): Promise<Buffer> {
    // Prefer the owner's full-resolution master (read-only); fall back to the shipped 512² logo.
    const master = path.join(ROOT, "marketing/approved-brand/ESM_LOGO.png")
    const src = existsSync(master)
        ? sharp(master).extract({ left: 287, top: 48, width: 779, height: 1067 })
        : sharp(path.join(ROOT, "public/logo.png")).extract({ left: 108, top: 54, width: 296, height: 404 })
    return src.resize({ height: 480 }).png({ compressionLevel: 9, palette: true, quality: 92, colours: 256, dither: 0.6 }).toBuffer()
}

function fontDataUri(weight: 700 | 800) {
    const bytes = readFileSync(path.join(ROOT, `app/fonts/barlow-condensed-latin-${weight}-normal.woff2`))
    return `data:font/woff2;base64,${bytes.toString("base64")}`
}

/** Static, self-contained logotype (transparent) — the stacked lockup centred in a 1280×300 frame. */
function logotypeSvg(layout: LogotypeLayout, trophyPng: Buffer): string {
    const W = 1280, H = 300
    const vb = layout.viewBox
    const k = 236 / vb.height
    const tx = (W - vb.width * k) / 2 - vb.x * k
    const ty = (H - vb.height * k) / 2 - vb.y * k
    const font = "font-family=\"'Barlow Condensed','Arial Narrow',sans-serif\""
    const primary = layout.primary[0]
    const kicker = layout.kicker!
    const rule = layout.rule!
    const sub = layout.subtitle
    const t = layout.trophy
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<title>Esports Manager</title>
<!-- Esports Manager logotype. Project-made by scripts/key-art/render-key-art.ts.
     Trophy mark: the owner's approved logo. Type: Barlow Condensed (SIL OFL 1.1, licenses/Barlow-OFL.txt), embedded. -->
<style>
@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(${fontDataUri(700)}) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-weight:800;src:url(${fontDataUri(800)}) format('woff2')}
</style>
<defs>
<linearGradient id="primary" gradientUnits="userSpaceOnUse" x1="0" y1="${primary.y - primary.size * 0.71}" x2="0" y2="${primary.y}"><stop offset="0" stop-color="${LOGOTYPE_COLORS.primaryTop}"/><stop offset="1" stop-color="${LOGOTYPE_COLORS.primaryBottom}"/></linearGradient>
<linearGradient id="hairline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${LOGOTYPE_COLORS.gold}" stop-opacity="0.7"/><stop offset="1" stop-color="${LOGOTYPE_COLORS.gold}" stop-opacity="0.12"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${LOGOTYPE_COLORS.gold}"/><stop offset="1" stop-color="${LOGOTYPE_COLORS.goldDeep}"/></linearGradient>
</defs>
<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${k.toFixed(5)})">
<image href="data:image/png;base64,${trophyPng.toString("base64")}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid meet"/>
<text x="${kicker.glyphs.map(g => g.x).join(" ")}" y="${kicker.y}" font-size="${kicker.size}" font-weight="${kicker.weight}" ${font} fill="${LOGOTYPE_COLORS.kicker}">${kicker.glyphs.map(g => g.ch).join("")}</text>
<text x="${primary.x}" y="${primary.y}" font-size="${primary.size}" font-weight="${primary.weight}" ${font} fill="url(#primary)">${primary.text}</text>
<rect x="${rule.bar.x}" y="${rule.bar.y}" width="${rule.bar.width}" height="${rule.bar.height}" fill="url(#bar)"/>
${rule.hairline.width > 0 ? `<rect x="${rule.hairline.x}" y="${rule.hairline.y}" width="${rule.hairline.width}" height="${rule.hairline.height}" fill="url(#hairline)"/>` : ""}
${sub ? `<text x="${sub.x}" y="${sub.y}" font-size="${sub.size}" font-weight="${sub.weight}" letter-spacing="${sub.letterSpacing}" ${font} fill="${LOGOTYPE_COLORS.gold}">${sub.text}</text>` : ""}
</g>
</svg>
`
}

async function renderLogotype(browser: Browser) {
    log("logotype")
    mkdirSync(KEY_ART, { recursive: true })
    const svg = logotypeSvg(stackedLayout("FPS"), await trophyMarkPng())
    const file = path.join(KEY_ART, "logotype.svg")
    writeFileSync(file, svg)
    log(`  ${path.relative(ROOT, file)}  ${kb(Buffer.byteLength(svg))}`)

    // Render as an <img>: proves the file is self-contained (SVG images cannot fetch anything).
    mkdirSync(REVIEW, { recursive: true })
    const html = (bg: string) => `<!doctype html><html><body style="margin:0;background:${bg}"><img src="${pathToFileURL(file).href}" width="1280" height="300" style="display:block"></body></html>`
    const page = await openPage(browser, html("transparent"), "logotype", 1280, 300)
    const png = await page.screenshot({ omitBackground: true })
    await page.close()
    writeFileSync(path.join(REVIEW, "logotype-1280x300.png"), png)
    log(`  tmp/phase5/key-art/logotype-1280x300.png  ${kb(png.length)}`)
    if (review) {
        const onInk = await openPage(browser, html("#07090C"), "logotype-ink", 1280, 300)
        await onInk.screenshot({ path: path.join(REVIEW, "logotype-on-ink.png") })
        await onInk.close()
    }
}

// ─── Title hero ─────────────────────────────────────────────────────────

type Pt = { x: number; y: number }

async function markers(page: Page): Promise<Record<string, Pt>> {
    return page.evaluate(() => {
        const out: Record<string, { x: number; y: number }> = {}
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(".mark"))) {
            const r = el.getBoundingClientRect()
            out[el.id] = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
        }
        return out
    })
}

/** Opaque bounds of an RGBA image (alpha > threshold). */
async function alphaBounds(png: Buffer, threshold = 3) {
    const { data, info } = await sharp(png).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true })
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1
    for (let y = 0; y < info.height; y++) {
        const row = y * info.width
        for (let x = 0; x < info.width; x++) {
            if (data[row + x] > threshold) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
    }
    return { minX, minY, maxX, maxY }
}

const pct = (v: number, of: number) => Math.round((v / of) * 100000) / 1000

/** One-line TS literal: unquoted keys, spaced commas. */
function tsLiteral(v: unknown): string {
    return JSON.stringify(v).replace(/"([a-zA-Z]+)":/g, "$1: ").replace(/,/g, ", ").replace(/\{/g, "{ ").replace(/\}/g, " }")
}

async function renderTitle(browser: Browser) {
    log("title")
    mkdirSync(KEY_ART, { recursive: true })

    const stagePage = await scenePage(browser, TITLE_SCENE, "stage", "title-stage")
    const stagePng = await stagePage.screenshot()
    await stagePage.close()
    await writeWebp(path.join(KEY_ART, "title-stage.webp"), stagePng, { quality: 88, smartSubsample: true })

    const tablePage = await scenePage(browser, TITLE_SCENE, "table", "title-table")
    const tablePng = await tablePage.screenshot({ omitBackground: true })
    const m = await markers(tablePage)
    await tablePage.close()

    const pad = 12
    const b = await alphaBounds(tablePng)
    const box = {
        left: Math.max(0, b.minX - pad),
        top: Math.max(0, b.minY - pad),
        right: Math.min(STAGE_W, b.maxX + 1 + pad),
        bottom: Math.min(STAGE_H, b.maxY + 1 + pad),
    }
    const bw = box.right - box.left, bh = box.bottom - box.top
    const crop = await sharp(tablePng).extract({ left: box.left, top: box.top, width: bw, height: bh }).png().toBuffer()
    await writeWebp(path.join(KEY_ART, "title-table.webp"), crop, { quality: 84, alphaQuality: 90 })

    const local = (p: Pt) => ({ x: pct(p.x - box.left, bw), y: pct(p.y - box.top, bh) })
    const corners = ["c-tl", "c-tr", "c-br", "c-bl"].map(id => local(m[id]))
    // Local affine at the ping site: 100 table px along x / y → stage px.
    const ex = { x: (m["p-x"].x - m["p-c"].x) / 100, y: (m["p-x"].y - m["p-c"].y) / 100 }
    const ey = { x: (m["p-y"].x - m["p-c"].x) / 100, y: (m["p-y"].y - m["p-c"].y) / 100 }
    const pingSize = 150 // table px
    const layout = {
        stage: { src: "/key-art/title-stage.webp", width: STAGE_W, height: STAGE_H },
        table: {
            src: "/key-art/title-table.webp",
            left: pct(box.left, STAGE_W), top: pct(box.top, STAGE_H), width: pct(bw, STAGE_W), height: pct(bh, STAGE_H),
            pixelWidth: bw, pixelHeight: bh,
        },
        tableTop: corners,
        ping: {
            ...local(m["p-c"]),
            size: pct(pingSize, bw),
            matrix: [ex.x, ex.y, ey.x, ey.y].map(n => Math.round(n * 10000) / 10000),
        },
    }
    const ts = `/**
 * GENERATED by scripts/key-art/render-key-art.ts (title section) — do not edit by hand.
 *
 * Placement of the pre-rendered title layers in the 16:9 stage. Percentages are of the
 * stage (table box) or of the table box (table-top corners, ping). \`ping.matrix\` is the
 * local 2D affine (a, b, c, d) of the tilted table at the ping site, so a circle drawn
 * \`ping.size\`% of the table box wide lands on the table in perspective.
 */
export const TITLE_HERO_LAYOUT = {
${Object.entries(layout).map(([k, v]) => `    ${k}: ${tsLiteral(v)},`).join("\n")}
} as const
`
    writeFileSync(LAYOUT_TS, ts)
    log(`  ${path.relative(ROOT, LAYOUT_TS)}`)

    if (review) {
        mkdirSync(REVIEW, { recursive: true })
        const full = await scenePage(browser, TITLE_SCENE, "full", "title-full")
        await full.screenshot({ path: path.join(REVIEW, "title-art-full.png") })
        await full.close()
    }
}

// ─── Season splash ──────────────────────────────────────────────────────

async function renderSeason(browser: Browser) {
    log("season")
    mkdirSync(KEY_ART, { recursive: true })
    const page = await scenePage(browser, SEASON_SCENE, "full", "season-splash")
    const png = await page.screenshot()
    await page.close()
    await writeWebp(path.join(KEY_ART, "season-splash.webp"), png, { quality: 88, smartSubsample: true })
    if (review) {
        mkdirSync(REVIEW, { recursive: true })
        await sharp(png).resize(1920).png().toFile(path.join(REVIEW, "season-splash.png"))
    }
}

// ─── Trophies ───────────────────────────────────────────────────────────

async function renderTrophies(browser: Browser) {
    log("trophies")
    mkdirSync(TROPHY_ART, { recursive: true })
    const sheet: { kind: string; png: Buffer }[] = []
    for (const kind of TROPHY_ART_KINDS) {
        const svg = trophySvg(kind)
        const file = path.join(TROPHY_ART, `${kind.toLowerCase()}.svg`)
        writeFileSync(file, svg)
        log(`  ${path.relative(ROOT, file)}  ${kb(Buffer.byteLength(svg))}`)
        const page = await openPage(browser, `<!doctype html><html><body style="margin:0;background:transparent"><img src="${pathToFileURL(file).href}" width="512" height="512" style="display:block"></body></html>`, `trophy-${kind}`, 512, 512)
        const png = await page.screenshot({ omitBackground: true })
        await page.close()
        await writeWebp(path.join(TROPHY_ART, `${kind.toLowerCase()}.webp`), png, { quality: 90, alphaQuality: 95 })
        sheet.push({ kind, png })
    }
    if (review) {
        mkdirSync(REVIEW, { recursive: true })
        for (const { kind, png } of sheet) {
            await sharp(png).flatten({ background: "#07090C" }).png().toFile(path.join(REVIEW, `trophy-${kind.toLowerCase()}.png`))
        }
        const cell = 300
        const composite = await Promise.all(sheet.map(async ({ png }, i) => ({
            input: await sharp(png).resize(cell - 20, cell - 20).png().toBuffer(), left: i * cell + 10, top: 10,
        })))
        await sharp({ create: { width: cell * sheet.length, height: cell, channels: 3, background: "#07090C" } })
            .composite(composite).png().toFile(path.join(REVIEW, "trophies-sheet.png"))
    }
}

// ─── Inventory ──────────────────────────────────────────────────────────

const INVENTORY = path.join(ROOT, "docs/launch-readiness/evidence/phase5-6-key-art-inventory.json")
const SCRIPT = "scripts/key-art/render-key-art.ts"

/** Provenance rows for every shipped file this script generates (merged into L08 by the integrator). */
function writeInventory() {
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex")
    const fonts = ["app/fonts/barlow-condensed-latin-600-normal.woff2", "app/fonts/barlow-condensed-latin-700-normal.woff2", "app/fonts/barlow-condensed-latin-800-normal.woff2"]
    const inputsFor = (rel: string): string[] => {
        if (rel.endsWith("logotype.svg")) return ["components/brand/logotype-geometry.ts", "public/logo.png", "marketing/approved-brand/ESM_LOGO.png", fonts[1], fonts[2]]
        if (rel.includes("/trophy-art/")) return ["scripts/key-art/trophy-svg.ts"]
        const scene = rel.includes("season") ? SEASON_SCENE : TITLE_SCENE
        return ["scripts/key-art/scene.ts", `public/radar-art/${scene.map}-upper.webp`, `data/round-maps/${scene.map}.json`, ...fonts]
    }
    const kindFor = (rel: string) => (rel.includes("/trophy-art/") ? "trophy-art" : rel.endsWith("logotype.svg") ? "logotype" : "key-art")
    const notesFor = (rel: string) =>
        rel.endsWith("logotype.svg")
            ? "Embeds the owner's approved trophy logo (docs/launch-readiness/evidence/OWNER-TROPHY-20260920.json) and Barlow Condensed (SIL OFL 1.1, licenses/Barlow-OFL.txt)."
            : rel.includes("/trophy-art/")
                ? "Pure SVG drawn by code; no images or fonts."
                : "Drawn by code from the project's baked radar art (scripts/bake-radar-art.ts, nav-mesh derived) and round-map data; no third-party or AI imagery."
    const files = ["public/key-art", "public/trophy-art"].flatMap(dir => readdirSync(path.join(ROOT, dir)).sort().map(name => `${dir}/${name}`))
    const rows = files.map(rel => {
        const bytes = readFileSync(path.join(ROOT, rel))
        return {
            path: rel,
            sha256: sha(bytes),
            bytes: bytes.length,
            kind: kindFor(rel),
            source: `Project-made: ${SCRIPT}`,
            generatedBy: `npx tsx ${SCRIPT}`,
            inputs: inputsFor(rel),
            evidence: "docs/revamp/PHASE5_PEOPLE_MOMENTS.md",
            license: "Project original",
            licenseNotes: notesFor(rel),
            permission: null,
            attribution: null,
            allowedUse: "Game distribution once the owner's release statement covers project-made files (Phase 5 stream 5.7).",
            releaseDisposition: "hold",
            reviewBasis: "reproduced-from-project-source",
        }
    })
    const doc = {
        version: 1,
        stream: "Phase 5 / 5.6 key art",
        generator: SCRIPT,
        note: "Rows for the integrator to merge into L08-content-inventory.json. Bytes are exact (public/** is -text). Disposition stays 'hold' until the owner's release statement for project-made files is recorded.",
        totalBytes: rows.reduce((a, r) => a + r.bytes, 0),
        files: rows,
    }
    mkdirSync(path.dirname(INVENTORY), { recursive: true })
    writeFileSync(INVENTORY, JSON.stringify(doc, null, 2) + "\n")
    log(`inventory  ${path.relative(ROOT, INVENTORY)}  ${rows.length} files, ${kb(doc.totalBytes)}`)
}

async function main() {
    const browser = await chromium.launch()
    try {
        if (run("logotype")) await renderLogotype(browser)
        if (run("title")) await renderTitle(browser)
        if (run("season")) await renderSeason(browser)
        if (run("trophies")) await renderTrophies(browser)
    } finally {
        await browser.close()
    }
    writeInventory()
}

if (require.main === module) {
    main().catch(err => {
        console.error(err)
        process.exitCode = 1
    })
}
