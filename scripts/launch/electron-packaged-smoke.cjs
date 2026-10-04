/**
 * L07.A3 / E10: security smoke against a PACKAGED Windows build.
 *
 *   node scripts/launch/electron-packaged-smoke.cjs --exe=C:/Users/IsacC/EsportSimulator/tmp/l27qa/app/EsportsManager.exe
 *
 * Only drives copies carrying resources/LOCAL-QA-ONLY (Steam disabled in
 * electron/steam.js), always with an isolated --user-data-dir under tmp/.
 * Never launches dist/win-unpacked directly (that build logs into the owner's
 * Steam account).
 *
 * Checks:
 *  1. Fuses as read by @electron/fuses.
 *  2. ELECTRON_RUN_AS_NODE=1 does not run the exe as Node (no -e code runs, no REPL).
 *  3. NODE_OPTIONS=--inspect / --inspect CLI args open no inspector port.
 *  4. Listening sockets of the whole process tree are loopback-only (netstat -ano by PID),
 *     measured on a launch without --remote-debugging-port.
 *  5. Loopback server Host / Origin / Sec-Fetch-Site gate.
 *  6. In-page (over CDP): no Node globals, CSP header and enforcement (eval, frame,
 *     remote connect, blob worker), popups denied, renderer navigation blocked,
 *     foreign _blank links dropped, permissions denied, IPC schema rejection from the
 *     trusted main frame, and IPC denied after the same WebContents changes origin.
 * Output: docs/launch-readiness/evidence/L07-packaged-smoke.json
 */
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
const { chromium } = require('playwright-core')

