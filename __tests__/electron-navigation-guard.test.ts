import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const { secureWebContents, secureSession, isTrustedDownloadUrl } = require('../electron/renderer-security')
const { isAllowedExternalUrl, createExternalOpener, EXTERNAL_HOSTS } = require('../electron/external-links')
const { isAllowedAppNavigation } = require('../electron/app-origin')
const { contentPolicy, APP_CSP } = require('../electron/content-policy')
const { loadHandlers } = require('../scripts/launch/electron-handler-harness.cjs')
const { contracts } = require('../electron/ipc-policy')

const root = path.join(__dirname, '..')
const PORT = 3210
const trusted = (url: string) => isAllowedAppNavigation(url, PORT)

type OpenHandler = (details: { url: string }) => { action: string }
class FakeContents extends EventEmitter {
  openHandler: OpenHandler | null = null
  setWindowOpenHandler(handler: OpenHandler) { this.openHandler = handler }
}
const cancellable = (extra: Record<string, unknown> = {}) => {
  const event = { defaultPrevented: false, preventDefault() { event.defaultPrevented = true }, ...extra }
  return event
}
function guarded() {
  const contents = new FakeContents()
  const opened: string[] = []
  secureWebContents(contents, trusted, { openExternal: (url: string) => { opened.push(url); return true } })
  return { contents, opened }
}

describe('external link allowlist', () => {
  test.each([
    'https://store.steampowered.com/app/480/',
    'https://steamcommunity.com/sharedfiles/filedetails/?id=123',
    'https://help.steampowered.com/en/',
    'https://cs2nades.gg/en/',
    'https://www.cs2nades.gg/en/dust2',
  ])('allows %s', url => expect(isAllowedExternalUrl(url)).toBe(true))
  test.each([
    'http://store.steampowered.com/', // plain http
    'https://store.steampowered.com:8443/', // explicit port
    'https://user:pass@steamcommunity.com/', // credentials
    'https://steamcommunity.com.evil.example/', // suffix spoof
    'https://evilsteamcommunity.com/',
    'https://a.b.steamcommunity.com/', // only bare or www hosts
    'file:///C:/Windows/win.ini',
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'steam://run/480',
    'ms-settings:privacy',
    'http://localhost:3210/main-menu',
    'https://steamcommunity.com/' + 'x'.repeat(3000),
    '',
    'not a url',
  ])('rejects %s', url => expect(isAllowedExternalUrl(url)).toBe(false))
  test('rejects non-string values', () => {
    for (const value of [undefined, null, 1, {}, [], { toString: () => 'https://steamcommunity.com/' }]) expect(isAllowedExternalUrl(value)).toBe(false)
  })
  test('every allowlisted host is a bare HTTPS hostname', () => {
    for (const host of EXTERNAL_HOSTS) expect(host).toMatch(/^[a-z0-9.-]+\.[a-z]+$/)
  })
  test('opener forwards only allowlisted URLs and throttles bursts', async () => {
    let clock = 0
    const calls: string[] = []
    const open = createExternalOpener((url: string) => { calls.push(url) }, { minIntervalMs: 1000, now: () => clock })
    expect(open('https://evil.example/')).toBe(false)
    expect(open('https://store.steampowered.com/app/1')).toBe(true)
    expect(open('https://store.steampowered.com/app/2')).toBe(false)
    clock = 1500
    expect(open('https://steamcommunity.com/app/2')).toBe(true)
    await Promise.resolve(); await Promise.resolve()
    expect(calls).toEqual(['https://store.steampowered.com/app/1', 'https://steamcommunity.com/app/2'])
  })
  test('a rejecting OS handler does not throw into the caller', async () => {
    const logged: string[] = []
    const open = createExternalOpener(() => Promise.reject(new Error('no handler')), { minIntervalMs: 0, log: (l: string) => logged.push(l) })
    expect(open('https://store.steampowered.com/')).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(logged.join('\n')).toContain('no handler')
  })
})

