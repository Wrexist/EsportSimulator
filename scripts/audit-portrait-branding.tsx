#!/usr/bin/env tsx
/**
 * IP-audit: render every portrait in PORTRAIT_POOL onto contact sheets so we can
 * visually spot real esports-org branding (jersey logos, wordmarks) baked into
 * the AI portraits. Non-destructive — just produces montage PNGs to review.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"
import { PORTRAIT_POOL } from "../lib/safe-branding/portrait-pool"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "tmp", "portrait-audit")
fs.mkdirSync(OUT, { recursive: true })

const COLS = 5
const PER_SHEET = 55 // 5 x 11
const CELL = 300

function sheetHtml(items: string[], startIndex: number): string {
    const cells = items.map((rel, i) => {
        const abs = `file://${ROOT}/public${rel}`
        const label = rel.replace("/assets/teams/", "").replace("/players/", " / ")
        return `<div class="cell">
      <div class="idx">#${startIndex + i}</div>
      <img src="${abs}" loading="eager">
      <div class="lab">${label}</div>
    </div>`
    }).join("")
    return `<!doctype html><meta charset=utf8><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0b0f18;font-family:system-ui;padding:16px}
    .grid{display:grid;grid-template-columns:repeat(${COLS},${CELL}px);gap:12px}
    .cell{background:#141a26;border-radius:10px;overflow:hidden;position:relative}
    .cell img{display:block;width:${CELL}px;height:${CELL}px;object-fit:cover;background:#1c2432}
    .idx{position:absolute;top:6px;left:6px;background:#000a;color:#fff;font:700 13px system-ui;padding:2px 8px;border-radius:6px}
    .lab{color:#cfe0f5;font:600 13px/1.3 system-ui;padding:8px 10px;word-break:break-all}
    </style><div class="grid">${cells}</div>`
}

async function main() {
    const chromePath = fs.readdirSync("/opt/pw-browsers")
        .map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p))
    const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] })
    const sheets = Math.ceil(PORTRAIT_POOL.length / PER_SHEET)
    for (let s = 0; s < sheets; s++) {
        const start = s * PER_SHEET
        const items = PORTRAIT_POOL.slice(start, start + PER_SHEET)
        const html = sheetHtml(items, start)
        const htmlPath = path.join(OUT, `sheet_${s + 1}.html`)
        fs.writeFileSync(htmlPath, html)
        const ctx = await browser.newContext({ viewport: { width: COLS * CELL + 80, height: 800 }, deviceScaleFactor: 1 })
        const page = await ctx.newPage()
        await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" })
        await page.waitForTimeout(400)
        await page.screenshot({ path: path.join(OUT, `sheet_${s + 1}.png`), fullPage: true })
        await ctx.close()
        console.log(`  ✓ sheet_${s + 1}.png (${items.length} portraits, #${start}–#${start + items.length - 1})`)
    }
    await browser.close()
    console.log(`Done — ${sheets} sheets, ${PORTRAIT_POOL.length} portraits in ${path.relative(ROOT, OUT)}`)
}
main()