const root = path.resolve(__dirname, '../..')
const arg = (key, fallback) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback
const exe = path.resolve(arg('exe', 'C:/Users/IsacC/EsportSimulator/tmp/l27qa/app/EsportsManager.exe'))
const cdpPort = Number(arg('port', '9351'))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const runDir = path.join(root, 'tmp/l07-packaged', `run-${Date.now()}`)
const checks = []
const record = (name, passed, details) => { checks.push({ name, passed: !!passed, ...details }); console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`) }

function assertQaCopy() {
    if (!fs.existsSync(exe)) throw Error(`No packaged build at ${exe}`)
    if (!fs.existsSync(path.join(path.dirname(exe), 'resources', 'LOCAL-QA-ONLY'))) throw Error('Refusing: exe has no resources/LOCAL-QA-ONLY (Steam-enabled build)')
    if (/dist[\\/]win-unpacked/i.test(exe)) throw Error('Refusing to launch dist/win-unpacked directly')
}
function profile(name) { const p = path.join(runDir, name); fs.mkdirSync(p, { recursive: true }); return p }
function cleanEnv(extra = {}) { const env = { ...process.env, ...extra }; if (!('ELECTRON_RUN_AS_NODE' in extra)) delete env.ELECTRON_RUN_AS_NODE; if (!('NODE_OPTIONS' in extra)) delete env.NODE_OPTIONS; return env }
function killTree(pid) { try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ } }
function processTree(rootPid) {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.Name)" }'], { encoding: 'utf8' })
    const rows = out.trim().split(/\r?\n/).map(l => l.trim().split(/\s+/)).map(([pid, ppid, ...name]) => ({ pid: Number(pid), ppid: Number(ppid), name: name.join(' ') }))
    const tree = new Map([[rootPid, rows.find(r => r.pid === rootPid)?.name ?? '?']])
    for (let grew = true; grew;) { grew = false; for (const r of rows) if (!tree.has(r.pid) && tree.has(r.ppid)) { tree.set(r.pid, r.name); grew = true } }
    return tree
}
function listeners(pids) {
    const out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
    return out.split(/\r?\n/).map(l => l.trim().split(/\s+/)).filter(c => (c[0] === 'TCP' && c[3] === 'LISTENING' && pids.has(Number(c[4]))) || (c[0] === 'UDP' && pids.has(Number(c[3]))))
        .map(c => c[0] === 'TCP' ? { proto: 'TCP', local: c[1], pid: Number(c[4]) } : { proto: 'UDP', local: c[1], pid: Number(c[3]) })
}
const isLoopback = local => /^(127\.0\.0\.1|\[::1\]):\d+$/.test(local)
async function waitFor(fn, ms, step = 250) { const end = Date.now() + ms; while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(step) } return null }
const appPorts = pids => listeners(pids).filter(l => l.proto === 'TCP').map(l => Number(l.local.split(':').pop())).filter(p => p >= 3000 && p <= 3010)

function readFuses() {
    try {
        const text = execFileSync(process.execPath, [path.join(root, 'node_modules/@electron/fuses/dist/bin.js'), 'read', '--app', exe], { encoding: 'utf8' }).replace(/\x1b\[[0-9;]*m/g, '')
        const fuses = {}
        for (const m of text.matchAll(/^\s*(\w+)\s+is\s+(Enabled|Disabled)/gm)) fuses[m[1]] = m[2]
        const expect = { RunAsNode: 'Disabled', EnableNodeOptionsEnvironmentVariable: 'Disabled', EnableNodeCliInspectArguments: 'Disabled', GrantFileProtocolExtraPrivileges: 'Disabled', OnlyLoadAppFromAsar: 'Enabled' }
        const mismatched = Object.entries(expect).filter(([k, v]) => fuses[k] !== v).map(([k]) => k)
        record('Fuses flipped as configured in package.json build.electronFuses', mismatched.length === 0, { fuses, expected: expect, mismatched, raw: text.replace(/\x1b\[[0-9;]*m/g, '').trim().split(/\r?\n/) })
    } catch (error) { record('Fuses flipped as configured in package.json build.electronFuses', false, { error: String(error) }) }
}

async function runAsNodeCheck() {
    const marker = path.join(runDir, 'ran-as-node.txt')
    const code = `require('fs').writeFileSync(${JSON.stringify(marker)}, process.version); console.log('RAN_AS_NODE ' + process.version); process.exit(0)`
    const child = spawn(exe, ['-e', code, `--user-data-dir=${profile('run-as-node')}`], { env: cleanEnv({ ELECTRON_RUN_AS_NODE: '1' }), stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', exited = null
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('exit', c => { exited = c })
    // A Node REPL would also answer this on stdin.
    child.stdin.write('console.log("REPL_ALIVE")\n')
    await sleep(12000)
    const tree = processTree(child.pid)
    const stillRunningAsApp = exited === null && tree.size > 1
    killTree(child.pid)
    const ran = fs.existsSync(marker) || /RAN_AS_NODE|REPL_ALIVE/.test(stdout)
    record('ELECTRON_RUN_AS_NODE=1 does not run code or open a Node REPL', !ran, { markerWritten: fs.existsSync(marker), stdout: stdout.slice(0, 400), stderr: stderr.slice(0, 400), exitedWithin12s: exited, launchedAsAppInstead: stillRunningAsApp, processes: [...new Set(tree.values())] })
}

async function networkCheck() {
    // Production-shaped launch: no --remote-debugging-port. Inspector requests via
    // NODE_OPTIONS and CLI must be ignored by the fuses.
    const child = spawn(exe, [`--user-data-dir=${profile('network')}`, '--inspect=127.0.0.1:9339', '--inspect-brk=127.0.0.1:9340'], { env: cleanEnv({ NODE_OPTIONS: '--inspect=127.0.0.1:9338' }), stdio: 'ignore' })
    try {
        const ports = await waitFor(() => { const p = appPorts(new Set(processTree(child.pid).keys())); return p.length ? p : null }, 60000, 500)
        await sleep(3000)
        const tree = processTree(child.pid)
        const rows = listeners(new Set(tree.keys()))
        const nonLoopback = rows.filter(r => !isLoopback(r.local))
        const inspector = rows.filter(r => /:(9229|9338|9339|9340)$/.test(r.local))
        record('Every listening socket of the packaged process tree is loopback-only (netstat -ano by PID)', !!ports && nonLoopback.length === 0, { processes: Object.fromEntries(tree), listeners: rows, nonLoopback })
        record('NODE_OPTIONS=--inspect and --inspect/--inspect-brk args open no inspector', inspector.length === 0 && !!ports, { inspectorListeners: inspector })
        const port = ports?.[0]
        const get = headers => new Promise(resolve => {
            const req = http.get({ host: '127.0.0.1', port, path: '/main-menu', headers }, res => { res.resume(); resolve({ status: res.statusCode, csp: res.headers['content-security-policy'] || null }) })
            req.on('error', e => resolve({ error: String(e) }))
        })
        const good = await get({ Host: `127.0.0.1:${port}` })
        const badHost = await get({ Host: `evil.example:${port}` })
        const badOrigin = await get({ Host: `127.0.0.1:${port}`, Origin: 'https://evil.example' })
        const crossSite = await get({ Host: `127.0.0.1:${port}`, 'Sec-Fetch-Site': 'cross-site' })
        record('Loopback server serves the app but rejects foreign Host, foreign Origin and cross-site fetches', good.status === 200 && badHost.status === 403 && badOrigin.status === 403 && crossSite.status === 403, { port, good, badHost, badOrigin, crossSite })
        // Reachable from a non-loopback local address? Use every IPv4 interface.
        const ifaces = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address)
        const external = []
        for (const address of ifaces) external.push(await new Promise(resolve => { const s = require('node:net').connect({ host: address, port, timeout: 1500 }); s.on('connect', () => { s.destroy(); resolve({ address, connected: true }) }); s.on('error', e => resolve({ address, connected: false, code: e.code })); s.on('timeout', () => { s.destroy(); resolve({ address, connected: false, code: 'TIMEOUT' }) }) }))
        record('App port refuses connections on non-loopback interfaces', external.every(e => !e.connected), { attempts: external })
    } finally { killTree(child.pid) }
}

async function pageChecks() {
    const child = spawn(exe, [`--user-data-dir=${profile('page')}`, `--remote-debugging-port=${cdpPort}`], { env: cleanEnv(), stdio: 'ignore' })
    let browser
    try {
        const version = await waitFor(async () => { try { const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`); return r.ok ? r.json() : null } catch { return null } }, 60000)
        if (!version) throw Error('CDP endpoint never came up')
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
        const page = await waitFor(() => browser.contexts().flatMap(c => c.pages()).find(p => /^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(p.url())), 60000)
        if (!page) throw Error('App page never appeared')
        await page.waitForFunction(() => location.pathname.startsWith('/main-menu'), null, { timeout: 90000 })
        const appUrl = new URL(page.url())
        const consoleLines = []
        page.on('console', m => { if (consoleLines.length < 100) consoleLines.push(`${m.type()}: ${m.text().slice(0, 240)}`) })

        const inPage = await page.evaluate(async () => {
            const r = { nodeRequire: typeof window.require, nodeProcess: typeof window.process, moduleGlobal: typeof window.module, bridgeKeys: Object.keys(window.electron || {}).sort(), rawIpc: typeof window.ipcRenderer }
            const violations = []
            document.addEventListener('securitypolicyviolation', e => { r.enforcedPolicy = e.originalPolicy; violations.push({ directive: e.effectiveDirective, blocked: String(e.blockedURI).slice(0, 80), disposition: e.disposition }) })
            // CDP evaluation temporarily allows string code generation while it runs
            // (allowUnsafeEvalBlockedByCSP), and an appended inline script runs synchronously
            // inside it. So probe eval from a page script started by a later task.
            await new Promise(res => setTimeout(() => {
                const probe = document.createElement('script')
                probe.textContent = "try{window.__l07eval=String(eval('1+1'))}catch(e){window.__l07eval='blocked:'+e.name}try{window.__l07fn=String(new Function('return 2')())}catch(e){window.__l07fn='blocked:'+e.name}"
                document.head.append(probe); probe.remove(); res()
            }, 0))
            r.evalProbe = window.__l07eval; r.functionProbe = window.__l07fn
            const frame = document.createElement('iframe'); frame.src = 'https://example.com/'; document.body.append(frame)
            const sameFrame = document.createElement('iframe'); sameFrame.src = '/main-menu'; document.body.append(sameFrame)
            try { await fetch('https://example.com/', { mode: 'no-cors' }); r.remoteFetch = 'allowed' } catch (e) { r.remoteFetch = 'blocked' }
            try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); r.blobWorker = await new Promise(res => { w.onmessage = () => res('ran'); w.onerror = () => res('blocked'); setTimeout(() => res('no-message'), 1500) }) } catch (e) { r.blobWorker = 'blocked:' + e.name }
            r.popupBlank = window.open('about:blank') === null
            r.popupForeign = window.open('https://evil.invalid/popup') === null
            const a = document.createElement('a'); a.href = 'https://evil.invalid/blank'; a.target = '_blank'; document.body.append(a); a.click(); a.remove()
            r.notification = await Notification.requestPermission()
            try { await navigator.mediaDevices.getUserMedia({ audio: true }); r.media = 'granted' } catch (e) { r.media = 'denied:' + e.name }
            try { r.geo = await new Promise(res => navigator.geolocation.getCurrentPosition(() => res('granted'), e => res('denied:' + e.code), { timeout: 3000 })) } catch (e) { r.geo = 'error' }
            const s = window.electron?.storage, m = window.electron?.mods
            r.storageWrite = await s?.setItem('esports_l07_probe', 'packaged-smoke')
            r.storageRead = await s?.getItem('esports_l07_probe')
            r.storageBadKey = await s?.setItem('window.fullscreen', 'true')
            r.storageBadType = await s?.setItem('esports_probe', { not: 'a string' })
            r.modTraversal = await m?.write('../escape.json', '[]')
            r.modBadName = await m?.read('..\\..\\Local State')
            r.windowBadSize = await window.electron?.window?.setSize?.(Infinity, 720)
            await new Promise(res => setTimeout(res, 1500))
            r.frameLoaded = (() => { try { return frame.contentWindow?.location?.href ?? null } catch { return 'cross-origin' } })()
            frame.remove(); sameFrame.remove()
            r.violations = violations
            return r
        })
        await sleep(500)
        const pagesNow = browser.contexts().flatMap(c => c.pages()).map(p => p.url())
        // The policy is injected by session.webRequest.onHeadersReceived, after CDP's network
        // layer reports headers, so read the policy the document actually enforces instead.
        const csp = inPage.enforcedPolicy || ''
        const directives = Object.fromEntries(csp.split(';').map(s => s.trim()).filter(Boolean).map(s => { const [k, ...v] = s.split(/\s+/); return [k, v.join(' ')] }))
        record('Enforced document CSP: no unsafe-eval; frames/objects/base/forms/ancestors none; connect self', !!csp && !/unsafe-eval/.test(csp) && ['frame-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'].every(k => directives[k] === "'none'") && directives['connect-src'] === "'self'", { csp, directives })
        const evalOk = /^blocked:EvalError/.test(inPage.evalProbe || '') && /^blocked:EvalError/.test(inPage.functionProbe || '')
        record('No Node globals or raw ipcRenderer in the renderer; only the fixed preload bridge', inPage.nodeRequire === 'undefined' && inPage.nodeProcess === 'undefined' && inPage.rawIpc === 'undefined', { nodeRequire: inPage.nodeRequire, nodeProcess: inPage.nodeProcess, bridgeKeys: inPage.bridgeKeys })
        record('CSP enforced in packaged renderer: eval/Function, external iframe, remote fetch and blob worker blocked', evalOk && inPage.remoteFetch === 'blocked' && inPage.violations.some(v => v.directive === 'frame-src') && inPage.blobWorker !== 'ran', { evalProbe: inPage.evalProbe, functionProbe: inPage.functionProbe, remoteFetch: inPage.remoteFetch, blobWorker: inPage.blobWorker, violations: inPage.violations })
        record('Popups denied and foreign target=_blank link dropped (no new window, page unchanged)', inPage.popupBlank && inPage.popupForeign && pagesNow.length === 1 && pagesNow[0].startsWith(appUrl.origin), { popupBlank: inPage.popupBlank, popupForeign: inPage.popupForeign, pages: pagesNow })
        record('Notification / media / geolocation permissions denied', inPage.notification === 'denied' && /^denied/.test(inPage.media) && inPage.geo !== 'granted', { notification: inPage.notification, media: inPage.media, geolocation: inPage.geo })
        record('Trusted main frame IPC works and rejects bad keys, types, traversal and sizes', inPage.storageWrite === true && inPage.storageRead === 'packaged-smoke' && inPage.storageBadKey === false && inPage.storageBadType === false && inPage.modTraversal === false && inPage.modBadName == null && (inPage.windowBadSize === false || inPage.windowBadSize === undefined), { storageWrite: inPage.storageWrite, storageRead: inPage.storageRead, storageBadKey: inPage.storageBadKey, storageBadType: inPage.storageBadType, modTraversal: inPage.modTraversal, modBadName: inPage.modBadName, windowBadSize: inPage.windowBadSize })

        // Renderer-initiated navigation away from the app origin must be cancelled.
        const before = page.url()
        await page.evaluate(() => { location.href = 'https://untrusted.invalid/' })
        await sleep(2500)
        record('Renderer-initiated top-level navigation to a foreign origin is blocked', page.url() === before, { before, after: page.url() })
        await page.evaluate(() => { location.href = 'data:text/html,<p>x</p>' }).catch(() => {})
        await sleep(1500)
        record('Renderer-initiated navigation to data: is blocked', page.url() === before, { after: page.url() })

        // Same WebContents after its origin changes (driver-initiated, bypasses the renderer guard):
        // the preload bridge still exists there, but every IPC call must be refused by the sender gate.
        await page.goto('data:text/html,<title>untrusted</title><p>untrusted</p>').catch(() => {})
        await sleep(1000)
        const foreign = await page.evaluate(async () => {
            const e = window.electron
            if (!e) return { bridge: false }
            const settle = p => Promise.resolve(p).then(v => ({ v }), err => ({ err: String(err).slice(0, 120) }))
            return { bridge: true, read: await settle(e.storage.getItem('esports_l07_probe')), write: await settle(e.storage.setItem('esports_probe', 'x')), keys: await settle(e.storage.getAllKeys()), modPath: await settle(e.mods.getPath()), clear: await settle(e.storage.clear()) }
        }).catch(error => ({ error: String(error) }))
        const denied = x => !x || x.err || x.v === null || x.v === false || (Array.isArray(x.v) && x.v.length === 0) || x.v === undefined
        record('IPC denied after the same WebContents changes origin (data: document)', foreign.error || !foreign.bridge || (denied(foreign.read) && denied(foreign.write) && denied(foreign.keys) && denied(foreign.modPath) && denied(foreign.clear)), { url: page.url(), results: foreign })
        await page.goto(before).catch(() => {})
        await sleep(1500)
        const stillThere = await page.evaluate(async () => { const v = await window.electron?.storage?.getItem('esports_l07_probe'); await window.electron?.storage?.removeItem('esports_l07_probe'); return v }).catch(() => null)
        record('Sentinel save key intact after the foreign-origin read/write/clear attempts', stillThere === 'packaged-smoke', { sentinelAfter: stillThere })
        return { electron: version.Browser, appOrigin: appUrl.origin, console: consoleLines.filter(l => /^error|^warning/.test(l)).slice(0, 40) }
    } finally {
        await browser?.close().catch(() => {})
        killTree(child.pid)
    }
}

