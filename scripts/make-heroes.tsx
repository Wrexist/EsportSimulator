#!/usr/bin/env tsx
/**
 * Immersive 16:9 (1920x1080) marketing hero images: the ACTUAL game screenshots
 * (public/Live match.jpg, marketing/squad.png — real UI, real attractive values)
 * presented on a 3D-tilted, glowing plane over an esports-arena backdrop, with
 * the bold white game wordmark + tagline.
 *
 * These are marketing / library-hero / page-background art (they composite the
 * screenshot with logo + lighting) — NOT for the raw "Screenshots" slot, which
 * should get the unedited screenshots themselves.
 *
 * Generates + renders in one pass (Playwright, exact 1920x1080).
 */
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const ROOT = process.cwd()
const OUT = path.join(ROOT, "tmp", "steam-heroes")
fs.mkdirSync(OUT, { recursive: true })

const MATCH = `file://${ROOT}/public/Live%20match.jpg`
const SQUAD = `file://${ROOT}/marketing/squad.png`

const css = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:#04060c;font-family:'Arial Black',Impact,system-ui,sans-serif}
.stage{position:fixed;inset:0;overflow:hidden;background:
  radial-gradient(80% 70% at 78% 18%, #12294a 0%, #070d1a 46%, #04060c 100%)}
/* ambient blurred screenshot wash for depth */
.wash{position:absolute;inset:-6%;background-size:cover;background-position:center;filter:blur(60px) saturate(1.3) brightness(.5);opacity:.5;transform:scale(1.2)}
.glow{position:absolute;border-radius:50%;filter:blur(120px);mix-blend-mode:screen}
.gold{width:820px;height:820px;background:#ffb43a;opacity:.20}
.cyan{width:760px;height:760px;background:#2a9fe6;opacity:.26}
.violet{width:680px;height:680px;background:#7c3aed;opacity:.22}
.vig{position:absolute;inset:0;background:
  radial-gradient(120% 100% at 50% 45%, transparent 40%, rgba(3,5,10,.55) 100%),
  linear-gradient(180deg, rgba(4,7,14,.4) 0%, transparent 22%, transparent 60%, rgba(3,5,10,.75) 100%)}
.rays{position:absolute;inset:0;opacity:.10;mix-blend-mode:screen;
  background:repeating-linear-gradient(108deg, transparent 0 60px, #bfe4ff10 60px 63px)}
/* 3D screenshot panel */
.panel{position:absolute;border-radius:16px;overflow:hidden;background:#0a0e16;
  box-shadow:0 60px 130px rgba(0,0,0,.78), 0 0 0 1px rgba(255,255,255,.09), 0 0 120px rgba(60,150,255,.18);
  border:1px solid rgba(255,255,255,.06)}
.panel img{display:block;width:100%;height:100%;object-fit:cover}
.panel::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg, rgba(255,255,255,.10) 0%, transparent 26%, transparent 78%, rgba(0,0,0,.28) 100%)}
.rim{position:absolute;border-radius:20px;box-shadow:0 0 90px rgba(90,180,255,.35)}
/* bold white wordmark */
.logo{display:flex;flex-direction:column;line-height:.9}
.logo .row{white-space:nowrap;color:#fff;font-weight:900;letter-spacing:-.012em;paint-order:stroke fill;
  text-shadow:0 4px 0 rgba(2,6,12,.4),0 8px 26px rgba(0,0,0,.72)}
.logo .fps{color:#ffd15a}
.rule{height:4px;border-radius:2px;background:linear-gradient(90deg,#ffd15a,transparent);margin:22px 0 20px}
.tag{color:#eaf1fb;font:800 26px/1.25 system-ui;letter-spacing:.06em;text-shadow:0 2px 16px #000}
.tag b{color:#ffd15a}
.kicker{color:#8fd0ff;font:800 17px/1 system-ui;letter-spacing:.34em;text-transform:uppercase;margin-bottom:22px;text-shadow:0 2px 12px #000}
.pill{display:inline-block;margin-top:30px;color:#eaf3ff;font:800 15px/1 system-ui;letter-spacing:.2em;text-transform:uppercase;
  border:1px solid #ffffff2e;background:#0a1220aa;padding:12px 20px;border-radius:999px}
`

function wordmark(fs1: number, fsFps: number, inline = false): string {
    const sw = (s: number) => Math.max(1.5, s * 0.05).toFixed(1)
    const row = (t: string, s: number, fps = false) =>
        `<div class="row ${fps ? "fps" : ""}" style="font-size:${s}px;-webkit-text-stroke:${sw(s)}px ${fps ? "rgba(60,34,0,.55)" : "rgba(4,10,20,.5)"}">${t}</div>`
    return `<div class="logo">${inline ? row("ESPORTS MANAGER", fs1) : row("ESPORTS", fs1) + row("MANAGER", fs1)}${row("FPS", fsFps, true)}</div>`
}

function stage(inner: string, washImg: string): string {
    return `<!doctype html><meta charset=utf8><style>${css}</style>
    <div class="stage">
      <div class="wash" style="background-image:url('${washImg}')"></div>
      <div class="glow gold" style="right:-4%;top:-16%"></div>
      <div class="glow cyan" style="left:34%;top:26%"></div>
      <div class="glow violet" style="right:6%;bottom:-18%"></div>
      <div class="rays"></div>${inner}<div class="vig"></div></div>`
}

const heroes: Array<{ name: string; html: string }> = [
    // 1. Live match — panel tilted right, copy on the left
    {
        name: "hero_match_1920x1080",
        html: stage(`
      <div class="rim" style="left:905px;top:210px;width:930px;height:523px"></div>
      <div class="panel" style="left:905px;top:210px;width:930px;height:523px;
        transform:perspective(2000px) rotateY(-17deg) rotateX(3deg)">
        <img src="${MATCH}">
      </div>
      <div style="position:absolute;left:110px;top:300px;width:720px">
        <div class="kicker">Counter-Strike · Esports Manager</div>
        ${wordmark(96, 62)}
        <div class="rule" style="width:300px"></div>
        <div class="tag">Draft the map, call every round,<br>and lead your team to the <b>Major</b>.</div>
        <div class="pill">Early Access</div>
      </div>`, MATCH),
    },
    // 2. Squad — panel tilted left, copy on the right
    {
        name: "hero_squad_1920x1080",
        html: stage(`
      <div class="rim" style="left:85px;top:220px;width:940px;height:513px"></div>
      <div class="panel" style="left:85px;top:220px;width:940px;height:513px;
        transform:perspective(2000px) rotateY(16deg) rotateX(3deg)">
        <img src="${SQUAD}">
      </div>
      <div style="position:absolute;right:110px;top:310px;width:660px;text-align:right">
        <div class="kicker" style="letter-spacing:.3em">Build your dynasty</div>
        <div style="display:flex;align-items:flex-end;flex-direction:column">${wordmark(92, 58)}</div>
        <div class="rule" style="width:280px;margin-left:auto;background:linear-gradient(270deg,#ffd15a,transparent)"></div>
        <div class="tag">Scout raw talent, sign stars,<br>and forge an <b>unbeatable roster</b>.</div>
      </div>`, SQUAD),
    },
    // 3. Duo — two panels layered, centered copy up top
    {
        name: "hero_showcase_1920x1080",
        html: stage(`
      <div class="panel" style="left:120px;top:430px;width:820px;height:461px;
        transform:perspective(2200px) rotateY(19deg) rotateX(5deg);opacity:.96">
        <img src="${SQUAD}">
      </div>
      <div class="rim" style="right:120px;top:300px;width:880px;height:495px"></div>
      <div class="panel" style="right:120px;top:300px;width:880px;height:495px;
        transform:perspective(2200px) rotateY(-15deg) rotateX(3deg)">
        <img src="${MATCH}">
      </div>
      <div style="position:absolute;left:0;right:0;top:70px;text-align:center;display:flex;flex-direction:column;align-items:center">
        <div class="kicker">The ultimate CS manager sim</div>
        <div style="display:flex;flex-direction:column;align-items:center">${wordmark(88, 56, true)}</div>
        <div class="rule" style="width:420px;background:linear-gradient(90deg,transparent,#ffd15a,transparent)"></div>
        <div class="tag" style="text-align:center">Your team · your meta · <b>your legacy</b></div>
      </div>`, MATCH),
    },
]

async function main() {
    const chromePath = fs.readdirSync("/opt/pw-browsers")
        .map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p))
    const browser = await chromium.launch({ executablePath: chromePath, args: ["--no-sandbox"] })
    for (const h of heroes) {
        const htmlPath = path.join(OUT, `${h.name}.html`)
        fs.writeFileSync(htmlPath, h.html)
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
        const page = await ctx.newPage()
        await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" })
        await page.waitForTimeout(500)
        await page.screenshot({ path: path.join(OUT, `${h.name}.png`) })
        await ctx.close()
        console.log("  ✓", h.name)
    }
    await browser.close()
    console.log(`Done — ${heroes.length} hero images in ${path.relative(ROOT, OUT)}`)
}
main()
