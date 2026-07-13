#!/usr/bin/env tsx
/**
 * Steam capsule / library art: the game title + slogan over a BLURRED real
 * gameplay screenshot (public/Live match.jpg — the live-match screen). No
 * generated crest badges, no clutter — just a clean, premium, CS-style capsule.
 * Rendered to PNG by chromium in the wrapper. Goes in Steam's capsule/library/
 * hero slots (NOT the Screenshots section).
 */
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "tmp", "steam-marketing")
fs.mkdirSync(OUT, { recursive: true })

// Blurred gameplay background (absolute file URL; space encoded).
const BG = `file://${ROOT}/public/Live%20match.jpg`

function css(): string {
    return `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{overflow:hidden;background:#05070d;font-family:'Arial Black',Impact,system-ui,sans-serif}
  .stage{position:fixed;inset:0;overflow:hidden;background:#05070d}
  /* Blurred gameplay backdrop, scaled out so blurred edges never show. */
  .bg{position:absolute;inset:-8%;background:url('${BG}') center/cover no-repeat;
    filter:blur(13px) saturate(1.28) brightness(.95) contrast(1.05);transform:scale(1.12)}
  /* Just enough shade for logo contrast; the blurred match stays visible. */
  .shade{position:absolute;inset:0;background:
    radial-gradient(135% 105% at 50% 42%, rgba(4,8,16,.28) 0%, rgba(4,7,13,.5) 60%, rgba(2,4,9,.8) 100%),
    linear-gradient(180deg, rgba(5,9,17,.42) 0%, transparent 30%, transparent 52%, rgba(3,5,10,.82) 100%)}
  .glow{position:absolute;border-radius:50%;filter:blur(80px);opacity:.4;mix-blend-mode:screen}
  .g1{width:55%;height:55%;left:-8%;top:-20%;background:#2a8fe0}
  .g2{width:50%;height:50%;right:-12%;bottom:-25%;background:#7c3aed}
  .content{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:var(--gap,26px);padding:var(--pad,30px);text-align:center}
  .badge{position:absolute;top:24px;right:26px;font:800 11px/1 system-ui;letter-spacing:.24em;text-transform:uppercase;
    color:#eaf3ff;border:1px solid #ffffff30;padding:7px 14px;border-radius:999px;background:#0a1220aa;backdrop-filter:blur(4px)}
  /* Bold WHITE outlined wordmark — the in-game logo style. */
  .logo{display:flex;flex-direction:column;align-items:center;line-height:.86;text-align:center}
  .logo .row{white-space:nowrap;color:#fff;font-weight:900;letter-spacing:-.012em;
    paint-order:stroke fill;
    text-shadow:0 3px 0 rgba(2,6,12,.42), 0 6px 20px rgba(0,0,0,.7), 0 1px 2px rgba(0,0,0,.5)}
  .logo .fps{color:#ffd15a}
  .rule{height:3px;width:var(--rule,120px);border-radius:2px;
    background:linear-gradient(90deg,transparent,#ffd15a,transparent);opacity:.9}
  .tag{color:#eaf1fb;font:800 var(--tag,15px)/1 system-ui;letter-spacing:.26em;text-transform:uppercase;
    text-shadow:0 2px 14px #000,0 0 30px #0009}
  `
}

function logo(fsMain: number, fsFps: number, inline = false): string {
    const strokeW = (s: number) => Math.max(1.5, s * 0.05).toFixed(1)
    const row = (text: string, size: number, fps = false) =>
        `<div class="row ${fps ? "fps" : ""}" style="font-size:${size}px;-webkit-text-stroke:${strokeW(size)}px ${fps ? "rgba(60,34,0,.55)" : "rgba(4,10,20,.5)"}">${text}</div>`
    const title = inline ? row("ESPORTS MANAGER", fsMain) : row("ESPORTS", fsMain) + row("MANAGER", fsMain)
    return `<div class="logo">${title}${row("FPS", fsFps, true)}</div>`
}

function page(inner: string): string {
    return `<!doctype html><meta charset=utf8><style>${css()}</style>
    <div class="stage"><div class="bg"></div><div class="shade"></div>
      <div class="glow g1"></div><div class="glow g2"></div>${inner}</div>`
}

const badge = `<div class="badge">Early Access</div>`

const rule = (w: number) => `<div class="rule" style="--rule:${w}px"></div>`

const assets: Array<{ name: string; w: number; h: number; html: string }> = [
    {
        // Small capsule — appears in search results, tags, and recommendations.
        // Tiny + wide; stack the wordmark (inline "ESPORTS MANAGER" overflows
        // 231px) and keep it to the logo only (no tagline) so it stays legible.
        name: "small_capsule_231x87", w: 231, h: 87,
        html: page(`<div class="content" style="--gap:0;--pad:10px">
        ${logo(20, 13)}</div>`),
    },
    {
        name: "header_capsule_460x215", w: 460, h: 215,
        html: page(`<div class="content" style="--gap:14px;--pad:22px;--tag:12px">
        ${logo(38, 26)}${rule(150)}<div class="tag">Scout · Draft · Dominate</div></div>`),
    },
    {
        name: "main_capsule_616x353", w: 616, h: 353,
        html: page(`${badge}<div class="content" style="--gap:20px;--pad:28px;--tag:15px">
        ${logo(60, 40)}${rule(220)}<div class="tag">Build your esports dynasty</div></div>`),
    },
    {
        name: "vertical_capsule_374x448", w: 374, h: 448,
        html: page(`<div class="content" style="--gap:18px;--pad:24px;--tag:12px">
        ${logo(38, 26)}${rule(150)}<div class="tag">Scout · Draft · Dominate</div></div>`),
    },
    {
        name: "library_capsule_600x900", w: 600, h: 900,
        html: page(`<div class="content" style="--gap:26px;--pad:44px;--tag:16px">
        ${logo(62, 42)}${rule(230)}<div class="tag">Build your esports dynasty</div></div>`),
    },
    {
        name: "library_hero_1920x620", w: 1920, h: 620,
        html: page(`<div class="content" style="--gap:30px;--pad:60px;--tag:23px">
        ${logo(148, 88, true)}${rule(520)}<div class="tag">Scout · Draft · Develop · Dominate</div></div>`),
    },
]

import { chromium } from "playwright"

async function main() {
    for (const a of assets) fs.writeFileSync(path.join(OUT, `${a.name}.html`), a.html)
    fs.writeFileSync(path.join(OUT, "_manifest.json"), JSON.stringify(assets.map(({ name, w, h }) => ({ name, w, h })), null, 2))

    const chromePath = fs.readdirSync("/opt/pw-browsers")
        .map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p))
    const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] })
    for (const a of assets) {
        // Exact-size viewport → exact-size PNG (Steam requires precise capsule dims).
        const ctx = await browser.newContext({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 })
        const page = await ctx.newPage()
        await page.goto(`file://${path.join(OUT, `${a.name}.html`)}`, { waitUntil: "networkidle" })
        await page.waitForTimeout(350)
        await page.screenshot({ path: path.join(OUT, `${a.name}.png`) })
        await ctx.close()
        console.log("  ✓", a.name)
    }
    await browser.close()
    console.log(`Done — ${assets.length} capsules (blurred gameplay bg) in ${path.relative(ROOT, OUT)}`)
}
main()