async function main() {
    assertQaCopy()
    fs.mkdirSync(runDir, { recursive: true })
    const realProfiles = ['Esports Manager FPS', 'Esports Manager: FPS', 'esports-manager-sim', 'EsportsManager'].map(n => path.join(process.env.APPDATA || '', n))
    const stamp = () => Object.fromEntries(realProfiles.filter(p => fs.existsSync(p)).map(p => [p, fs.statSync(p).mtimeMs]))
    const before = stamp()
    readFuses()
    await runAsNodeCheck(); assertQaCopy()
    await networkCheck(); assertQaCopy()
    let page = {}
    try { page = await pageChecks() } catch (error) { record('In-page checks ran', false, { error: String(error && error.stack || error) }) }
    const out = {
        version: 1, recordedAt: new Date().toISOString(), exe, exeMtime: fs.statSync(exe).mtime.toISOString(), qaMarker: 'resources/LOCAL-QA-ONLY present (Steam disabled)',
        buildNote: arg('build-note', ''), host: { cpu: os.cpus()[0].model, os: `${os.type()} ${os.release()}` }, profiles: runDir,
        realProfileUntouched: JSON.stringify(before) === JSON.stringify(stamp()), passed: checks.every(c => c.passed), checks, ...page,
        limitations: [
            'QA copy with Steam disabled: Steam handlers are registered but no live SDK/account calls are exercised.',
            'Child-frame and second-WebContents IPC denial cannot be constructed in the packaged app (frame-src none; one window). Those stay covered by electron-security-smoke.cjs (real Electron) and the handler harness.',
            'Allowlisted external links were not clicked, to avoid opening the OS browser; allowlist behaviour is covered by the unpackaged smoke.',
        ],
    }
    const file = path.join(root, 'docs/launch-readiness/evidence/L07-packaged-smoke.json')
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
    console.log('wrote', path.relative(root, file), 'passed:', out.passed)
    process.exit(out.passed ? 0 : 1)
}
main().catch(error => { console.error(error); process.exit(1) })
