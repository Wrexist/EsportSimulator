/**
 * Steam trailer footage recorder.
 *
 * Plays a fresh career through the real UI (no dev tools, no injected values)
 * and records each trailer scene as a 1080p MP4 clip:
 * team select -> club -> scouting -> player profile -> facilities/economy ->
 * match prep -> live match -> result -> rankings.
 *
 * Frames come from the CDP screencast (every painted frame, timestamped), and
 * ffmpeg re-times them to CFR, so the clip plays back at real speed.
 *
 * Needs a running app:   PORT=3001 npm run dev
 * Run:                   node scripts/trailer/record-trailer.cjs
 * Env:  TRAILER_BASE (default http://localhost:3001), FFMPEG (path to ffmpeg),
 *       TRAILER_ONLY=comma,separated,scene,names
 * Output: tmp/trailer/clips/*.mp4 + tmp/trailer/stills/*.png
 */
const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const BASE = process.env.TRAILER_BASE || "http://localhost:3001"
const ROOT = path.join(process.cwd(), "tmp", "trailer")
const CLIPS = path.join(ROOT, "clips")
const STILLS = path.join(ROOT, "stills")
const FRAMES = path.join(ROOT, "frames")
const TEAM = "Eternal Flame"
const MANAGER = "Alex Morgan"
const FPS = 30

function findFfmpeg() {
    if (process.env.FFMPEG) return process.env.FFMPEG
    for (const p of ["C:\\Program Files\\ShareX\\ffmpeg.exe", "C:\\ffmpeg\\bin\\ffmpeg.exe"]) if (fs.existsSync(p)) return p
    return "ffmpeg"
}
const FFMPEG = findFfmpeg()
const HIDE_CSS = "nextjs-portal,.z-devtools,[data-nextjs-toast]{display:none!important}"
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function step(label, fn) {
    const t = Date.now()
    try { console.log(`> ${label}`); await fn(); console.log(`  ok (${((Date.now() - t) / 1000).toFixed(1)}s)`) }
    catch (e) { console.warn(`  ! ${label}: ${e && e.message ? e.message.split("\n")[0] : e}`) }
}

