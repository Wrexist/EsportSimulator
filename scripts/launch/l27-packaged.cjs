/**
 * L27: drive the PACKAGED Windows build over the Chrome DevTools Protocol with
 * an isolated profile (--user-data-dir under tmp/), never the real AppData one.
 *
 * The exe must be a COPY with resources/LOCAL-QA-ONLY (disables Steam: no cloud
 * uploads or achievements on the logged-in account).
 *   node scripts/launch/l27-packaged.cjs --mode=startup --exe=<EsportsManager.exe> --label=before --runs=6
 *   node scripts/launch/l27-packaged.cjs --mode=session --exe=<exe> --label=before-early --profile=tmp/l27/pkg/early/profile --weeks=52
 *
 * startup: run 1 uses a brand-new profile (first launch), runs 2..N reuse it.
 *          Time = process spawn -> main menu interactive ("New Career" button
 *          rendered and the save list finished loading).
 * session: (profile seeded by l27-seed-profile.ts) load the career from the
 *          menu, time route changes (number-key shortcuts, client navigation
 *          -> data-route updated -> two animation frames), advance weeks with
 *          Space (own fixtures played via the tactics page's instant sim),
 *          record renderer long tasks, and sample JS heap / DOM nodes / event
 *          listeners / timers after forced GC.
 * Output: docs/launch-readiness/evidence/L27-packaged-<label>.json
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
const { chromium } = require('playwright-core')

const root = path.resolve(__dirname, '../..')
const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const mode = arg('mode', 'startup')
// Default is the LOCAL-QA-ONLY copy, never dist/win-unpacked (Steam-enabled release build).
const exe = path.resolve(arg('exe', 'C:/Users/IsacC/EsportSimulator/tmp/l27qa/app/EsportsManager.exe'))
const label = arg('label', 'run')
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid label')
const port = Number(arg('port', '9341'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const now = () => performance.now()
const stats = values => {
    const s = [...values].sort((a, b) => a - b)
    if (!s.length) return null
    const mean = s.reduce((a, b) => a + b, 0) / s.length
    const q = p => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]
    return { n: s.length, min: +s[0].toFixed(1), median: +((s[Math.floor((s.length - 1) / 2)] + s[Math.floor(s.length / 2)]) / 2).toFixed(1), mean: +mean.toFixed(1), sd: +Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length).toFixed(1), p90: +q(0.9).toFixed(1), max: +s[s.length - 1].toFixed(1) }
}

const INIT = `(() => {
  if (window.__l27) return
  const w = window, l = w.__l27 = { longtasks: [], intervals: new Set(), timeouts: new Set() }
  try { new PerformanceObserver(list => { for (const e of list.getEntries()) l.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch (e) {}
  const si = w.setInterval, ci = w.clearInterval, st = w.setTimeout, ct = w.clearTimeout
  w.setInterval = function (...a) { const id = si.apply(this, a); l.intervals.add(id); return id }
  w.clearInterval = function (id) { l.intervals.delete(id); return ci.call(this, id) }
  w.setTimeout = function (fn, ...rest) { let id; const f = typeof fn === 'function' ? function (...x) { l.timeouts.delete(id); return fn.apply(this, x) } : fn; id = st.call(this, f, ...rest); l.timeouts.add(id); return id }
  w.clearTimeout = function (id) { l.timeouts.delete(id); return ct.call(this, id) }
})()`

// --url=http://127.0.0.1:3100 drives a `next start` production build in Chrome instead of
// the packaged exe (used to measure renderer changes without repackaging). The career is
// copied from the seeded Electron profile's game storage into the page's IndexedDB.
const appUrl = arg('url', '')
async function launchBrowser(profileDir) {
    const browserDir = path.join(profileDir, '..', 'chrome-profile')
    fs.rmSync(browserDir, { recursive: true, force: true })
    const t0 = now()
    const context = await chromium.launchPersistentContext(browserDir, { executablePath: arg('browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe'), headless: false, viewport: { width: 1280, height: 720 }, args: ['--disable-extensions', '--no-first-run'] })
    const page = context.pages()[0] || await context.newPage()
    await page.goto(`${appUrl}/main-menu`)
    const { createGameStorage } = require(path.join(root, 'electron/game-storage.js'))
    const disk = createGameStorage({ root: profileDir, isStorageKey: () => true, maxValueBytes: 64 * 1024 * 1024 })
    const entries = disk.getAllKeys().map(k => [k, disk.getItem(k)])
    for (const [k, v] of entries) {
        await page.evaluate(([key, value]) => new Promise((resolve, reject) => {
            const open = indexedDB.open('EsportsSimDB', 1)
            open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('keyvalue_store')) open.result.createObjectStore('keyvalue_store') }
            open.onerror = () => reject(open.error)
            open.onsuccess = () => { const tx = open.result.transaction('keyvalue_store', 'readwrite'); tx.objectStore('keyvalue_store').put(value, key); tx.oncomplete = () => { open.result.close(); resolve() }; tx.onerror = () => reject(tx.error) }
        }), [k, v])
    }
    await page.reload()
    return { child: null, browser: context, page, t0, tCdp: 0, version: { Browser: context.browser()?.version() ?? 'chrome' }, seededKeys: entries.map(e => e[0]) }
}
async function launch(profileDir) {
    if (appUrl) return launchBrowser(profileDir)
    fs.mkdirSync(profileDir, { recursive: true })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const t0 = now()
    const child = spawn(exe, [`--user-data-dir=${profileDir}`, `--remote-debugging-port=${port}`], { env, stdio: 'ignore', detached: false })
    let version
    for (let i = 0; i < 600 && !version; i++) {
        try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) version = await r.json() } catch { await sleep(50) }
    }
    if (!version) throw Error('CDP endpoint never came up')
    const tCdp = now() - t0
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
    let page
    for (let i = 0; i < 1200 && !page; i++) {
        page = browser.contexts().flatMap(c => c.pages()).find(p => /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(p.url()))
        if (!page) await sleep(50)
    }
    if (!page) throw Error('App page never appeared')
    return { child, browser, page, t0, tCdp, version }
}
async function menuInteractive(page) {
    await page.waitForFunction(() => location.pathname.startsWith('/main-menu') && [...document.querySelectorAll('button')].some(b => /New Career/i.test(b.textContent || '') && b.getBoundingClientRect().width > 0)
        && /No saves yet|SELECT SAVE|CONTINUE CAREER/i.test(document.body.innerText), null, { timeout: 90000, polling: 16 })
}
function kill(child) {
    if (!child) return
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* already gone */ }
}
async function waitGone() { if (appUrl) return; for (let i = 0; i < 100; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); await sleep(100) } catch { return } } }

