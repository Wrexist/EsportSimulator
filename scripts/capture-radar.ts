#!/usr/bin/env tsx
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const EXE = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const OUT = path.join(process.cwd(), "tmp", "radar")

async function run() {
    fs.mkdirSync(OUT, { recursive: true })
    const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE, headless: true } : { headless: true })
    const page = await (await browser.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 })).newPage()
    page.setDefaultTimeout(20000)
    await page.goto("http://127.0.0.1:3001/dev/radar-preview")
    await page.waitForTimeout(4000)

    // Dismiss the global onboarding tutorial if it auto-fired.
    const skip = page.locator('button[aria-label="Skip tutorial"]')
    try { await skip.waitFor({ state: "visible", timeout: 4000 }); await skip.click(); await page.waitForTimeout(700) } catch { /* none */ }

    const panel = page.locator('.glass-panel-dark').filter({ hasText: "RADAR" }).first()
    await page.screenshot({ path: path.join(OUT, "page_2_5d.png") })
    if (await panel.isVisible().catch(() => false)) {
        await panel.screenshot({ path: path.join(OUT, "panel_2_5d.png") })
        console.log("  ✓ 2.5D shots")
    }

    // Toggle to flat 2D.
    const toggle = page.locator('[title="Toggle 2.5D perspective view"]').first()
    if (await toggle.isVisible().catch(() => false)) {
        await toggle.click()
        await page.waitForTimeout(1000)
        if (await panel.isVisible().catch(() => false)) {
            await panel.screenshot({ path: path.join(OUT, "panel_flat.png") })
            console.log("  ✓ flat shot")
        }
    }
    await browser.close()
    console.log("done →", OUT)
}
run().catch(e => { console.error(e); process.exit(1) })