/** Record `ms` of the page while `action` runs; writes CLIPS/<name>.mp4. */
async function record(page, name, ms, action) {
    const dir = path.join(FRAMES, name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    const cdp = await page.context().newCDPSession(page)
    const frames = []
    cdp.on("Page.screencastFrame", f => {
        const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`)
        fs.writeFileSync(file, Buffer.from(f.data, "base64"))
        frames.push({ file, t: f.metadata.timestamp })
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => { })
    })
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 })
    const start = Date.now() / 1000
    // Nudge a repaint so a static page still yields a first frame.
    await page.evaluate(() => { document.body.style.outline = "0px solid transparent" }).catch(() => { })
    await Promise.all([action ? action().catch(e => console.warn(`  ! action: ${e.message.split("\n")[0]}`)) : null, sleep(ms)])
    const end = Date.now() / 1000
    await cdp.send("Page.stopScreencast").catch(() => { })
    await sleep(150)
    await cdp.detach().catch(() => { })
    if (frames.length === 0) { console.warn(`  ! ${name}: no frames`); return }

    // Concat list: each frame held until the next one arrived.
    const lines = []
    const t0 = Math.max(frames[0].t, start)
    for (let i = 0; i < frames.length; i++) {
        const from = i === 0 ? t0 : frames[i].t
        const to = i + 1 < frames.length ? frames[i + 1].t : end
        lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, to - from).toFixed(4)}`)
    }
    lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`)
    const list = path.join(dir, "list.txt")
    fs.writeFileSync(list, lines.join("\n"))
    const out = path.join(CLIPS, `${name}.mp4`)
    execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
        // Kept VFR (real frame timing) so the cutter can motion-interpolate.
        "-vf", "scale=1920:1080:flags=lanczos,format=yuv420p", "-fps_mode", "vfr", "-video_track_timescale", "90000",
        "-c:v", "libx264", "-preset", "slow", "-crf", "14", out])
    fs.rmSync(dir, { recursive: true, force: true })
    console.log(`  rec ${name}.mp4  ${frames.length} frames / ${(end - start).toFixed(1)}s`)
}

// Last known pointer position, so moves start where the cursor is.
let pointer = [1900, 1070]

/** Glide the mouse (drawn by CURSOR_JS) so hover states animate like a real player. */
async function drift(page, from, to, ms) {
    const t0 = Date.now()
    while (true) {
        const u = Math.min(1, (Date.now() - t0) / ms)
        const k = 0.5 - 0.5 * Math.cos(Math.PI * u)
        await page.mouse.move(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k)
        if (u >= 1) break
        await sleep(12)
    }
    pointer = to
}

/** Move to an element like a player would, then click it. */
async function act(page, locator, ms = 650) {
    await locator.scrollIntoViewIfNeeded({ timeout: 3_000 }).catch(() => { })
    const b = await locator.boundingBox({ timeout: 3_000 }).catch(() => null)
    if (!b) { console.warn("  ! act: target not found"); return false }
    const to = [b.x + b.width / 2, b.y + b.height / 2]
    await drift(page, pointer[0] > 1880 ? [1500, 820] : pointer, to, ms)
    await sleep(140)
    await locator.click({ timeout: 5_000 }).catch(() => { })
    return true
}

// Headless pages have no visible pointer: draw one that follows the mouse and
// pulses on click. Hidden while parked in the bottom-right corner.
const CURSOR_JS = () => {
    const install = () => {
        if (document.getElementById("__trailer_cursor")) return
        const c = document.createElement("div")
        c.id = "__trailer_cursor"
        c.style.cssText = "position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;display:none;will-change:transform"
        c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#0b1220" stroke-width="1.6" stroke-linejoin="round"/></svg>'
        document.body.appendChild(c)
        let x = 0, y = 0
        document.addEventListener("mousemove", e => {
            x = e.clientX; y = e.clientY
            c.style.display = x > 1880 && y > 1050 ? "none" : "block"
            c.style.transform = `translate(${x - 3}px,${y - 2}px)`
        }, true)
        document.addEventListener("mousedown", () => {
            const r = document.createElement("div")
            r.style.cssText = `position:fixed;left:${x - 22}px;top:${y - 22}px;width:44px;height:44px;border-radius:50%;border:3px solid #ffc940;z-index:2147483646;pointer-events:none;transition:transform .45s ease-out,opacity .45s ease-out;transform:scale(.3);opacity:1`
            document.body.appendChild(r)
            requestAnimationFrame(() => { r.style.transform = "scale(1.5)"; r.style.opacity = "0" })
            setTimeout(() => r.remove(), 600)
        }, true)
    }
    if (document.body) install(); else document.addEventListener("DOMContentLoaded", install)
}

async function settle(page, ms = 3500) {
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => { })
    await page.evaluate(async () => {
        await document.fonts.ready
        // Only on-screen images: decoding every portrait on the team wall at
        // once crashes the renderer.
        const onScreen = [...document.images].filter(i => {
            const r = i.getBoundingClientRect()
            return r.bottom > 0 && r.top < innerHeight && r.width > 0
        })
        await Promise.all(onScreen.slice(0, 60).map(i => i.decode().catch(() => { })))
    }).catch(() => { })
    await sleep(ms)
    await page.mouse.move(1900, 1070)
    pointer = [1900, 1070]
}

async function skipGuides(page) {
    for (const name of ["Skip first session guide", "Skip tutorial"]) {
        const b = page.getByRole("button", { name }).first()
        if (await b.isVisible().catch(() => false)) { await b.click().catch(() => { }); await sleep(500) }
    }
}

async function go(page, route) {
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await settle(page)
    await skipGuides(page)
    console.log(`  ${route} -> ${new URL(page.url()).pathname}`)
}

