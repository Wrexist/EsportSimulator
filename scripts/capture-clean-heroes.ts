#!/usr/bin/env tsx
/**
 * Capture CLEAN gameplay screens (snapshot is now launch-safe: fictional team
 * names, original player handles, no branded portraits) to feed the marketing
 * hero generator. One career drives everything:
 *
 *   home.png   — career manager dashboard ("/")
 *   squad.png  — roster screen (in-app <Link> nav, no reload)
 *   match.png  — live match via /dev "Launch Test BO3" (needs the career's
 *                ELITE teams; career auto-saves on creation so a hard nav to
 *                /dev rehydrates them)
 *
 * No localStorage seeding — it breaks the new-game flow. Instead the 9-step
 * onboarding modal is dismissed once via its "Skip tutorial" button, which
 * persists tutorialCompleted so it never returns. Run against :3001.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, Page, Browser } from "playwright"

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
// Dismiss the onboarding modal; Skip persists tutorialCompleted so it won't
// return on later routes. Retried because it fades in async.
async function dismissTutorial(page: Page) {
    for (let i = 0; i < 6; i++) {
        const skip = page.locator('[aria-label="Skip tutorial"]').first()
        if (await skip.isVisible().catch(() => false)) {
            await skip.click({ timeout: 3000 }).catch(() => { })
            await page.waitForTimeout(500)
            return
        }
        await page.waitForTimeout(700)
    }
    await page.keyboard.press("Escape").catch(() => { })
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
    const browser: Browser = await chromium.launch({
        headless: true, executablePath,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    })
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    page.setDefaultTimeout(20000)

    // --- create a career with a top (ELITE) team; retry the whole flow since a
    //     cold dev server makes the multi-step new-game UI flaky ---
    async function createCareer(): Promise<boolean> {
        await page.goto(`${BASE}/main-menu`, { waitUntil: "domcontentloaded" })
        await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch { } })
        await page.waitForTimeout(500)
        await page.goto(`${BASE}/new-game`, { waitUntil: "domcontentloaded" })
        await page.waitForSelector('input[placeholder*="name"]', { state: "visible", timeout: 30000 }).catch(() => { })
        if (!(await page.locator('input[placeholder*="name"]').first().isVisible().catch(() => false))) return false
        await page.waitForTimeout(700)
        await page.locator('input[placeholder*="name"]').first().fill("Jordan Vale")
        await page.waitForTimeout(400)
        await clickFirst(page, 'button:has-text("Choose Existing Team")')
        await page.waitForSelector('input[placeholder*="Search teams"]', { timeout: 15000 }).catch(() => { })
        await page.waitForTimeout(1500)
        const cards = page.locator('main [role="button"], main button, main .cursor-pointer').filter({ has: page.locator("img") })
        const startBtn = page.locator('button:has-text("START CAREER")').first()
        const n = await cards.count().catch(() => 0)
        for (let i = 0; i < Math.min(n, 14); i++) {
            await cards.nth(i).click({ timeout: 4000 }).catch(() => { })
            await page.waitForTimeout(600)
            if (await startBtn.isVisible().catch(() => false)) break
        }
        if (!(await startBtn.isVisible().catch(() => false))) return false
        await startBtn.click({ timeout: 6000 }).catch(() => { })
        // Success == we leave /new-game for the game shell.
        const left = await page.waitForURL(u => !/\/new-game/.test(u.toString()), { timeout: 40000 }).then(() => true).catch(() => false)
        await page.waitForTimeout(3500)
        return left && !/\/new-game/.test(page.url())
    }

    let created = false
    for (let attempt = 1; attempt <= 3 && !created; attempt++) {
        console.log(`  career attempt ${attempt}…`)
        created = await createCareer()
        console.log(`    -> ${created ? "in-game ✓" : "retry"} (${new URL(page.url()).pathname})`)
    }
    if (!created) { console.error("Could not create a career after 3 attempts"); await browser.close(); process.exit(1) }
    await dismissTutorial(page)
    await page.waitForTimeout(1000)

    // --- HOME dashboard ("/") ---
    if (!/127\.0\.0\.1:\d+\/$/.test(page.url())) {
        await clickFirst(page, 'aside a[href="/"]', 'a[href="/"]:has-text("Home")', 'a[href="/"]')
        await page.waitForTimeout(2500)
    }
    await dismissTutorial(page)
    await hideChrome(page)
    await page.waitForTimeout(800)
    console.log(`  home url -> ${new URL(page.url()).pathname}`)
    if (!/\/main-menu|\/new-game/.test(page.url())) {
        await page.screenshot({ path: path.join(OUT, "home.png") })
        console.log("  ✓ home.png")
    } else { console.warn("  ! no career at home") }

    // --- SQUAD (in-app nav keeps the career in memory) ---
    let onSquad = false
    for (let a = 0; a < 4 && !onSquad; a++) {
        await clickFirst(page, 'aside a[href="/squad"]', 'a[href="/squad"]', 'nav a:has-text("Squad")')
        onSquad = await page.waitForURL(/\/squad(\?|$|\/)/, { timeout: 6000 }).then(() => true).catch(() => false)
    }
    if (onSquad) {
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => { })
        await page.waitForTimeout(2500)
        await hideChrome(page)
        await page.waitForTimeout(600)
        await page.screenshot({ path: path.join(OUT, "squad.png") })
        console.log("  ✓ squad.png")
    } else { console.warn(`  ! never reached /squad (at ${new URL(page.url()).pathname})`) }

    // --- MATCH via /dev (career auto-saved on creation → hard nav rehydrates
    //     the ELITE teams the sandbox needs) ---
    await page.goto(`${BASE}/dev`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForTimeout(4000) // let onRehydrateStorage → loadGame(saveId) reload teams
    await dismissTutorial(page)
    const btn = page.locator('button:has-text("Launch Test BO3")').first()
    await btn.waitFor({ state: "visible", timeout: 15000 }).catch(() => { })
    if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 6000 }).catch(() => { })
        const live = await page.waitForURL(/\/match\/[^/]+\/live/, { timeout: 25000 }).then(() => true).catch(() => false)
        console.log(`  match url -> ${new URL(page.url()).pathname}${live ? "" : " (no live route)"}`)
        await hideChrome(page)
        await page.waitForTimeout(4500)
        await hideChrome(page)
        await page.screenshot({ path: path.join(OUT, "match.png") })
        console.log("  ✓ match.png")
        await page.waitForTimeout(5500)
        await hideChrome(page)
        await page.screenshot({ path: path.join(OUT, "match2.png") })
        console.log("  ✓ match2.png")
    } else { console.warn("  ! Launch Test BO3 not available (teams not loaded?)") }

    await ctx.close()
    await browser.close()
    const files = fs.readdirSync(OUT).filter(f => f.endsWith(".png"))
    console.log(`\nDone — ${files.length} shots: ${files.join(", ")}`)
}
run().catch(e => { console.error(e); process.exit(1) })
