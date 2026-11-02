import fs from 'node:fs'
import path from 'node:path'

// A cold first launch after install (antivirus scanning the fresh app.asar)
// can take longer than the base boot timeout to render the first page. Once
// the renderer has started navigating to the app, the watchdog must wait
// longer instead of showing "Renderer boot timeout".
describe('renderer boot watchdog', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.js'), 'utf8')

  it('extends the boot grace once the first app navigation starts', () => {
    const grace = Number(/NAVIGATION_GRACE_MS = (\d+)/.exec(src)?.[1])
    const base = Number(/BOOT_TIMEOUT_MS = app\.isPackaged \? (\d+)/.exec(src)?.[1])
    expect(grace).toBeGreaterThanOrEqual(60000)
    expect(grace).toBeGreaterThan(base)
    const handler = src.slice(src.indexOf("on('did-start-navigation'"), src.indexOf("on('dom-ready'"))
    expect(handler).toContain('isSuccessfulRendererUrl(url)')
    expect(handler).toContain('armBootWatchdog(NAVIGATION_GRACE_MS)')
  })
})