describe('navigation guard', () => {
  test('every popup is denied; only allowlisted URLs are handed to the OS browser', () => {
    const { contents, opened } = guarded()
    for (const url of ['https://store.steampowered.com/app/1', 'https://evil.example/', 'http://localhost:3210/main-menu', 'about:blank', 'file:///C:/x']) {
      expect(contents.openHandler!({ url })).toEqual({ action: 'deny' })
    }
    // The guard forwards any non-app URL; the opener itself enforces the allowlist.
    expect(opened).toEqual(['https://store.steampowered.com/app/1', 'https://evil.example/', 'about:blank', 'file:///C:/x'])
  })
  test('main-frame navigation stays on the selected app origin', () => {
    const { contents, opened } = guarded()
    const ok = cancellable({ isMainFrame: true, url: 'http://localhost:3210/match/1' })
    contents.emit('will-frame-navigate', ok)
    expect(ok.defaultPrevented).toBe(false)
    for (const url of ['https://store.steampowered.com/', 'http://localhost:3211/', 'http://127.0.0.1:3210/', 'http://localhost:3210/mod-assets/x.svg', 'file:///C:/', 'chrome://gpu']) {
      const event = cancellable({ isMainFrame: true, url })
      contents.emit('will-frame-navigate', event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(opened[0]).toBe('https://store.steampowered.com/')
  })
  test('child frames can never navigate, even to the app origin', () => {
    const { contents, opened } = guarded()
    for (const url of ['http://localhost:3210/main-menu', 'https://store.steampowered.com/']) {
      const event = cancellable({ isMainFrame: false, url })
      contents.emit('will-frame-navigate', event)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(opened).toEqual([])
  })
  test('will-navigate, will-redirect and webview attach are guarded', () => {
    const { contents } = guarded()
    const nav = cancellable(); contents.emit('will-navigate', nav, 'https://evil.example/')
    const okNav = cancellable(); contents.emit('will-navigate', okNav, 'http://localhost:3210/')
    const redirect = cancellable(); contents.emit('will-redirect', redirect, 'http://localhost:3211/')
    const webview = cancellable(); contents.emit('will-attach-webview', webview, {}, {})
    expect([nav.defaultPrevented, okNav.defaultPrevented, redirect.defaultPrevented, webview.defaultPrevented]).toEqual([true, false, true, true])
  })
  test('without an opener the guard still denies everything external', () => {
    const contents = new FakeContents()
    secureWebContents(contents, trusted)
    expect(contents.openHandler!({ url: 'https://store.steampowered.com/' })).toEqual({ action: 'deny' })
    const event = cancellable({ isMainFrame: true, url: 'https://store.steampowered.com/' })
    contents.emit('will-frame-navigate', event)
    expect(event.defaultPrevented).toBe(true)
  })
})

describe('session guard', () => {
  function fakeSession() {
    const session = new EventEmitter() as EventEmitter & Record<string, unknown>
    const handlers: Record<string, (...args: unknown[]) => unknown> = {}
    for (const name of ['setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDevicePermissionHandler']) session[name] = (fn: (...args: unknown[]) => unknown) => { handlers[name] = fn }
    secureSession(session, trusted)
    return { session, handlers }
  }
  test('permission requests, checks and device access are denied', () => {
    const { handlers } = fakeSession()
    for (const permission of ['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture', 'hid']) {
      let granted: boolean | undefined
      handlers.setPermissionRequestHandler({}, permission, (value: boolean) => { granted = value })
      expect(granted).toBe(false)
      expect(handlers.setPermissionCheckHandler({}, permission)).toBe(false)
    }
    expect(handlers.setDevicePermissionHandler({})).toBe(false)
  })
  test('only app-created downloads proceed', () => {
    const { session } = fakeSession()
    const download = (url: string) => { const event = cancellable(); session.emit('will-download', event, { getURL: () => url }); return event.defaultPrevented }
    expect(download('blob:http://localhost:3210/7d1c-uuid')).toBe(false)
    expect(download('http://localhost:3210/export.json')).toBe(false)
    for (const url of ['data:application/octet-stream,x', 'blob:https://evil.example/uuid', 'blob:http://localhost:3211/uuid', 'https://evil.example/payload.exe', 'file:///C:/Windows/win.ini', 'http://localhost:3210/mod-assets/x.svg']) expect(download(url)).toBe(true)
    const broken = cancellable(); session.emit('will-download', broken, { getURL: () => { throw new Error('destroyed') } })
    expect(broken.defaultPrevented).toBe(true)
    expect(isTrustedDownloadUrl('::::', trusted)).toBe(false)
  })
})

describe('actual main.js wiring', () => {
  let directory: string
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'esim-nav-test-')) })
  afterEach(() => {
    expect(path.basename(directory)).toMatch(/^esim-nav-test-/)
    fs.rmSync(directory, { recursive: true, force: true })
  })
  test('web-contents-created applies the guard and routes allowlisted links to shell.openExternal', async () => {
    const opened: string[] = []
    const harness = loadHandlers({ directory, shell: { openExternal: async (url: string) => { opened.push(url) } } })
    const contents = new FakeContents()
    harness.app.emit('web-contents-created', {}, contents)
    expect(contents.openHandler!({ url: 'https://evil.example/' })).toEqual({ action: 'deny' })
    expect(contents.openHandler!({ url: 'https://store.steampowered.com/app/1' })).toEqual({ action: 'deny' })
    const event = cancellable({ isMainFrame: true, url: 'file:///C:/Windows/win.ini' })
    contents.emit('will-frame-navigate', event)
    expect(event.defaultPrevented).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(opened).toEqual(['https://store.steampowered.com/app/1'])
  })
  test('hostile argument fuzz never throws, always fails closed and writes nothing', async () => {
    const harness = loadHandlers({ directory })
    harness.values.esports_save_sentinel = 'owner'
    const before = JSON.stringify(harness.values)
    const hostile: unknown[] = [null, 0, -1, NaN, Infinity, true, {}, [], '', '../../config.json', '..\\..\\config.json',
      'C:\\Windows\\win.ini', '\\\\?\\C:\\Windows', '/etc/passwd', 'players.json:stream', 'players.json\0.png', 'file:///C:/x',
      'window', '__proto__', 'constructor', { __proto__: { polluted: true } }, { toString() { throw new Error('boom') } }, 'x'.repeat(70000)]
    for (const [channel, handler] of harness.handlers as Map<string, (...a: unknown[]) => Promise<unknown>>) {
      for (const value of hostile) {
        for (const args of [[value], [value, value], ['players.json', value], ['esports_save_sentinel', value]]) {
          const fallback = contracts[channel].fallback
          if (contracts[channel].check(args)) continue // a legitimately valid call, covered elsewhere
          await expect(handler(harness.event, ...args)).resolves.toEqual(Array.isArray(fallback) ? [] : fallback)
        }
      }
    }
    expect(JSON.stringify(harness.values)).toBe(before)
    expect(fs.readdirSync(directory)).toEqual([])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
  test('disposed, destroyed or throwing sender frames fail closed', async () => {
    const harness = loadHandlers({ directory })
    const contents = harness.event.sender
    const events = [
      { sender: contents, get senderFrame() { throw new Error('Render frame was disposed') } },
      { sender: { ...contents, isDestroyed: () => true }, senderFrame: contents.mainFrame },
      { sender: contents, senderFrame: undefined },
      {},
      null,
    ]
    for (const event of events) {
      expect(await harness.handlers.get('storage-set-item')(event, 'esports_save_x', 'v')).toBe(false)
      expect(await harness.handlers.get('storage-clear')(event)).toBe(false)
      expect(await harness.handlers.get('app-get-user-data-path')(event)).toBeNull()
      expect(await harness.handlers.get('gpu-set-mode')(event, 'compatibility')).toBe(false)
    }
    expect(fs.readdirSync(directory)).toEqual([])
  })
})

describe('static Electron configuration', () => {
  const main = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8')
  const preload = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  test('main window webPreferences keep the renderer isolated', () => {
    const prefs = /webPreferences:\s*\{([^}]*)\}/.exec(main)![1]
    for (const required of ['nodeIntegration: false', 'contextIsolation: true', 'sandbox: true', 'webSecurity: true', 'allowRunningInsecureContent: false']) expect(prefs).toContain(required)
    expect(prefs).not.toMatch(/nodeIntegrationInSubFrames|webviewTag:\s*true|enableBlinkFeatures/)
    expect(main).toContain('app.enableSandbox()')
  })
  test('navigation/popup policy has a single source (renderer-security.js)', () => {
    expect(main).not.toMatch(/\.setWindowOpenHandler\(|on\('will-navigate'/)
    expect(main).toMatch(/app\.on\('web-contents-created'[\s\S]{0,200}secureWebContents\(contents, isTrustedAppUrl, \{ openExternal/)
    expect(main).not.toMatch(/shell\.openExternal\((?!url\))/)
  })
  test('preload exposes fixed channels only, never raw ipcRenderer', () => {
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer\s*[,)]/)
    expect(preload).not.toMatch(/ipcRenderer\.(invoke|send|sendSync|on)\(\s*[a-zA-Z_]/)
    expect(preload).not.toMatch(/ipcRenderer\.(send|sendSync|postMessage)\(/)
    expect(preload).not.toMatch(/require\('(fs|child_process|path|os)'\)/)
  })
  test('packaged CSP forbids eval, frames, objects and foreign connections', () => {
    const packaged = contentPolicy('http://localhost:3210/main-menu', false)
    expect(packaged).toBe(APP_CSP)
    expect(packaged).not.toContain('unsafe-eval')
    for (const directive of ["default-src 'self'", "connect-src 'self'", "frame-src 'none'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"]) expect(packaged).toContain(directive)
    expect(contentPolicy('http://localhost:3210/mod-assets/x.svg', false)).toContain('sandbox')
  })
  test('packaged build flips the Electron fuses that turn the exe into a generic Node runtime', () => {
    expect(pkg.build.electronFuses).toMatchObject({ runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, grantFileProtocolExtraPrivileges: false, onlyLoadAppFromAsar: true })
  })
  test('local servers bind loopback only', () => {
    expect(fs.readFileSync(path.join(root, 'electron/local-server.js'), 'utf8')).toContain("server.listen(port, '127.0.0.1')")
    for (const script of ['electron:dev', 'dev:all']) expect(pkg.scripts[script]).toContain('-H 127.0.0.1')
  })
})
