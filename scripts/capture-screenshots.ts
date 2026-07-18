#!/usr/bin/env tsx
/**
 * Steam screenshot capture driver.
 *
 * Drives the Next.js dev server at http://127.0.0.1:3001 through a full
 * new-career flow with Playwright and writes PNGs to tmp/steam-screenshots/.
 *
 * Usage (expects dev server already running on port 3001):
 *   npx tsx scripts/capture-screenshots.ts
 *
 * Or end-to-end via the wrapper:
 *   npm run screenshots:capture
 *
 * Each step try/catches — a missing button or slow load won't abort the run;
 * it logs a warning and keeps going so the maintainer still gets as many
 * shots as possible on a given run.
 */

import fs from "node:fs"
import path from "node:path"
import { chromium, Page, Browser } from "playwright"

const BASE = "http://127.0.0.1:3001"
const OUT_DIR = path.join(process.cwd(), "tmp", "steam-screenshots")
const VIEWPORT = { width: 1920, height: 1080 }
const MANAGER_NAME = "Jordan Vale"

interface Shot {
    idx: number
    slug: string
    do: (page: Page) => Promise<void>
}

async function ensureOutDir(): Promise<void> {
    fs.mkdirSync(OUT_DIR, { recursive: true })
}

async function shoot(page: Page, idx: number, slug: string): Promise<void> {
    const file = path.join(OUT_DIR, `${String(idx).padStart(2, "0")}_${slug}.png`)
    // Let animations and images settle.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
    await page.waitForTimeout(800)
    await page.screenshot({ path: file, fullPage: false })
    console.log(`  ✓ ${path.relative(process.cwd(), file)}`)
}

async function clickFirst(page: Page, ...selectors: string[]): Promise<boolean> {
    for (const sel of selectors) {
        const loc = page.locator(sel).first()
        if (await loc.isVisible().catch(() => false)) {
            await loc.click({ timeout: 5_000 }).catch(() => { })
            return true
        }
    }
    return false
}

async function withStep(label: string, fn: () => Promise<void>): Promise<void> {
    try {
        console.log(label)
        await fn()
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`  ! ${label} failed: ${msg}`)
    }
}

