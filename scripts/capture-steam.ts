#!/usr/bin/env tsx
/**
 * Attractive, Steam-compliant gameplay screenshot capture.
 *
 * Drives the real Next.js app: starts a career with a top team, fast-forwards
 * ~20 weeks via the /dev tools so brackets fill and rosters develop, tops up
 * cash so finances look healthy, then captures GAMEPLAY-ONLY screens at
 * 1920x1080 (no menus, no overlays) — including a live match launched via the
 * dev "Launch Test BO3" button.
 *
 * Uses the pre-installed Chromium (executablePath) so it works without
 * `playwright install`.
 *
 * Run:  npm run screenshots:steam   (boots the dev server + this script)
 */

import fs from "node:fs"
import path from "node:path"
import { chromium, Page, Browser } from "playwright"

const BASE = process.env.CAP_BASE || "http://127.0.0.1:3001"
const OUT_DIR = path.join(process.cwd(), "tmp", "steam-screenshots")
const VIEWPORT = { width: 1920, height: 1080 }
const MANAGER_NAME = "Alex Morgan"

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

// Hide dev-only chrome (bug-report button + dev-tools trigger/panel share the
// `z-devtools` class) so Steam sees gameplay only.
async function hideChrome(page: Page): Promise<void> {
    await page.addStyleTag({ content: ".z-devtools{display:none !important}" }).catch(() => { })
}

// The new-career tutorial modal blocks everything. Skip it (which marks it
// completed and persists, so it won't reappear on later navigations).
async function dismissTutorial(page: Page): Promise<void> {
    const skip = page.locator('[aria-label="Skip tutorial"]').first()
    if (await skip.isVisible().catch(() => false)) {
        await skip.click({ timeout: 4_000 }).catch(() => { })
        await page.waitForTimeout(400)
    } else {
        await page.keyboard.press("Escape").catch(() => { })
    }
}

async function shoot(page: Page, slug: string): Promise<void> {
    const file = path.join(OUT_DIR, `${slug}.png`)
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => { })
    await dismissTutorial(page)
    await hideChrome(page)
    await page.waitForTimeout(900)
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

async function step(label: string, fn: () => Promise<void>): Promise<void> {
    try { console.log(label); await fn() }
    catch (e) { console.warn(`  ! ${label}: ${e instanceof Error ? e.message : e}`) }
}

