/**
 * Renders trailer graphics as transparent PNGs with real CSS in headless Chrome,
 * in the game's own UI language: navy glass panels (see .glass-panel in
 * app/globals.css), thin light borders, Archivo Black display type, and the
 * sidebar's small tracked section labels.
 *
 *   caption({title, kicker})  -> lower-third glass chip
 *   statement({title, sub, kicker}) -> centred claim card (a newline in title breaks lines)
 *   endPanel()                -> end card panel: logo, tagline, wishlist button
 */
const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const REPO = path.join(__dirname, "..", "..")
const OUT = path.join(REPO, "tmp", "trailer", "overlays")
const fileUrl = p => "file:///" + p.replace(/\\/g, "/")
const ARCHIVO = fileUrl(path.join(REPO, "app", "fonts", "archivo-black-latin-400-normal.woff2"))
const LOGO = fileUrl(path.join(REPO, "marketing", "steam-graphics-2026-09-25", "UPLOAD-READY", "02-LIBRARY", "logo_1280x300.png"))

const BASE_CSS = `
@font-face { font-family: Archivo; src: url("${ARCHIVO}") format("woff2"); }
html, body { margin: 0; background: transparent; }
body { font-family: "Segoe UI", system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
.glass {
  background: linear-gradient(135deg, rgba(255,255,255,0.085), rgba(255,255,255,0.035) 46%, rgba(255,255,255,0.02)), rgba(18, 28, 46, 0.86);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
}
.kicker { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: #34d399; box-shadow: 0 0 12px #34d399; }
`

let browser
async function page(w, h) {
    browser ??= await chromium.launch({ headless: true, channel: "chrome" })
    return browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
}

async function shoot(html, w, h, file) {
    const p = await page(w, h)
    const tmp = file.replace(/\.png$/, ".html")
    fs.writeFileSync(tmp, `<!doctype html><html><head><style>${BASE_CSS}</style></head><body>${html}</body></html>`)
    await p.goto(fileUrl(tmp))
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(150)
    const el = await p.$("#root")
    await el.screenshot({ path: file, omitBackground: true })
    await p.close()
    return file
}

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")

/** Lower-third chip: section label over a display-type title. */
async function caption({ title, kicker }) {
    fs.mkdirSync(OUT, { recursive: true })
    const key = crypto.createHash("md5").update(`cap2|${kicker}|${title}`).digest("hex").slice(0, 10)
    const file = path.join(OUT, `cap_${key}.png`)
    if (fs.existsSync(file)) return file
    const html = `<div id="root" style="display:inline-block;padding:18px">
      <div class="glass" style="border-radius:22px;padding:24px 38px 28px">
        ${kicker ? `<div class="kicker"><span class="dot"></span>${esc(kicker)}</div>` : ""}
        <div style="font-family:Archivo;font-size:64px;line-height:1.02;letter-spacing:0.01em;margin-top:${kicker ? 12 : 0}px;text-transform:uppercase">${esc(title)}</div>
      </div></div>`
    return shoot(html, 1800, 500, file)
}

/** Centred statement card for the hook and key claims: big display line, optional sub line. */
async function statement({ title, sub, kicker }) {
    fs.mkdirSync(OUT, { recursive: true })
    const key = crypto.createHash("md5").update(`st|${kicker}|${title}|${sub}`).digest("hex").slice(0, 10)
    const file = path.join(OUT, `st_${key}.png`)
    if (fs.existsSync(file)) return file
    const lines = esc(title).split("\n").join("<br>")
    const html = `<div id="root" style="display:inline-block;padding:40px">
      <div class="glass" style="border-radius:28px;padding:40px 64px 44px;text-align:center;max-width:1500px">
        ${kicker ? `<div class="kicker" style="justify-content:center"><span class="dot"></span>${esc(kicker)}</div>` : ""}
        <div style="font-family:Archivo;font-size:104px;line-height:1.0;margin-top:${kicker ? 16 : 0}px;text-transform:uppercase">${lines}</div>
        ${sub ? `<div style="font-size:34px;color:rgba(255,255,255,0.7);margin-top:18px">${esc(sub)}</div>` : ""}
      </div></div>`
    return shoot(html, 1800, 900, file)
}

/** End card panel: brand lockup, the game's own tagline, and a primary-style wishlist button. */
async function endPanel() {
    fs.mkdirSync(OUT, { recursive: true })
    const file = path.join(OUT, "end_panel.png")
    const html = `<div id="root" style="display:inline-block;padding:40px">
      <div class="glass" style="border-radius:28px;padding:44px 64px 48px;width:900px;text-align:center">
        <img src="${LOGO}" style="width:760px;display:block;margin:0 auto">
        <div style="font-size:24px;color:rgba(255,255,255,0.62);margin-top:6px">Build your legacy in competitive esports</div>
        <div style="height:1px;background:rgba(255,255,255,0.1);margin:32px 40px"></div>
        <div style="display:inline-flex;align-items:center;gap:14px;background:linear-gradient(#f7f9fc,#dfe5ee);color:#0e1217;border-radius:14px;padding:20px 44px;font-size:28px;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.35)">
          <svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-9.96 9.12l5.35 2.21a2.83 2.83 0 0 1 1.6-.49l2.38-3.45v-.05a3.78 3.78 0 1 1 3.78 3.78h-.09l-3.4 2.43a2.84 2.84 0 0 1-5.62.59L2.3 14.6A10 10 0 1 0 12 2Z" fill="#0e1217"/></svg>
          Wishlist on Steam
        </div>
        <div class="kicker" style="justify-content:center;margin-top:22px"><span class="dot"></span>Esports Manager: FPS</div>
      </div></div>`
    return shoot(html, 1200, 900, file)
}

async function close() { if (browser) await browser.close(); browser = undefined }

module.exports = { caption, statement, endPanel, close }
