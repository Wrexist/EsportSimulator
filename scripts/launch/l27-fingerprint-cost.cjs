/**
 * L27.A3: added cost per save of SaveManager's full-content primary fingerprint
 * (engine/save-manager.ts saveTextFingerprint). A save hashes its new text once
 * after write-verify and, at the next save, the stored primary once (lengths
 * match in the normal case), so the added cost is 2 hashes per save.
 * Real save texts are read from seeded/played profiles' game storage.
 *
 *   node scripts/launch/l27-fingerprint-cost.cjs --save=early-week1=tmp/heap/seed/profile --save=late-week53=tmp/heap/fixed1/profile
 *
 * Measured in Chrome (the renderer, where the game saves) and Node 22 (jest/tools).
 * Wall = time the save chain waits for the hash. Sync = the synchronous part
 * (copying UTF-16 code units; one slice per 1 Mi-unit chunk, the event loop runs
 * between slices). Digests are awaited; whether they block the main thread
 * depends on the runtime, so "sync" is a lower and "wall" an upper bound.
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { chromium } = require('playwright-core')

const root = path.resolve(__dirname, '../..')
const saves = process.argv.filter(a => a.startsWith('--save=')).map(a => a.slice(7).split('='))
const REPS = 9

// Same algorithm as saveTextFingerprint (SHA-256 branch) and fnv1a64Utf16 in engine/save-manager.ts.
const benchSource = `
async function fingerprint(text, slices) {
  const CHUNK = 1 << 20, n = text.length, chunkCount = Math.max(1, Math.ceil(n / CHUNK))
  const digests = new Uint8Array(32 * chunkCount)
  for (let c = 0; c < chunkCount; c++) {
    const t0 = performance.now()
    const start = c * CHUNK, end = Math.min(n, start + CHUNK)
    const units = new Uint16Array(end - start)
    for (let i = start; i < end; i++) units[i - start] = text.charCodeAt(i)
    const pending = crypto.subtle.digest('SHA-256', units)
    slices.push(performance.now() - t0)
    digests.set(new Uint8Array(await pending), 32 * c)
  }
  const rootDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', digests))
  let hex = ''; for (const b of rootDigest) hex += b.toString(16).padStart(2, '0')
  return n + ':sha256u16:' + hex
}
function fnv(text) {
  let hi = 0xcbf29ce4 | 0, lo = 0x84222325 | 0
  const n = text.length
  for (let i = 0; i < 2 * n; i++) {
    const c = text.charCodeAt(i >> 1)
    lo ^= (i & 1) === 0 ? c & 0xff : c >>> 8
    const loLo = (lo & 0xffff) * 0x1b3, loHi = (lo >>> 16) * 0x1b3 + (loLo >>> 16)
    hi = (Math.imul(hi, 0x1b3) + Math.floor(loHi / 0x10000) + (lo << 8)) | 0
    lo = ((loHi & 0xffff) << 16) | (loLo & 0xffff)
  }
  return (hi >>> 0).toString(16) + (lo >>> 0).toString(16)
}
async function measure(text, reps) {
  const rows = []
  for (let r = 0; r < reps; r++) {
    const slices = []
    const t = performance.now(); await fingerprint(text, slices)
    rows.push({ wall: performance.now() - t, sync: slices.reduce((a, b) => a + b, 0), maxSlice: Math.max(...slices) })
  }
  const fb = []
  for (let r = 0; r < 3; r++) { const t = performance.now(); fnv(text); fb.push(performance.now() - t) }
  const med = a => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(1) }
  const wall = med(rows.map(r => r.wall)), sync = med(rows.map(r => r.sync))
  return { chars: text.length, perHashWallMs: wall, perHashWallMaxMs: +Math.max(...rows.map(r => r.wall)).toFixed(1), perHashSyncCopyMs: sync, longestSyncSliceMs: med(rows.map(r => r.maxSlice)),
    addedPerSaveWallMs: +(2 * wall).toFixed(1), addedPerSaveSyncMs: +(2 * sync).toFixed(1), fnvFallbackPerHashMs: med(fb), fnvFallbackPerSaveMs: +(2 * med(fb)).toFixed(1) }
}`

function loadSave(profile) {
    const { createGameStorage } = require(path.join(root, 'electron/game-storage.js'))
    const disk = createGameStorage({ root: path.resolve(root, profile), isStorageKey: () => true, maxValueBytes: 64 * 1024 * 1024 })
    const key = disk.getAllKeys().find(k => /^esports_save_/.test(k) && !/backup|tmp|corrupt/.test(k))
    return disk.getItem(key)
}

async function main() {
    const nodeMeasure = new Function(`${benchSource}\nreturn measure`)()
    const results = { version: 2, recordedAt: new Date().toISOString(), algorithm: 'SHA-256 over UTF-16 code units in 1 Mi-unit chunks, then SHA-256 of the chunk digests; length compared first', host: { cpu: os.cpus()[0].model, os: `${os.type()} ${os.release()}`, node: process.version }, saves: {} }
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
    const page = await browser.newPage()
    // WebCrypto needs a secure context; serve a blank page as http://localhost (intercepted, no server).
    await page.route('http://localhost/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>fingerprint cost</title>' }))
    await page.goto('http://localhost/')
    await page.addScriptTag({ content: `${benchSource}\nwindow.__measure = measure` })
    for (const [label, profile] of saves) {
        const text = loadSave(profile)
        await page.evaluate(() => { window.__parts = [] })
        for (let i = 0; i < text.length; i += 4_000_000) await page.evaluate(part => window.__parts.push(part), text.slice(i, i + 4_000_000))
        const chrome = await page.evaluate(reps => window.__measure(window.__parts.join(''), reps), REPS)
        const node = await nodeMeasure(text, REPS)
        results.saves[label] = { profile, inMemoryMB: +(text.length * (/[^\u0000-\u00ff]/.test(text) ? 2 : 1) / 1048576).toFixed(1), chrome: { browser: browser.version(), ...chrome }, node }
        console.log(label, JSON.stringify(results.saves[label]))
    }
    await browser.close()
    const file = path.join(root, 'docs/launch-readiness/evidence/L27-fingerprint-cost.json')
    fs.writeFileSync(file, JSON.stringify(results, null, 2) + '\n')
    console.log('wrote', path.relative(root, file))
}
main().catch(error => { console.error(error); process.exit(1) })