async function run(): Promise<void> {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const executablePath = resolveChrome()
    console.log(`Chrome: ${executablePath || "(bundled)"}`)
    const browser: Browser = await chromium.launch({
        headless: true,
        executablePath,
        args: [
            "--no-sandbox", "--disable-dev-shm-usage",
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        ],
    })
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.setDefaultTimeout(20_000)

    // Wipe any bloated save from prior runs so the app boots clean.
    await page.goto(`${BASE}/main-menu`)
    await page.evaluate(async () => {
        try { localStorage.clear(); sessionStorage.clear() } catch { }
        try {
            const dbs = (await (indexedDB as any).databases?.()) || []
            for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name)
        } catch { }
    })

    // --- Start a career; verify we actually reach the in-game shell ---
    async function startCareer(): Promise<boolean> {
        await page.goto(`${BASE}/new-game`, { waitUntil: "domcontentloaded" })
        await page.waitForSelector('input[placeholder*="name"]', { state: "visible", timeout: 30_000 })
        await page.waitForTimeout(600)
        const nameInput = page.locator('input[placeholder*="name"]').first()
        await nameInput.fill(MANAGER_NAME)
        await page.waitForTimeout(300)
        await clickFirst(page, 'button:has-text("Choose Existing Team")')
        // Team-select renders a search box + team cards.
        await page.waitForSelector('input[placeholder*="Search teams"]', { timeout: 15_000 }).catch(() => { })
        await page.waitForTimeout(1200)
        // Click team cards until the START CAREER panel appears (skips locked teams).
        const cards = page.locator('main [role="button"], main button, main .cursor-pointer').filter({ has: page.locator("img") })
        const startBtn = page.locator('button:has-text("START CAREER")').first()
        const n = await cards.count().catch(() => 0)
        for (let i = 0; i < Math.min(n, 12); i++) {
            await cards.nth(i).click({ timeout: 4000 }).catch(() => { })
            await page.waitForTimeout(500)
            if (await startBtn.isVisible().catch(() => false)) break
        }
        if (!(await startBtn.isVisible().catch(() => false))) return false
        await startBtn.click({ timeout: 6000 }).catch(() => { })
        await page.waitForURL(/\/desktop/, { timeout: 40_000 }).catch(() => { })
        await page.waitForTimeout(2500)
        await dismissTutorial(page)
        // Let the DEBOUNCED store persist the new career to localStorage before
        // any full-page navigation — otherwise a reload rehydrates to no-career
        // and bounces back to the new-game welcome screen.
        await page.waitForTimeout(4000)
        // Confirm the in-game sidebar exists (proves the career loaded).
        return await page.locator('text=/^\\s*Squad\\s*$/i').first().isVisible().catch(() => false)
    }

    let inGame = false
    await step("Start career", async () => {
        for (let attempt = 1; attempt <= 2 && !inGame; attempt++) {
            inGame = await startCareer()
            console.log(`  career start attempt ${attempt}: ${inGame ? "in-game ✓" : "retry"}`)
        }
    })
    if (!inGame) { console.error("Could not reach the in-game shell — aborting."); await browser.close(); process.exit(1) }

    // Navigate by full page load (proven reliable once the career is persisted).
    async function nav(route: string): Promise<void> {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" })
        await page.waitForTimeout(1400)
    }

    // --- Gameplay screens (no menus, no fast-forward) ---
    const routeShots: Array<[string, string]> = [
        ["squad", "/squad"],
        ["transfers", "/transfers"],
        ["scouting", "/scouting"],
        ["training", "/training"],
        ["tournaments", "/tournaments"],
        ["rankings", "/rankings"],
        ["statistics", "/statistics"],
        ["finances", "/finances"],
    ]
    for (const [slug, route] of routeShots) {
        await step(`Shot: ${slug}`, async () => {
            await nav(route)
            await shoot(page, slug)
        })
    }

    await step("Shot: tournament_bracket", async () => {
        await nav("/tournaments")
        if (await clickFirst(page, 'a[href^="/tournaments/"]', '[data-tournament-card]', 'div[role="button"]:has-text("View")'))
            await page.waitForTimeout(1600)
        await shoot(page, "tournament_bracket")
    })

    await step("Shot: player_detail", async () => {
        await nav("/squad")
        if (await clickFirst(page, 'a[href^="/player/"]', 'div[data-player-card] a', 'main a:has(img)'))
            await page.waitForURL(/\/player\//, { timeout: 10_000 }).catch(() => { })
        await page.waitForTimeout(1400)
        await shoot(page, "player_detail")
    })

    // --- Live match (hero shot) via dev launcher, captured LAST ---
    // The game locks navigation once a match is active, so this is the final
    // step and we never navigate away after launching.
    await step("Shot: match_live", async () => {
        await page.goto(`${BASE}/dev`)
        await page.waitForTimeout(1200)
        await dismissTutorial(page)
        if (await clickFirst(page, 'button:has-text("Launch Test BO3")')) {
            await page.waitForURL(/\/match\/[^/]+\/live/, { timeout: 20_000 }).catch(() => { })
            await hideChrome(page)
            // Catch the match mid-action (a few rounds in).
            await page.waitForTimeout(3500)
            await shoot(page, "match_live")
            await page.waitForTimeout(5000)
            await shoot(page, "match_live_2")
        }
    })

    await browser.close()
    const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith(".png"))
    console.log(`\nDone — ${files.length} screenshots in ${path.relative(process.cwd(), OUT_DIR)}`)
}

run().catch(e => { console.error(e); process.exit(1) })
