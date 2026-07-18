#!/usr/bin/env tsx
/**
 * Deeper capture pass — advances several weeks so match/trophy/live screens are
 * populated, and verifies the hover-only effects (card lift, CTA hover sweep).
 * Best-effort: each step is independent so a missing button never aborts the run.
 * Uses the pre-installed chromium (PW_CHROMIUM_PATH) when the Playwright CDN is blocked.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, Page } from "playwright"

const BASE = "http://127.0.0.1:3001"
const OUT = path.join(process.cwd(), "tmp", "deep")
const EXE = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const VIEWPORT = { width: 1680, height: 1050 }

async function shoot(page: Page, slug: string) {
    fs.mkdirSync(OUT, { recursive: true })
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => { })
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT, `${slug}.png`) })
    console.log(`  ✓ ${slug}.png`)
}
async function clickText(page: Page, ...sels: string[]) {
    for (const s of sels) {
        const l = page.locator(s).first()
        if (await l.isVisible().catch(() => false)) { await l.click({ timeout: 4000 }).catch(() => { }); return true }
    }
    return false
}
async function step(label: string, fn: () => Promise<void>) {
    try { console.log(label); await fn() } catch (e) { console.warn(`  ! ${label}: ${e instanceof Error ? e.message : e}`) }
}
async function dismissTutorial(page: Page) {
    const skip = page.locator('button[aria-label="Skip tutorial"]')
    try { await skip.waitFor({ state: "visible", timeout: 3500 }); await skip.click().catch(() => { }); await page.waitForTimeout(400) } catch { /* none */ }
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
        await page.locator('input[placeholder*="name"]').first().fill("Jordan Vale")
        await clickText(page, 'button:has-text("Choose Existing Team")', 'button:has-text("Continue")')
        await page.waitForTimeout(1600)
        const cands = ['div.cursor-pointer:has(img)', 'div[role="button"]:has(img)', "main img"]
        for (const s of cands) { const l = page.locator(s).first(); if (await l.isVisible().catch(() => false)) { await l.click().catch(() => { }); break } }
        await page.waitForTimeout(400)
        await clickText(page, 'button:has-text("START CAREER")', 'button:has-text("Start Career")', 'button:has-text("Start")')
        await page.waitForURL(/127\.0\.0\.1:3001\/(\?|$)/, { timeout: 30_000 }).catch(() => { })
        await page.waitForTimeout(2200)
        await dismissTutorial(page)
    })

    // Hover verification — CTA hover sweep (capture the button mid one-shot sweep).
    await step("cta-hover-sweep", async () => {
        const cta = page.locator('button:has-text("NEXT DAY"), button:has-text("PLAY MATCH")').first()
        if (await cta.isVisible().catch(() => false)) {
            await cta.hover()
            await page.waitForTimeout(300) // ~mid of the 0.7s sweep
            await cta.screenshot({ path: path.join(OUT, "cta_hover_sweep.png") })
            console.log("  ✓ cta_hover_sweep.png")
        }
    })

    // Register for an open qualifier so the player actually has matches to play.
    await step("register-tournament", async () => {
        await page.goto(`${BASE}/tournaments`)
        await page.waitForTimeout(1500)
        await dismissTutorial(page)
        const reg = page.locator('button:has-text("REGISTER")').first()
        if (await reg.isVisible().catch(() => false)) {
            await reg.click()
            await page.waitForTimeout(800)
            await clickText(page, 'button:has-text("Confirm")', 'button:has-text("Register")', 'button:has-text("Yes")', 'button:has-text("Enter")', 'button:has-text("Sign Up")')
            await page.waitForTimeout(900)
            console.log("  registered (or attempted)")
        } else {
            console.log("  no REGISTER button found")
        }
    })

    // Advance until the player's match is ready (PLAY MATCH appears in the topbar).
    // NB: never press Escape — the shell binds Escape to router.back().
    await step("advance-to-match", async () => {
        for (let i = 0; i < 45; i++) {
            await clickText(page, 'button:has-text("Continue")', 'button:has-text("Got it")', 'button:has-text("Acknowledge")', 'button:has-text("Dismiss")', 'button:has-text("Close")')
            if (await page.locator('button:has-text("PLAY MATCH"), a:has-text("PLAY MATCH")').first().isVisible().catch(() => false)) {
                console.log(`  PLAY MATCH ready (iter ${i})`); break
            }
            const advanced = await clickText(page, 'button:has-text("NEXT DAY")', 'button:has-text("SKIP WEEK")')
            if (!advanced) { console.log(`  no advance button (iter ${i})`); break }
            await page.waitForTimeout(1500)
        }
    })

    await step("deep-dashboard", async () => { await page.goto(`${BASE}/`); await page.waitForTimeout(1400); await dismissTutorial(page); await shoot(page, "deep_dashboard") })
    await step("deep-trophies", async () => { await page.goto(`${BASE}/trophies`); await page.waitForTimeout(1200); await dismissTutorial(page); await shoot(page, "deep_trophies") })
    await step("deep-tournaments", async () => { await page.goto(`${BASE}/tournaments`); await page.waitForTimeout(1200); await dismissTutorial(page); await shoot(page, "deep_tournaments") })

    // PLAY MATCH sheen — freeze the constant sweep mid-button for a clean proof.
    await step("playmatch-sheen", async () => {
        const play = page.locator('button:has-text("PLAY MATCH"), a:has-text("PLAY MATCH")').first()
        if (!(await play.isVisible().catch(() => false))) { await shoot(page, "no_playmatch"); throw new Error("no PLAY MATCH available") }
        await page.addStyleTag({ content: `.liquid-cta-shine::before { animation-delay: -4.6s !important; animation-play-state: paused !important; }` })
        await page.waitForTimeout(300)
        await play.screenshot({ path: path.join(OUT, "playmatch_sheen.png") })
        console.log("  ✓ playmatch_sheen.png")
    })

    // Match flow → live, to capture the Tactical Timeout (B5).
    await step("match-live", async () => {
        const play = page.locator('button:has-text("PLAY MATCH"), a:has-text("PLAY MATCH")').first()
        if (!(await play.isVisible().catch(() => false))) throw new Error("no PLAY MATCH available")
        await play.click()
        await page.waitForURL(/\/match\//, { timeout: 10_000 })
        await page.waitForTimeout(1500)
        const id = page.url().match(/\/match\/([^/?]+)/)?.[1]
        if (!id) throw new Error("could not parse match id from " + page.url())
        await page.goto(`${BASE}/match/${id}/tactics`); await page.waitForTimeout(1600); await shoot(page, "deep_tactics")
        await page.goto(`${BASE}/match/${id}/live`); await page.waitForTimeout(4000); await shoot(page, "deep_live")
    })

    await browser.close()
    console.log("Done →", path.relative(process.cwd(), OUT))
}
run().catch(e => { console.error(e); process.exit(1) })