async function startup() {
    const runs = Number(arg('runs', '6'))
    const profileDir = path.join(root, 'tmp/l27/pkg', `startup-${label}`, 'profile')
    fs.rmSync(path.dirname(profileDir), { recursive: true, force: true })
    const rows = []
    for (let i = 0; i < runs; i++) {
        const { child, browser, page, t0, tCdp, version } = await launch(profileDir)
        await menuInteractive(page)
        const tMenu = now() - t0
        const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null })
        rows.push({ run: i + 1, kind: i === 0 ? 'first launch (new profile)' : 'repeat launch', spawnToCdpMs: Math.round(tCdp), spawnToMenuInteractiveMs: Math.round(tMenu), menuPageNavigation: nav, electron: version.Browser })
        console.log(JSON.stringify(rows.at(-1)))
        await browser.close().catch(() => {})
        kill(child)
        await waitGone()
        await sleep(1500)
    }
    return { rows, summary: { first: rows[0]?.spawnToMenuInteractiveMs, repeat: stats(rows.slice(1).map(r => r.spawnToMenuInteractiveMs)) } }
}

async function heapSnapshot(cdp, file) {
    await cdp.send('HeapProfiler.collectGarbage')
    const stream = fs.createWriteStream(file)
    const onChunk = ({ chunk }) => stream.write(chunk)
    cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk)
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk)
    await new Promise(r => stream.end(r))
}
async function metrics(cdp, page) {
    await cdp.send('HeapProfiler.collectGarbage')
    await sleep(200)
    await cdp.send('HeapProfiler.collectGarbage')
    const { metrics } = await cdp.send('Performance.getMetrics')
    const m = Object.fromEntries(metrics.map(x => [x.name, x.value]))
    const timers = await page.evaluate(() => ({ intervals: window.__l27?.intervals.size ?? null, pendingTimeouts: window.__l27?.timeouts.size ?? null }))
    return { jsHeapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), jsHeapTotalMB: +(m.JSHeapTotalSize / 1048576).toFixed(1), domNodes: m.Nodes, jsEventListeners: m.JSEventListeners, documents: m.Documents, frames: m.Frames, ...timers }
}
const routeOf = { 1: '/', 2: '/desktop', 3: '/squad', 4: '/training', 5: '/schedule', 6: '/transfers', 7: '/tournaments', 8: '/finances' }
async function routeCycle(page, out) {
    for (const key of ['3', '4', '5', '6', '7', '8', '2', '1']) {
        await dismiss(page)
        const t0 = await page.evaluate(() => performance.now())
        await page.keyboard.press(key)
        await page.waitForFunction(r => document.querySelector('[data-route]')?.getAttribute('data-route') === r, routeOf[key], { timeout: 30000, polling: 'raf' })
        const t1 = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now())))))
        out.push({ route: routeOf[key], ms: +(t1 - t0).toFixed(1) })
    }
}
// Celebration / recap / legend-pick modals block shortcuts; acknowledge them the way a player would.
const DISMISS = /^\s*(CLAIM VICTORY|Claim|Continue|Close|Got it|Dismiss|Skip|Not now|Maybe later|Later|OK)\s*$/i
async function dismiss(page) {
    let count = 0
    for (let i = 0; i < 6; i++) {
        const clicked = await page.evaluate(re => {
            const rx = new RegExp(re.source, re.flags)
            const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], .fixed.inset-0')].filter(d => d.getBoundingClientRect().width > 0)
            for (const d of dialogs) {
                const b = [...d.querySelectorAll('button')].find(x => rx.test(x.textContent || '') || /close/i.test(x.getAttribute('aria-label') || ''))
                if (b && !b.disabled) { b.click(); return (b.textContent || b.getAttribute('aria-label') || '').trim() }
            }
            return null
        }, { source: DISMISS.source, flags: DISMISS.flags })
        if (!clicked) {
            // Legend pick (major-win reward): decline, so a scripted session never takes on
            // a six-figure weekly wage it cannot manage. Older builds without Decline sign the first legend.
            if (!(await page.evaluate(() => /CHOOSE YOUR LEGEND/i.test(document.body.innerText)))) break
            const declined = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*Decline\b/i.test(x.textContent || '') && !x.disabled); b?.click(); return !!b })
            if (declined) { count++; await sleep(400); continue }
            const signButton = () => page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^\s*Sign\s/i.test(x.textContent || '') && !x.disabled); b?.click(); return !!b })
            if (!(await signButton())) {
                await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /matches/i.test(b.textContent || '') && /rating/i.test(b.textContent || ''))?.click())
                let ok = false
                for (let k = 0; k < 20 && !ok; k++) { await sleep(150); ok = await signButton() }
                if (!ok) break
            }
        }
        count++
        await sleep(400)
    }
    return count
}
// Largest subtrees (by element count) under the app root, to locate DOM growth.
const domBreakdown = page => page.evaluate(() => {
    const rows = []
    const walk = (el, depth) => {
        const n = el.getElementsByTagName('*').length
        if (n < 400 || depth > 9) return
        const label = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 4).join('.') : ''}${el.getAttribute('aria-label') ? `[aria-label=${el.getAttribute('aria-label')}]` : ''}`
        rows.push({ depth, n, label: label.slice(0, 160), text: (el.innerText || '').slice(0, 80).replace(/\s+/g, ' ') })
        for (const c of el.children) walk(c, depth + 1)
    }
    walk(document.body, 0)
    return { total: document.getElementsByTagName('*').length, path: location.pathname, rows: rows.slice(0, 60) }
})
const weekOf = page => page.evaluate(() => { const m = /WEEK\s+(\d+)/.exec(document.body.innerText); return m ? Number(m[1]) : null })
const REVIEW = '[role="dialog"][aria-label$=" review"]'
const PROCESSING = '[aria-label="Processing week advancement"]'
const controlsReady = page => page.evaluate(([review, processing]) => [...document.querySelectorAll('header button')].some(b => /^\s*(CONTINUE|Play match)\s*$/i.test(b.textContent || '') && !b.disabled)
    && !document.querySelector(review) && !document.querySelector(processing), [REVIEW, PROCESSING])
// The end-of-week review ("WEEK N COMPLETE ... CONTINUE") is a modal over the
// page. Its Continue button is not in the header, so wait-for-header alone stalls
// forever. Dismiss it the way a player would.
const dismissReview = page => page.evaluate(review => {
    const d = document.querySelector(review)
    const b = d && [...d.querySelectorAll('button')].find(x => /^\s*Continue\b/i.test(x.textContent || '') && !x.disabled)
    b?.click()
    return !!b
}, REVIEW)
// Controls are ready when the header offers CONTINUE / Play match and no week
// overlay is up. While waiting, blocking dialogs (week review, trophy, recap,
// legend pick) are acknowledged.
async function idle(page, timeout = 120000) {
    const end = now() + timeout
    while (now() < end) {
        if (await controlsReady(page)) return
        if (!(await page.evaluate(processing => !!document.querySelector(processing), PROCESSING))) {
            if (await dismissReview(page)) { await sleep(100); continue }
            await dismiss(page)
        }
        await sleep(50)
    }
    throw Error('controls never re-enabled within timeout (idle)')
}

async function session() {
    const profileDir = path.resolve(root, arg('profile', ''))
    if (!profileDir.startsWith(path.join(root, 'tmp'))) throw Error('Profile must live under tmp/')
    const weeks = Number(arg('weeks', '52'))
    const { child, browser, page, t0 } = await launch(profileDir)
    const out = { routes: [], weeks: [], samples: [], errors: [] }
    page.on('console', msg => { if (['error', 'warning'].includes(msg.type())) { out.console = out.console || []; if (out.console.length < 200) out.console.push(`${msg.type()}: ${msg.text().slice(0, 300)}`) } })
    try {
        await menuInteractive(page)
        out.menuInteractiveMs = Math.round(now() - t0)
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Performance.enable')
        // The app is a single-document client-routed SPA, so instrumenting the
        // live document once covers the whole session (timer counts start here).
        await page.evaluate(INIT)
        // Load the seeded career from the menu: select the slot, then CONTINUE CAREER.
        await page.waitForFunction(() => !!document.querySelector('[role="button"][aria-pressed]'), null, { timeout: 60000 })
        for (let i = 0; i < 20 && !(await page.evaluate(() => /CONTINUE CAREER/.test(document.body.innerText))); i++) {
            await page.evaluate(() => document.querySelector('[role="button"][aria-pressed]')?.click())
            await sleep(250)
        }
        const loadStart = now()
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /CONTINUE CAREER/.test(b.textContent || ''))?.click())
        await page.waitForFunction(() => document.querySelector('[data-route]')?.getAttribute('data-route') === '/', null, { timeout: 120000 })
        await idle(page)
        out.continueCareerToDashboardMs = Math.round(now() - loadStart)
        await sleep(1500)
        out.samples.push({ at: 'loaded', week: await weekOf(page), ...(await metrics(cdp, page)) })
        for (let c = 0; c < 3; c++) await routeCycle(page, out.routes)
        out.samples.push({ at: 'after-3-route-cycles', week: await weekOf(page), ...(await metrics(cdp, page)) })
        // --heap-at=0,26,52 takes forced-GC heap snapshots before week 1 (0) and after the given weeks.
        const heapAt = new Set(String(arg('heap-at', '')).split(',').filter(Boolean).map(Number))
        const heapFile = tag => path.join(root, 'tmp/l27', `heap-${label}-${tag}.heapsnapshot`)
        fs.mkdirSync(path.join(root, 'tmp/l27'), { recursive: true })
        if (process.argv.includes('--heap') || heapAt.has(0)) await heapSnapshot(cdp, heapFile('start'))
        for (let i = 0; i < weeks; i++) {
            out.dismissed = (out.dismissed || 0) + await dismiss(page)
            const week = await weekOf(page)
            await page.evaluate(() => { window.__l27.longtasks.length = 0 })
            let played = null
            for (let fixture = 0; fixture < 10 && await page.getByRole('button', { name: /^\s*Play match\s*$/i }).count(); fixture++) {
                const s0 = now()
                await page.evaluate(() => [...document.querySelectorAll('header button')].find(b => /Play match/i.test(b.textContent || ''))?.click())
                await page.waitForFunction(() => /\/match\/.+\/tactics/.test(location.pathname), null, { timeout: 60000 })
                // Veto first when required (the tactics page's own "Quick Sim Veto"), then instant sim.
                await page.waitForFunction(() => !!document.querySelector('button[title="Simulate Result Instantly"]') || [...document.querySelectorAll('button')].some(b => /Quick Sim Veto/i.test(b.textContent || '')), null, { timeout: 60000 })
                await page.evaluate(() => { if (!document.querySelector('button[title="Simulate Result Instantly"]')) [...document.querySelectorAll('button')].find(b => /Quick Sim Veto/i.test(b.textContent || ''))?.click() })
                // waitForFunction, not waitForSelector: the ElementHandle that waitForSelector
                // returns stays alive in the CDP remote-object table until disposed. Each one
                // pinned an unmounted tactics page (fibers -> props -> a whole old game state),
                // which was most of the 12 -> 216 MB "session growth" in earlier runs (L27.A3).
                // --legacy-handle-leak reproduces the old behaviour for comparison.
                if (process.argv.includes('--legacy-handle-leak')) await page.waitForSelector('button[title="Simulate Result Instantly"]', { state: 'attached', timeout: 60000 })
                else await page.waitForFunction(() => !!document.querySelector('button[title="Simulate Result Instantly"]'), null, { timeout: 60000 })
                await page.evaluate(() => document.querySelector('button[title="Simulate Result Instantly"]').click())
                await page.waitForFunction(() => /\/match\/.+\/result/.test(location.pathname), null, { timeout: 120000 })
                await page.waitForFunction(() => /Back to Dashboard|MATCH NOT FOUND/i.test(document.body.innerText), null, { timeout: 60000 })
                if (/MATCH NOT FOUND/i.test(await page.evaluate(() => document.body.innerText))) {
                    out.errors.push({ week, error: 'instant sim did not record the fixture (result page: MATCH NOT FOUND)', path: await page.evaluate(() => location.pathname), console: (out.console || []).slice(-15) })
                    try { fs.writeFileSync(path.join(root, 'tmp/l27', `packaged-${label}-notfound.png`), await page.screenshot()) } catch { /* ignore */ }
                    break
                }
                played = (played ?? 0) + Math.round(now() - s0)
                out.fixtureLog = [...(out.fixtureLog || []), { week, path: await page.evaluate(() => location.pathname), text: (await page.evaluate(() => document.body.innerText)).slice(0, 200) }]
                await dismiss(page)
                await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Back to Dashboard/i.test(b.textContent || ''))?.click())
                await page.waitForFunction(() => document.querySelector('[data-route]')?.getAttribute('data-route') === '/', null, { timeout: 60000 })
                await idle(page)
            }
            if (out.errors.length) break
            if (await page.getByRole('button', { name: /^\s*Play match\s*$/i }).count()) { out.errors.push({ week, error: 'own fixture still pending after 10 plays; stopping' }); try { fs.writeFileSync(path.join(root, 'tmp/l27', `packaged-${label}-pending.png`), await page.screenshot()) } catch { /* ignore */ } break }
            const s0 = now()
            await page.evaluate(() => [...document.querySelectorAll('header button')].find(b => /^\s*CONTINUE\s*$/i.test(b.textContent || ''))?.click())
            await page.waitForFunction(w => { const m = /WEEK\s+(\d+)/.exec(document.body.innerText); return m && Number(m[1]) > w }, week, { timeout: 180000, polling: 50 })
            const tWeek = now() - s0
            // Same end point as earlier runs: processing finished and the header
            // controls are enabled (the week review may still be on top).
            await page.waitForFunction(([review, processing]) => !document.querySelector(processing) && ([...document.querySelectorAll('header button')].some(b => /^\s*(CONTINUE|Play match)\s*$/i.test(b.textContent || '') && !b.disabled) || !!document.querySelector(review)), [REVIEW, PROCESSING], { timeout: 180000, polling: 50 })
            const tIdle = now() - s0
            await idle(page)
            const longtasks = await page.evaluate(() => window.__l27.longtasks.slice())
            out.weeks.push({ week, ownMatchFlowMs: played, toNextWeekShownMs: Math.round(tWeek), toControlsEnabledMs: Math.round(tIdle), longTaskCount: longtasks.length, longTaskTotalMs: longtasks.reduce((a, t) => a + t[1], 0), longestTaskMs: longtasks.reduce((a, t) => Math.max(a, t[1]), 0) })
            console.log(JSON.stringify(out.weeks.at(-1)))
            if ((i + 1) % 13 === 0) {
                await routeCycle(page, out.routes)
                out.samples.push({ at: `after-week-${i + 1}`, week: await weekOf(page), ...(await metrics(cdp, page)) })
                console.log(JSON.stringify(out.samples.at(-1)))
            }
            if (heapAt.has(i + 1)) {
                if ((i + 1) % 13 !== 0) out.samples.push({ at: `after-week-${i + 1}`, week: await weekOf(page), ...(await metrics(cdp, page)) })
                await heapSnapshot(cdp, heapFile(`w${i + 1}`))
            }
        }
        out.domBreakdown = await domBreakdown(page)
        if (process.argv.includes('--heap')) await heapSnapshot(await page.context().newCDPSession(page), path.join(root, 'tmp/l27', `heap-${label}-end.heapsnapshot`))
    } catch (error) {
        out.errors.push({ error: String(error && error.stack || error) })
        console.error(error)
        try { fs.writeFileSync(path.join(root, 'tmp/l27', `packaged-${label}-failure.png`), await page.screenshot()) } catch { /* ignore */ }
    } finally {
        await browser.close().catch(() => {})
        kill(child)
        await waitGone()
    }
    const advance = out.weeks
    return { ...out, summary: {
        routeMs: stats(out.routes.map(r => r.ms)), routeByPath: Object.fromEntries(Object.values(routeOf).map(r => [r, stats(out.routes.filter(x => x.route === r).map(x => x.ms))])),
        weekToControlsEnabledMs: stats(advance.map(w => w.toControlsEnabledMs)), longestTaskMs: stats(advance.map(w => w.longestTaskMs)), longTaskTotalMs: stats(advance.map(w => w.longTaskTotalMs)),
        ownMatchFlowMs: stats(advance.filter(w => w.ownMatchFlowMs).map(w => w.ownMatchFlowMs)),
    } }
}

async function main() {
    if (appUrl && mode !== 'session') throw Error('--url supports --mode=session only')
    if (!appUrl) {
        if (!fs.existsSync(exe)) throw Error(`No packaged build at ${exe}`)
        // A release build initializes Steam with the logged-in account: saves are
        // uploaded to that account's Steam Cloud and achievements/stats can be set.
        // Measure only copies carrying resources/LOCAL-QA-ONLY (Steam disabled).
        if (!fs.existsSync(path.join(path.dirname(exe), 'resources', 'LOCAL-QA-ONLY')))
            throw Error('Refusing to drive a Steam-enabled build; copy it and add resources/LOCAL-QA-ONLY')
    }
    const realProfiles = ['Esports Manager FPS', 'Esports Manager: FPS', 'esports-manager-sim', 'EsportsManager'].map(n => path.join(process.env.APPDATA || '', n))
    const before = Object.fromEntries(realProfiles.filter(p => fs.existsSync(p)).map(p => [p, fs.statSync(p).mtimeMs]))
    const result = mode === 'startup' ? await startup() : await session()
    const after = Object.fromEntries(realProfiles.filter(p => fs.existsSync(p)).map(p => [p, fs.statSync(p).mtimeMs]))
    const record = { version: 1, label, mode, recordedAt: new Date().toISOString(), ...(appUrl ? { target: `next start production build in Chrome at ${appUrl}`, exe: null } : { exe, exeMtime: fs.statSync(exe).mtime.toISOString() }),
        host: { cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, ramBytes: os.totalmem(), os: `${os.type()} ${os.release()}` },
        realProfileUntouched: JSON.stringify(before) === JSON.stringify(after), ...result }
    const file = path.join(root, 'docs/launch-readiness/evidence', `L27-packaged-${label}.json`)
    fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n')
    console.log('wrote', path.relative(root, file), JSON.stringify(record.summary))
}
main().catch(error => { console.error(error); process.exit(1) })
