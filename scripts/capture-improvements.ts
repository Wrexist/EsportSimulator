#!/usr/bin/env tsx
/**
 * Capture the UX-improvement screens (AUDIT_UX_2026-06) for review.
 * Uses the pre-installed Playwright chromium via executablePath (the CDN is
 * blocked in this env). Expects the dev server on port 3001.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, Page } from "playwright"

const BASE = "http://127.0.0.1:3001"
const OUT = path.join(process.cwd(), "tmp", "improvements")
// Use a specific chromium binary when set (e.g. a sandbox's pre-installed
// browser when the Playwright CDN is blocked); otherwise fall back to
// Playwright's default resolution.
const EXE = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const VIEWPORT = { width: 1680, height: 1050 }

async function shoot(page: Page, slug: string) {
    fs.mkdirSync(OUT, { recursive: true })
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => { })
    await page.waitForTimeout(900)
    const file = path.join(OUT, `${slug}.png`)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`  ✓ ${slug}.png`)
}
async function clickText(page: Page, ...sels: string[]) {
    for (const s of sels) {
        const l = page.locator(s).first()
        if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 5000 }).catch(() => { }); return true }
    }
    return false
}
async function step(label: string, fn: () => Promise<void>) {
    try { console.log(label); await fn() } catch (e) { console.warn(`  ! ${label}: ${e instanceof Error ? e.message : e}`) }
}
async function dismissTutorial(page: Page) {
    // The tutorial auto-fires ~1s after each full page load, so dismiss it on
    // every page before shooting.
    const skip = page.locator('button[aria-label="Skip tutorial"]')
    try {
        await skip.waitFor({ state: "visible", timeout: 3500 })
        await skip.click().catch(() => { })
        await page.waitForTimeout(500)
    } catch { /* not present this page */ }
}
async function gotoShot(page: Page, route: string, slug: string) {
    await page.goto(`${BASE}${route}`)
    await page.waitForTimeout(1400)
    await dismissTutorial(page)
    await shoot(page, slug)
}

async function run() {
    const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE, headless: true } : { headless: true })
    const page = await (await browser.newContext({ viewport: VIEWPORT })).newPage()
    page.setDefaultTimeout(15_000)

    await page.goto(`${BASE}/main-menu`)
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch { } })

    await step("New career", async () => {
        await clickText(page, 'button:has-text("New Career")', 'a:has-text("New Career")') || await page.goto(`${BASE}/new-game`)
        await page.waitForSelector('input[placeholder*="name"]', { timeout: 20_000 })
        await page.locator('input[placeholder*="name"]').first().fill("Alex Morgan")
        await clickText(page, 'button:has-text("Choose Existing Team")', 'button:has-text("Continue")')
        await page.waitForTimeout(1800)
    })
    // C1/E10: team picker — locked orgs now show "MANAGER LVL X".
    await step("team-unlocks", async () => { await shoot(page, "new-game_manager-level-unlocks") })

    await step("Start career", async () => {
        const cands = ['div.cursor-pointer:has(img)', 'div[role="button"]:has(img)', "main img"]
        for (const s of cands) { const l = page.locator(s).first(); if (await l.isVisible().catch(() => false)) { await l.click().catch(() => { }); break } }
        await page.waitForTimeout(500)
        await clickText(page, 'button:has-text("START CAREER")', 'button:has-text("Start Career")', 'button:has-text("Start")')
        await page.waitForURL(/127\.0\.0\.1:3001\/(\?|$)/, { timeout: 30_000 }).catch(() => { })
        await page.waitForTimeout(2500)
    })

    // The headline: unified dashboard with Action Center, Weekly Focus, Getting
    // Started, team OVR badge, money formatter, objectives.
    await step("dashboard", async () => { await gotoShot(page, "/", "dashboard_hub") })

    const routes: [string, string][] = [
        ["sponsorships_brand-tradeoffs", "/sponsorships"],
        ["career_legacy-track", "/career"],
        ["rankings_elo-tooltip", "/rankings"],
        ["fpl_intro", "/fpl"],
        ["trophies_cabinet", "/trophies"],
    ]
    for (const [slug, route] of routes) {
        await step(slug, async () => { await gotoShot(page, route, slug) })
    }

    // Help glossary dialog.
    await step("help-glossary", async () => {
        await page.goto(`${BASE}/`)
        await page.waitForTimeout(1400)
        await dismissTutorial(page)
        await clickText(page, 'button[aria-label="Open help"]', 'button[title*="Help"]')
        await page.waitForTimeout(900)
        await shoot(page, "help_glossary")
    })

    await browser.close()
    console.log("Done →", path.relative(process.cwd(), OUT))
}
run().catch(e => { console.error(e); process.exit(1) })