async function still(page, name) {
    await page.screenshot({ path: path.join(STILLS, `${name}.png`) })
}

async function run() {
    for (const d of [CLIPS, STILLS, FRAMES]) fs.mkdirSync(d, { recursive: true })
    const only = (process.env.TRAILER_ONLY || "").split(",").filter(Boolean)
    const want = n => only.length === 0 || only.some(o => n.startsWith(o))

    const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--force-color-profile=srgb", "--hide-scrollbars"] })
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    await context.addInitScript(css => {
        const add = () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s) }
        if (document.head) add(); else document.addEventListener("DOMContentLoaded", add)
    }, HIDE_CSS)
    await context.addInitScript(CURSOR_JS)
    const page = await context.newPage()
    page.setDefaultTimeout(60_000)
    page.on("crash", () => console.warn("  !! renderer crashed"))
    page.on("pageerror", e => console.warn(`  pageerror: ${String(e.message).slice(0, 160)}`))

    // ---------- Team select: the wall of clubs, then pick the underdog ----------
    await step("New game + team select", async () => {
        await page.goto(BASE + "/new-game", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await page.locator('input[placeholder*="name"]').first().waitFor({ timeout: 180_000 })
        await settle(page, 1500)
        if (want("00")) await record(page, "00_welcome_counts", 5000, async () => {
            await sleep(800)
            await page.locator('input[placeholder*="name"]').first().pressSequentially(MANAGER, { delay: 90 })
        })
        else await page.locator('input[placeholder*="name"]').first().fill(MANAGER)
        await still(page, "00_welcome")
        await page.getByRole("button", { name: "Choose Existing Team" }).click()
        await page.getByRole("heading", { name: TEAM, exact: true }).first().waitFor({ timeout: 120_000 })
        await settle(page, 2500)
        if (want("01")) await record(page, "01_team_wall", 4500)
        await still(page, "team_select")
        const flame = page.getByRole("heading", { name: TEAM, exact: true }).first()
        await flame.scrollIntoViewIfNeeded()
        await settle(page, 800)
        const box = await flame.boundingBox()
        if (want("03")) await record(page, "03_pick_eternal_flame", 6000, async () => {
            if (box) await drift(page, [1500, 900], [box.x + box.width / 2, box.y + box.height / 2], 1000)
            await sleep(250)
            await flame.click()
        })
        else await flame.click()
        await still(page, "team_selected")
        await page.getByRole("button", { name: "START CAREER", exact: true }).click()
        await page.getByRole("heading", { name: "Club overview", exact: true }).waitFor({ timeout: 180_000 })
        await settle(page, 2500)
        await skipGuides(page)
        // A new career reaches the save file a while after it starts; reload
        // before that and the game boots to the welcome screen.
        await sleep(30_000)
        console.log(`  career url: ${new URL(page.url()).pathname}`)
    })

    // ---------- Develop the career so screens aren't empty-state ----------
    // TRAILER_WEEKS=n plays up to week n through the game's own controls: SKIP WEEK, and
    // when a match blocks the week, the tactics page's "Simulate Result Instantly".
    // Results, standings, form and finances fill in; nothing is injected.
    const weeks = Number(process.env.TRAILER_WEEKS || 0)
    if (weeks > 0) await step(`Play to week ${weeks}`, async () => {
        const dismiss = page.getByRole("button", { name: /^\s*(continue|close|got it|ok|dismiss)/i }).first()
        const clearModals = async () => { for (let i = 0; i < 6 && await dismiss.isVisible().catch(() => false); i++) { await dismiss.click().catch(() => { }); await sleep(800) } }
        const home = async () => {
            const link = page.getByRole("link", { name: "Home", exact: true }).first()
            if (await link.isVisible().catch(() => false)) { await link.click().catch(() => { }); await settle(page, 1500) }
        }
        const weekNow = async () => Number(((await page.locator("body").innerText().catch(() => "")).match(/WEEK (\d+)/) || [])[1] || 0)
        await home()
        for (let guard = 0; guard < 40 && await weekNow() < weeks; guard++) {
            await clearModals()
            const play = page.getByRole("button", { name: "Play match", exact: true })
            if (await play.isVisible().catch(() => false)) {
                await play.click().catch(() => { })
                await page.waitForURL(/\/tactics/, { timeout: 60_000 }).catch(() => { })
                await settle(page, 2500)
                const qveto = page.getByRole("button", { name: "Quick Sim Veto", exact: true })
                if (await qveto.isVisible().catch(() => false)) { await qveto.click().catch(() => { }); await sleep(6000) }
                await page.locator('button[title="Simulate Result Instantly"]').first().click({ timeout: 30_000 }).catch(() => { })
                await page.waitForURL(/\/result/, { timeout: 90_000 }).catch(() => { })
                await settle(page, 1500)
                await home()
                continue
            }
            await page.getByRole("button", { name: "SKIP WEEK", exact: true }).click({ timeout: 15_000 }).catch(() => { })
            await sleep(5000)
        }
        await clearModals()
        await sleep(2000)
        console.log(`  now: week ${await weekNow()} · ${(await page.locator("body").innerText().catch(() => "")).match(/#\d+ World/)?.[0] || ""}`)
    })

    // ---------- Interactive feature beats: the cursor does something on each page ----------
    const btn = (name, exact = true) => page.getByRole("button", { name, exact }).first()
    const interactions = [
        ["40_weekly_focus", "/", async () => {
            await act(page, page.getByRole("button", { name: /Intensive Bootcamp/ }).first(), 900)
            await sleep(1200)
            await act(page, page.getByRole("button", { name: /Team Bonding/ }).first(), 700)
        }],
        ["41_sponsor_accept", "/sponsorships", async () => { await act(page, btn("Accept"), 900) }],
        ["42_staff_offer", "/staff", async () => {
            await act(page, btn("MAKE OFFER"), 900)
            await sleep(1500)
            const confirm = page.getByRole("button", { name: /^(confirm|send offer|hire|sign)/i }).first()
            if (await confirm.isVisible().catch(() => false)) await act(page, confirm, 600)
        }],
        ["43_equipment_browse", "/equipment", async () => {
            for (const tab of ["Mouse", "Headset", "Gaming PC"]) { await act(page, btn(tab), 450); await sleep(700) }
        }],
        ["44_campus_build", "/basecamp", async () => {
            await act(page, page.getByRole("button", { name: /Performance Center/ }).first(), 800)
            await sleep(700)
            await act(page, btn("CONSTRUCT FACILITY"), 700)
        }],
        ["45_academy_open", "/academy", async () => { await act(page, btn("Establish Academy"), 900) }],
        ["46_training_drill", "/training", async () => {
            await act(page, btn("FULL T Side"), 800)
            await sleep(500)
            await act(page, btn("DOUBLE AWP CT Side"), 500)
            await sleep(500)
            await act(page, btn("START TRAINING"), 600)
        }],
        ["47_transfer_buy", "/transfers", async () => {
            await act(page, btn("AWPER"), 700)
            await sleep(700)
            await act(page, btn("BUY"), 700)
        }],
        ["48_fpl", "/fpl", async () => { await act(page, btn("FPL Challenger"), 800); await sleep(900); await act(page, btn("FPL Pro"), 600) }],
        ["49_create_team", "/new-game/create-team", async () => { await sleep(600) }],
    ]
    for (const [name, route, action] of interactions) {
        if (!want(name.slice(0, 2))) continue
        await step(`Scene ${name}`, async () => {
            await go(page, route)
            await record(page, name, 5500, async () => { await sleep(500); await action(); await sleep(400) })
            await still(page, name)
        })
    }

    // ---------- Club + management screens ----------
    // Held shots, no scrolling: headless capture can't keep up with scroll
    // repaints (~18fps), so camera motion is added in the cut instead.
    const pages = [
        ["04_club_overview", "/"],
        ["05_squad", "/squad"],
        ["08_transfers", "/transfers"],
        ["09_basecamp", "/basecamp"],
        ["10_equipment", "/equipment"],
        ["11_finances", "/finances"],
        ["12_training", "/training"],
        ["13_staff", "/staff"],
        ["14_sponsors", "/sponsorships"],
        ["15_rankings_before", "/rankings"],
        ["16_schedule", "/schedule"],
        ["17_tournaments", "/tournaments"],
        ["28_academy", "/academy"],
        ["29_statistics", "/stats"],
    ]
    for (const [name, route] of pages) {
        if (!want(name.slice(0, 2))) continue
        await step(`Scene ${name}`, async () => {
            await go(page, route)
            await still(page, name)
            await record(page, name, 4500)
        })
    }

    // ---------- Scouting: browse and open a prospect ----------
    if (want("06")) await step("Scene 06_scouting", async () => {
        await go(page, "/scouting")
        await still(page, "06_scouting")
        await record(page, "06_scouting", 10000, async () => {
            await drift(page, [1700, 950], [900, 420], 1200)
            const rows = page.locator("main tr, main [role='row'], main [data-player-row]")
            const n = await rows.count().catch(() => 0)
            for (let i = 1; i < Math.min(n, 7); i++) {
                const b = await rows.nth(i).boundingBox().catch(() => null)
                if (b) await drift(page, [b.x + 200, b.y - 40], [b.x + 200, b.y + b.height / 2], 280)
            }
            const pick = page.getByText("kyxsen", { exact: true }).first()
            if (await pick.isVisible().catch(() => false)) await pick.click()
            else if (n > 2) await rows.nth(2).click().catch(() => { })
            await sleep(2500)
        })
    })

    // ---------- Player profile (radar chart) ----------
    if (want("07")) await step("Scene 07_player_profile", async () => {
        await go(page, "/squad")
        const link = page.locator('a[href^="/player/"]').first()
        await link.click()
        await page.waitForURL(/\/player\//)
        await settle(page, 3000)
        await still(page, "07_player_profile")
        await record(page, "07_player_profile", 5000)
    })

    // ---------- Match day: tactics -> veto (Sandstone) -> live -> result ----------
    // The trailer tells an underdog story, so keep playing match days until one
    // is won on Sandstone; each attempt overwrites the previous match clips.
    if (want("18") || want("19") || want("2")) await step("Match day", async () => {
      for (let matchTry = 1; matchTry <= 4; matchTry++) {
        // The veto result is authoritative, and the AI can ban Sandstone (every
        // other pool map carries a Valve name/radar). If that happens, play
        // that match out at max speed and try again on the next match day.
        let onSandstone = false
        for (let attempt = 1; attempt <= 6 && !onSandstone; attempt++) {
            // In-app navigation: a brand-new career may not be in the save
            // file yet, and a full reload would land on the welcome screen.
            const homeLink = page.getByRole("link", { name: "Home", exact: true }).first()
            if (await homeLink.isVisible().catch(() => false)) { await homeLink.click().catch(() => { }); await settle(page, 2500) }
            else await go(page, "/")
            console.log(`  home url: ${new URL(page.url()).pathname}`)
            // Advance to the next match day (Escape here backs out of the career).
            const playMatch = page.getByRole("button", { name: "Play match", exact: true })
            for (let i = 0; i < 20; i++) {
                // Modals (weekly summary) dim the page but leave "Next day"
                // reported as visible, so clear them first.
                const dismiss = page.getByRole("button", { name: /^\s*(continue|close|got it|ok|dismiss)/i }).first()
                if (await dismiss.isVisible().catch(() => false)) { await dismiss.click({ timeout: 5_000 }).catch(() => { }); await sleep(1000); continue }
                if (await playMatch.isVisible().catch(() => false)) break
                await page.getByRole("button", { name: "Next day", exact: true }).click({ timeout: 10_000 }).catch(() => { })
                await sleep(3500)
            }
            if (!(await playMatch.isVisible().catch(() => false))) {
                await still(page, `stuck_attempt_${attempt}`)
                throw new Error(`no match day reached (see stills/stuck_attempt_${attempt}.png)`)
            }
            await playMatch.click()
            await page.waitForURL(/\/tactics/, { timeout: 120_000 })
            await settle(page, 5000)
            if (attempt === 1) {
                await still(page, "18_tactics")
                await record(page, "18_tactics", 5000)
            }

            // Manual veto steering toward Sandstone; the veto screen shows
            // licensed-looking map art, so it isn't recorded.
            await page.getByRole("button", { name: "Start Manual Veto", exact: true }).click()
            await page.waitForURL(/\/veto/, { timeout: 60_000 })
            for (let i = 0; i < 120; i++) {
                if (/\/tactics/.test(page.url())) break
                const status = (await page.locator("h3").allTextContents().catch(() => [])).join(" ")
                const side = page.getByRole("button", { name: /^CT/ }).first()
                if (await side.isVisible().catch(() => false)) { await side.click().catch(() => { }); await sleep(800); continue }
                if (/Your turn to (BAN|PICK)/i.test(status)) {
                    const open = page.locator('[role="button"][aria-label$=": select map"]')
                    const labels = await open.evaluateAll(els => els.map(e => e.getAttribute("aria-label")))
                    const sand = labels.find(l => l.startsWith("Sandstone"))
                    let target
                    if (/PICK/i.test(status)) target = sand || labels[0]
                    else target = labels.find(l => !l.startsWith("Sandstone")) || labels[0]
                    if (target) await page.locator(`[role="button"][aria-label="${target}"]`).click().catch(() => { })
                    await sleep(900)
                    continue
                }
                const cont = page.getByRole("button", { name: /continue|confirm|to match hub|done/i }).first()
                if (await cont.isVisible().catch(() => false)) await cont.click().catch(() => { })
                await sleep(700)
            }
            await page.waitForURL(/\/tactics/, { timeout: 60_000 })
            await settle(page, 3000)
            await page.getByRole("button", { name: "START GAME", exact: true }).click()
            await page.waitForURL(/\/live/, { timeout: 120_000 })
            await page.getByText(/RND \d+/).first().waitFor({ timeout: 120_000 })
            await settle(page, 1500)
            onSandstone = /sandstone/i.test(await page.locator("main").innerText().catch(() => ""))
            console.log(`  attempt ${attempt}: ${onSandstone ? "Sandstone" : "other map, skipping match"}`)
            if (!onSandstone) {
                // SKIP MATCH doesn't commit before the match is running, and
                // navigation stays locked until it ends: play it out fast.
                await page.locator('[role="switch"][aria-label^="Auto tactics"][aria-checked="false"]').first().click().catch(() => { })
                const faster = page.locator("button:has(svg.lucide-plus)").first()
                for (let i = 0; i < 6; i++) await faster.click().catch(() => { })
                for (let i = 0; i < 150 && !/\/result/.test(page.url()); i++) {
                    const next = page.getByRole("button", { name: /next map|continue|view result|finish|results/i }).first()
                    if (await next.isVisible().catch(() => false)) await next.click().catch(() => { })
                    await sleep(4000)
                }
                await settle(page, 1500)
            }
        }
        if (!onSandstone) throw new Error("veto never landed on Sandstone")
        const toTop = () => page.evaluate(() => {
            scrollTo(0, 0)
            document.querySelectorAll("*").forEach(e => { if (e.scrollTop > 0) e.scrollTop = 0 })
        }).catch(() => { })
        await toTop()
        await still(page, "19_live_start")

        // Round 1 at native speed: radar movement + first contacts.
        await record(page, "19_live_r1", 40000)

        // Between rounds the manager calls the buy — a strong trailer beat.
        const stratPanel = page.getByText(/Select Strategy/i).first()
        await stratPanel.waitFor({ timeout: 90_000 }).catch(() => { })
        await stratPanel.scrollIntoViewIfNeeded().catch(() => { })
        await still(page, "20_buy_call")
        await record(page, "20_buy_call", 7000, async () => {
            const buy = page.locator(".tactical-decisions button:not([disabled])").filter({ hasText: /Full buy|Force buy|Half buy/i }).last()
            const b = await buy.boundingBox()
            if (b) await drift(page, [1500, 500], [b.x + b.width / 2, b.y + b.height / 2], 1400)
            await sleep(400)
            await buy.click().catch(() => { })
        })

        // Engine picks the buys from here so the match keeps flowing.
        await page.locator('[role="switch"][aria-label^="Auto tactics"]').first().click().catch(() => { })
        await toTop()
        const plus = page.locator("button:has(svg.lucide-plus)").first()
        for (let i = 0; i < 2; i++) await plus.click().catch(() => { })
        await page.mouse.move(1900, 1070)
        await record(page, "21_live_fast", 50000)
        await still(page, "21_live_fast")
        const timeout = page.getByRole("button", { name: /TACTICAL TIMEOUT/i }).first()
        await toTop()
        await record(page, "22_live_timeout", 12000, async () => {
            await sleep(1500)
            if (await timeout.isEnabled().catch(() => false)) {
                const b = await timeout.boundingBox()
                if (b) await drift(page, [1500, 700], [b.x + b.width / 2, b.y + b.height / 2], 900)
                await timeout.click().catch(() => { })
            }
            await sleep(600)
            await page.mouse.move(1900, 1070)
        })
        await toTop()
        await record(page, "23_live_late", 50000)
        await still(page, "23_live_late")

        // Let the match finish at max speed, grabbing the closing rounds.
        for (let i = 0; i < 4; i++) await plus.click().catch(() => { })
        let grabbed = false
        for (let i = 0; i < 240 && !/\/result/.test(page.url()); i++) {
            const score = (await page.getByText(/^\d{1,2}$/).allTextContents().catch(() => [])).map(Number)
            if (!grabbed && score.some(s => s >= 11)) {
                grabbed = true
                await toTop()
                await record(page, "24_live_closing", 40000)
                continue
            }
            const next = page.getByRole("button", { name: /next map|continue|view result|finish|results/i }).first()
            if (await next.isVisible().catch(() => false)) await next.click().catch(() => { })
            await sleep(4000)
        }
        console.log(`  end url: ${new URL(page.url()).pathname}`)
        await settle(page, 1000)
        await still(page, "25_result")
        await record(page, "25_result", 10000)
        // Player's club is the home side (left); compare the two big scores.
        const won = await page.evaluate(() => {
            const nums = [...document.querySelectorAll("main *")]
                .filter(e => e.children.length === 0 && /^\d{1,2}$/.test(e.textContent.trim())
                    && parseFloat(getComputedStyle(e).fontSize) >= 30)
                .map(e => Number(e.textContent.trim()))
            return nums.length >= 2 ? nums[0] > nums[1] : null
        })
        console.log(`  match ${matchTry}: ${won ? "won" : "lost"}`)
        if (won !== false) break
      }
    })

    if (want("26")) await step("Scene 26_rankings_after", async () => {
        await go(page, "/rankings")
        await record(page, "26_rankings_after", 4500)
    })
    if (want("27")) await step("Scene 27_trophies", async () => {
        await go(page, "/trophies")
        await record(page, "27_trophies", 4500)
    })

    await browser.close()
    fs.rmSync(FRAMES, { recursive: true, force: true })
    console.log(`\nClips: ${fs.readdirSync(CLIPS).length} in ${path.relative(process.cwd(), CLIPS)}`)
}

run().catch(e => { console.error(e); process.exit(1) })