async function run(): Promise<void> {
    await ensureOutDir()
    console.log(`Output: ${path.relative(process.cwd(), OUT_DIR)}`)

    const browser: Browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)

    // Clear any prior save state so we always start from a fresh main menu.
    await page.goto(`${BASE}/main-menu`)
    await page.evaluate(() => {
        try { localStorage.clear() } catch { }
        try { sessionStorage.clear() } catch { }
    })

    await withStep("1. Main menu", async () => {
        await page.goto(`${BASE}/main-menu`)
        await page.waitForSelector("text=/new career|career|load save/i", { timeout: 20_000 })
        await shoot(page, 1, "main_menu")
    })

    await withStep("2. New-career welcome", async () => {
        // The "New Career" button on main menu — it's a styled <button> wrapping
        // an h2. Match by visible text.
        const clicked = await clickFirst(page,
            'button:has-text("New Career")',
            'button:has(h2:has-text("New Career"))',
            'a:has-text("New Career")',
        )
        if (!clicked) await page.goto(`${BASE}/new-game`)
        await page.waitForURL(/\/new-game/, { timeout: 10_000 })
        await page.waitForSelector('input[placeholder*="name"]', { timeout: 20_000 })
        await shoot(page, 2, "new_career_welcome")
    })

    await withStep("3. Team selection", async () => {
        await page.locator('input[placeholder*="name"]').first().fill(MANAGER_NAME)
        await clickFirst(page,
            'button:has-text("Choose Existing Team")',
            'button:has-text("Continue")',
        )
        await page.waitForSelector("text=/teams/i", { timeout: 20_000 })
        // Let the grid render portraits.
        await page.waitForTimeout(1500)
        await shoot(page, 3, "team_select")
    })

    await withStep("4. Desktop home (career started)", async () => {
        // Pick a mid-tier team — the first card that is not locked. Team cards
        // are clickable divs; we select by common heading-or-name pattern.
        const candidates = [
            'button[data-team-id]',
            '[data-team-card]',
            'div[role="button"]:has(img)',
            'div.cursor-pointer:has(img)',
        ]
        let picked = false
        for (const sel of candidates) {
            const loc = page.locator(sel).first()
            if (await loc.isVisible().catch(() => false)) {
                await loc.click({ timeout: 5_000 }).catch(() => { })
                picked = true
                break
            }
        }
        if (!picked) {
            // Fallback: click the first visible image inside the team grid.
            await page.locator("main img, [class*='team']").first().click({ timeout: 5_000 })
        }
        await page.waitForTimeout(500)
        await clickFirst(page,
            'button:has-text("START CAREER")',
            'button:has-text("Start Career")',
            'button:has-text("Start")',
        )
        await page.waitForURL(/\/desktop/, { timeout: 30_000 })
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
        await page.waitForTimeout(1500)
        await shoot(page, 4, "desktop_home")
    })

    // From here on out we navigate directly. The save is persisted in
    // Zustand + localStorage so direct URL hits load the same state.
    const routeShots: Array<[number, string, string]> = [
        [5, "squad", "/squad"],
        [7, "tournaments_list", "/tournaments"],
        [9, "schedule", "/schedule"],
        [10, "hall_of_fame", "/hall-of-fame"],
        [11, "transfer_market", "/transfers"],
        [12, "scouting", "/scouting"],
        [13, "finances", "/finances"],
        [14, "world_rankings", "/rankings"],
        [19, "community_import", "/settings/community-import"],
    ]
    for (const [idx, slug, route] of routeShots) {
        await withStep(`${idx}. ${slug}`, async () => {
            await page.goto(`${BASE}${route}`)
            await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
            await page.waitForTimeout(1000)
            await shoot(page, idx, slug)
        })
    }

    await withStep("6. Player detail (first squad member)", async () => {
        await page.goto(`${BASE}/squad`)
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
        const ok = await clickFirst(page,
            'a[href^="/player/"]',
            'button[data-player-id]',
            'div[data-player-card] a',
        )
        if (!ok) throw new Error("no player link found on /squad")
        await page.waitForURL(/\/player\//, { timeout: 10_000 })
        await page.waitForTimeout(1200)
        await shoot(page, 6, "player_detail")
    })

    await withStep("8. Tournament bracket (first tournament)", async () => {
        await page.goto(`${BASE}/tournaments`)
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
        const ok = await clickFirst(page,
            'a[href^="/tournaments/"]',
            'button[data-tournament-id]',
            'div[data-tournament-card]',
        )
        if (!ok) throw new Error("no tournament link found")
        await page.waitForURL(/\/tournaments\/[^\/]+/, { timeout: 10_000 })
        await page.waitForTimeout(1500)
        await shoot(page, 8, "tournament_bracket")
    })

    // Match flow is best-effort — a match may not be scheduled at week 1.
    await withStep("15-18. Match flow", async () => {
        await page.goto(`${BASE}/schedule`)
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
        const matchLink = page.locator('a[href*="/match/"]').first()
        if (!(await matchLink.isVisible().catch(() => false))) {
            throw new Error("no upcoming match on schedule — advance the week and re-run to capture match shots")
        }
        await matchLink.click()
        await page.waitForURL(/\/match\/[^\/]+/, { timeout: 10_000 })
        await page.waitForTimeout(1500)

        // veto → tactics → live → result
        const url = page.url()
        if (url.includes("/veto")) { await shoot(page, 15, "match_veto") }
        await page.goto(url.replace(/\/match\/([^\/]+).*$/, "/match/$1/tactics"))
        await page.waitForTimeout(1500); await shoot(page, 16, "match_tactics")
        await page.goto(url.replace(/\/match\/([^\/]+).*$/, "/match/$1/live"))
        await page.waitForTimeout(3000); await shoot(page, 17, "match_live")
        await page.goto(url.replace(/\/match\/([^\/]+).*$/, "/match/$1/result"))
        await page.waitForTimeout(1500); await shoot(page, 18, "match_result")
    })

    await browser.close()
    console.log("Done.")
}

run().catch(err => {
    console.error(err)
    process.exit(1)
})
