#!/usr/bin/env tsx
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const EXE = process.env.PW_CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const OUT = path.join(process.cwd(), "tmp", "radar")

async function run() {
    fs.mkdirSync(OUT, { recursive: true })
    const launchArgs = ["--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    const browser = await chromium.launch(fs.existsSync(EXE)
        ? { executablePath: EXE, headless: true, args: launchArgs }
        : { headless: true, args: launchArgs })
    const page = await (await browser.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 })).newPage()
    page.setDefaultTimeout(60000)
    await page.goto("http://127.0.0.1:3001/dev/radar-preview", { waitUntil: "domcontentloaded", timeout: 60000 })
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
    const flat = page.locator('[title="2D radar view"]').first()
    if (await flat.isVisible().catch(() => false)) {
        await flat.click()
        await page.waitForTimeout(900)
        if (await panel.isVisible().catch(() => false)) {
            await panel.screenshot({ path: path.join(OUT, "panel_flat.png") })
            console.log("  ✓ flat shot")
        }
    }

    // True 3D (WebGL) — wait for the canvas to mount and render a few frames.
    const threeD = page.locator('[title="3D radar view"]').first()
    if (await threeD.isVisible().catch(() => false)) {
        await threeD.click()
        try { await panel.locator("canvas").waitFor({ state: "visible", timeout: 15000 }) } catch { /* canvas may be slow */ }
        await page.waitForTimeout(4500)
        await page.screenshot({ path: path.join(OUT, "page_3d.png") })
        if (await panel.isVisible().catch(() => false)) {
            await panel.screenshot({ path: path.join(OUT, "panel_3d.png") })
            console.log("  ✓ 3D shots")
        }
    }
    await browser.close()
    console.log("done →", OUT)
}
run().catch(e => { console.error(e); process.exit(1) })
