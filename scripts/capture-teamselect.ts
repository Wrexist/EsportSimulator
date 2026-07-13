#!/usr/bin/env tsx
/**
 * Capture the new-game TEAM SELECT screens — a stable, career-free part of the
 * app that showcases the (now fictional, launch-safe) teams and rosters:
 *
 *   team_grid.png — the grid of teams (fictional names + crests + tiers)
 *   roster.png    — a selected team's roster (fictional handles, clean
 *                   portraits, stats) + START CAREER panel
 *
 * No career is created, so there's no persistence/rehydration redirect race.
 * Run against :3001.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, Page } from "playwright"

const BASE = process.env.CAP_BASE || "http://127.0.0.1:3001"
const OUT = path.join(process.cwd(), "tmp", "clean-shots")
const VIEWPORT = { width: 1920, height: 1080 }

function resolveChrome(): string | undefined {
    const root = "/opt/pw-browsers"
    if (!fs.existsSync(root)) return undefined
    for (const d of fs.readdirSync(root)) {
        if (d.startsWith("chromium-") && !d.includes("headless")) {
            const p = path.join(root, d, "chrome-linux", "chrome")
            if (fs.existsSync(p)) return p
        }
    }
    return undefined
}
async function hideChrome(page: Page) {
    await page.addStyleTag({ content: ".z-devtools{display:none !important}" }).catch(() => { })
}
async function clickFirst(page: Page, ...sels: string[]): Promise<boolean> {
    for (const s of sels) {
        const l = page.locator(s).first()
        if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 5000 }).catch(() => { }); return true }
    }
    return false
}

async function run() {
    fs.mkdirSync(OUT, { recursive: true })
    const executablePath = resolveChrome()
    console.log(`Chrome: ${executablePath || "(bundled)"}`)
    const browser = await chromium.launch({
        headless: true, executablePath,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    })
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    page.setDefaultTimeout(20000)

    await page.goto(`${BASE}/main-menu`)
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch { } })
    await page.goto(`${BASE}/new-game`, { waitUntil: "domcontentloaded" })
    await page.waitForSelector('input[placeholder*="name"]', { state: "visible", timeout: 30000 })
    await page.waitForTimeout(700)
    await page.locator('input[placeholder*="name"]').first().fill("Alex Morgan")
    await page.waitForTimeout(400)
    await clickFirst(page, 'button:has-text("Choose Existing Team")')

    // team grid
    await page.waitForSelector('input[placeholder*="Search teams"]', { timeout: 15000 }).catch(() => { })
    await page.waitForTimeout(1800)
    await hideChrome(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(OUT, "team_grid.png") })
    console.log("  ✓ team_grid.png")

    // select a team → roster + START CAREER panel (do NOT start the career)
    const cards = page.locator('main [role="button"], main button, main .cursor-pointer').filter({ has: page.locator("img") })
    const startBtn = page.locator('button:has-text("START CAREER")').first()
    const n = await cards.count().catch(() => 0)
    for (let i = 0; i < Math.min(n, 14); i++) {
        await cards.nth(i).click({ timeout: 4000 }).catch(() => { })
        await page.waitForTimeout(600)
        if (await startBtn.isVisible().catch(() => false)) break
    }
    if (await startBtn.isVisible().catch(() => false)) {
        await page.waitForTimeout(1200)
        await hideChrome(page)
        await page.waitForTimeout(500)
        await page.screenshot({ path: path.join(OUT, "roster.png") })
        console.log("  ✓ roster.png")
    } else { console.warn("  ! roster/START CAREER panel not reached") }

    await ctx.close()
    await browser.close()
    const files = fs.readdirSync(OUT).filter(f => f.endsWith(".png"))
    console.log(`\nDone — ${files.length} shots: ${files.join(", ")}`)
}
run().catch(e => { console.error(e); process.exit(1) })
