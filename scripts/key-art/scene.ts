/**
 * Key-art scene compositions (HTML/CSS/SVG/canvas) rendered by
 * scripts/key-art/render-key-art.ts with Playwright. Everything here is drawn
 * by code from project data: the baked radar art (public/radar-art, itself
 * generated from the nav meshes by scripts/bake-radar-art.ts), the round-map
 * spawns/sites/routes (data/round-maps) and the project fonts (app/fonts).
 *
 * One scene, three passes:
 *   stage   background only (floor, light pools, beams, haze, dust, vignette)
 *   table   the tilted radar "broadcast table" alone, transparent background
 *   full    everything (season splash and review previews)
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { RoundMap } from "../../engine/match/round-script-types"

export type ScenePass = "stage" | "table" | "full"

export interface SceneOptions {
    pass: ScenePass
    width: number
    height: number
    map: string
    /** Screen point the table centre sits on. */
    focus: { x: number; y: number }
    /** CSS 3D camera. */
    camera: { perspective: number; originX: number; originY: number; tiltX: number; spinZ: number; lift: number }
    /** Table size in local px (radar drawn at `radar` px, centred). */
    table: { width: number; height: number; radar: number; radarOffsetX?: number; radarOffsetY?: number }
    /** Light design. */
    light: "title" | "season"
    seed: number
}

const ROOT = process.cwd()
const fileUrl = (rel: string) => pathToFileURL(path.join(ROOT, rel)).href

export const GOLD = "#F2B53A"
export const CT = "#5AA9FF"
export const T_SIDE = "#FF8A3D"
export const INK = "#07090C"
/** Max alpha (0–255) of the per-pixel grain. */
const GRAIN_ALPHA = 7

function fontFaces(): string {
    return [600, 700, 800]
        .map(w => `@font-face{font-family:'Barlow Condensed';font-weight:${w};src:url('${fileUrl(`app/fonts/barlow-condensed-latin-${w}-normal.woff2`)}') format('woff2')}`)
        .join("\n")
}

function roundMap(map: string): RoundMap {
    return JSON.parse(readFileSync(path.join(ROOT, "data/round-maps", `${map}.json`), "utf8")) as RoundMap
}

/** Tactical overlay in the radar's percent frame (viewBox 0–100). */
function tacticalOverlay(map: string): string {
    const m = roundMap(map)
    const upper = <T extends { floor?: string }>(p: T) => !p.floor || p.floor === "upper"
    const pts = (ps: { x: number; y: number }[]) => ps.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")
    const routes = (m.routes as unknown as { kind: string; site?: string; points: { x: number; y: number; floor?: string }[] }[])
        .filter(r => r.points.length > 4 && r.points.every(upper))
    const tRoutes = routes.filter(r => r.kind.startsWith("t-")).slice(0, 2)
    const ctRoutes = routes.filter(r => r.kind.startsWith("ct") || r.kind.includes("rotate")).slice(0, 1)
    const route = (r: (typeof routes)[number], color: string, opacity: number) =>
        `<polyline points="${pts(r.points)}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="0.32" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0.9 0.9"/>`
    const dot = (p: { x: number; y: number }, color: string) =>
        `<circle cx="${p.x}" cy="${p.y}" r="1.25" fill="${color}" fill-opacity="0.22"/><circle cx="${p.x}" cy="${p.y}" r="0.55" fill="${color}"/>`
    const site = (key: "A" | "B") => {
        const s = m.sites[key]
        if (!s || !upper(s.center)) return ""
        const c = s.center
        return `<polygon points="${pts(s.polygon)}" fill="${GOLD}" fill-opacity="0.10" stroke="${GOLD}" stroke-opacity="0.75" stroke-width="0.28"/>
<circle cx="${c.x}" cy="${c.y}" r="5.4" fill="none" stroke="${GOLD}" stroke-opacity="0.35" stroke-width="0.18"/>
<text x="${c.x}" y="${c.y + 1.55}" text-anchor="middle" font-family="Barlow Condensed" font-weight="800" font-size="4.4" fill="${GOLD}" fill-opacity="0.95">${key}</text>`
    }
    return `<svg class="tactics" viewBox="0 0 100 100" preserveAspectRatio="none">
${tRoutes.map(r => route(r, T_SIDE, 0.55)).join("\n")}
${ctRoutes.map(r => route(r, CT, 0.55)).join("\n")}
${site("A")}${site("B")}
${m.spawns.T.filter(upper).map(p => dot(p, T_SIDE)).join("")}
${m.spawns.CT.filter(upper).map(p => dot(p, CT)).join("")}
</svg>`
}

/** Site-A centre in radar percent (ping anchor). */
export function siteCenter(map: string, key: "A" | "B" = "A"): { x: number; y: number } {
    const c = roundMap(map).sites[key].center
    return { x: c.x, y: c.y }
}

export function sceneHtml(o: SceneOptions): string {
    const { width: W, height: H, camera: cam, table: tb } = o
    const radarUrl = fileUrl(`public/radar-art/${o.map}-upper.webp`)
    const showStage = o.pass !== "table"
    const showTable = o.pass !== "stage"
    const ping = siteCenter(o.map, "A")
    const rx = (tb.width - tb.radar) / 2 + (tb.radarOffsetX ?? 0)
    const ry = (tb.height - tb.radar) / 2 + (tb.radarOffsetY ?? 0)
    const season = o.light === "season"

    // Extruded slab: stacked copies 2px apart under the top.
    const slabCount = Math.max(4, Math.round(cam.lift / 2))
    const slabLayers = Array.from({ length: slabCount }, (_, i) => {
        const z = cam.lift - 2 - i * 2
        const t = i / (slabCount - 1)
        return `<div class="slab" style="transform:translateZ(${z}px);filter:brightness(${(0.95 - t * 0.6).toFixed(3)})"></div>`
    }).join("")

    return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces()}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${o.pass === "table" ? "transparent" : INK}}
#root{position:absolute;inset:0;overflow:hidden}
.layer{position:absolute;inset:0}
/* ── stage light ───────────────────────────────────────── */
.wash{background:
  radial-gradient(${season ? "52% 46% at 50% 8%" : "48% 60% at 64% 10%"}, ${season ? "rgba(242,181,58,.16)" : "rgba(120,150,190,.10)"} 0%, transparent 70%),
  radial-gradient(60% 55% at ${(o.focus.x / W) * 100}% ${(o.focus.y / H) * 100 + 4}%, rgba(28,38,54,.85) 0%, rgba(13,16,21,.55) 45%, transparent 75%),
  radial-gradient(40% 40% at ${season ? "88% 30%" : "92% 30%"}, rgba(90,169,255,.07) 0%, transparent 70%),
  linear-gradient(180deg, #0B0E13 0%, ${INK} 55%, #050608 100%)}
.scene{position:absolute;inset:0;perspective:${cam.perspective}px;perspective-origin:${cam.originX}px ${cam.originY}px}
.ground{position:absolute;left:${o.focus.x}px;top:${o.focus.y}px;width:0;height:0;transform-style:preserve-3d;transform:rotateX(${cam.tiltX}deg) rotateZ(${cam.spinZ}deg)}
.grid{position:absolute;left:-3200px;top:-3200px;width:6400px;height:6400px;
  background-image:linear-gradient(rgba(174,182,194,.075) 2px,transparent 2px),linear-gradient(90deg,rgba(174,182,194,.075) 2px,transparent 2px);
  background-size:160px 160px;background-position:-80px -80px;
  -webkit-mask-image:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.55) 38%,transparent 82%);mask-image:radial-gradient(closest-side,#000 0%,rgba(0,0,0,.55) 38%,transparent 82%)}
.grid.fine{background-image:linear-gradient(rgba(174,182,194,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(174,182,194,.035) 1px,transparent 1px);background-size:40px 40px}
.pool{position:absolute;border-radius:50%;filter:blur(40px)}
.shadow{position:absolute;left:${-tb.width / 2 - 30}px;top:${-tb.height / 2 - 10}px;width:${tb.width + 60}px;height:${tb.height + 70}px;border-radius:60px;background:rgba(0,0,0,.85);filter:blur(36px)}
/* ── table ─────────────────────────────────────────────── */
.table{position:absolute;left:${-tb.width / 2}px;top:${-tb.height / 2}px;width:${tb.width}px;height:${tb.height}px;transform-style:preserve-3d}
.slab{position:absolute;inset:0;border-radius:26px;background:#1A212B;border:2px solid #2A3340}
.top{position:absolute;inset:0;border-radius:26px;transform:translateZ(${cam.lift}px);overflow:hidden;
  background:
    radial-gradient(70% 60% at 50% 45%, rgba(26,36,51,.95) 0%, rgba(13,17,23,.98) 70%),
    #0B0F14;
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.07), inset 0 0 120px rgba(0,0,0,.65)}
.top .fine{position:absolute;inset:0;background-image:linear-gradient(rgba(90,169,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(90,169,255,.055) 1px,transparent 1px);background-size:32px 32px}
.top .coarse{position:absolute;inset:0;background-image:linear-gradient(rgba(90,169,255,.09) 2px,transparent 2px),linear-gradient(90deg,rgba(90,169,255,.09) 2px,transparent 2px);background-size:160px 160px;background-position:${(tb.width % 160) / 2}px ${(tb.height % 160) / 2}px}
.top .sheen{position:absolute;inset:0;background:
    radial-gradient(38% 34% at 34% 30%, rgba(242,181,58,.10) 0%, transparent 70%),
    radial-gradient(30% 30% at 82% 22%, rgba(90,169,255,.08) 0%, transparent 70%),
    linear-gradient(135deg, rgba(255,255,255,.045) 0%, transparent 38%, transparent 70%, rgba(0,0,0,.25) 100%)}
.radar{position:absolute;left:${rx}px;top:${ry}px;width:${tb.radar}px;height:${tb.radar}px}
.radar img{position:absolute;inset:0;width:100%;height:100%}
.radar .glow{filter:url(#edgeGlow)}
.radar .body{filter:url(#holo)}
.radar .tactics{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.rim{position:absolute;inset:0;border-radius:26px;transform:translateZ(${cam.lift + 0.5}px);
  box-shadow:inset 0 -3px 0 rgba(242,181,58,.85), inset 0 3px 0 rgba(90,169,255,.55), inset 3px 0 0 rgba(255,255,255,.06), inset -3px 0 0 rgba(255,255,255,.06)}
.rimglow{position:absolute;inset:-40px;border-radius:60px;transform:translateZ(${cam.lift - 1}px);
  background:radial-gradient(closest-side, transparent 88%, rgba(90,169,255,.0) 100%)}
.bracket{position:absolute;width:64px;height:64px;border-color:rgba(242,244,247,.38);border-style:solid;border-width:0;transform:translateZ(${cam.lift + 0.6}px)}
.mark{position:absolute;width:2px;height:2px;transform:translateZ(${cam.lift}px)}
/* ── light ─────────────────────────────────────────────── */
.beam{position:absolute;transform-origin:50% 0;filter:blur(9px)}
#dust{position:absolute;inset:0}
.vignette{background:radial-gradient(${season ? "120% 100% at 50% 55%" : "105% 92% at 64% 48%"}, transparent 42%, rgba(3,4,6,.6) 76%, rgba(3,4,6,.95) 100%),linear-gradient(0deg, rgba(3,4,6,.7) 0%, transparent 22%)}
.titlelight{background:
  radial-gradient(36% 30% at 50% 14%, rgba(242,181,58,.22) 0%, rgba(242,181,58,.06) 45%, transparent 72%),
  linear-gradient(90deg, transparent 18%, rgba(242,181,58,.35) 50%, transparent 82%) 0 ${H * 0.36}px / 100% 2px no-repeat}
</style></head><body><div id="root">
<svg width="0" height="0" style="position:absolute">
  <defs>
    <!-- Radar body: luminance → graphite-blue ramp (walls brighter), source hue kept faintly for the site tints. -->
    <filter id="holo" color-interpolation-filters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="
        0.55 0.25 0.10 0 -0.02
        0.60 0.40 0.15 0  0.00
        0.70 0.55 0.45 0  0.03
        0    0    0    0.92 0" />
    </filter>
    <!-- Outer edge glow: alpha ring (dilate − alpha) tinted CT blue and blurred, plus a crisp line. -->
    <filter id="edgeGlow" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3" result="d"/>
      <feComposite in="d" in2="SourceAlpha" operator="out" result="ring"/>
      <feFlood flood-color="${CT}" result="c"/>
      <feComposite in="c" in2="ring" operator="in" result="line"/>
      <feGaussianBlur in="line" stdDeviation="10" result="soft"/>
      <feGaussianBlur in="line" stdDeviation="3" result="mid"/>
      <feMerge><feMergeNode in="soft"/><feMergeNode in="soft"/><feMergeNode in="mid"/><feMergeNode in="line"/></feMerge>
    </filter>
  </defs>
</svg>
${showStage ? `<div class="layer wash"></div>` : ""}
<div class="scene"><div class="ground">
  ${showStage ? `<div class="grid fine"></div><div class="grid"></div>
  <div class="pool" style="left:${-tb.width * 0.85}px;top:${-tb.height * 0.8}px;width:${tb.width * 1.7}px;height:${tb.height * 1.6}px;background:radial-gradient(closest-side, rgba(90,169,255,.22), transparent)"></div>
  <div class="pool" style="left:${-tb.width * 0.55}px;top:${tb.height * 0.05}px;width:${tb.width * 1.1}px;height:${tb.height * 0.8}px;background:radial-gradient(closest-side, rgba(242,181,58,.14), transparent)"></div>
  <div class="shadow"></div>` : ""}
  ${showTable ? `<div class="table">
    ${slabLayers}
    <div class="top">
      <div class="fine"></div><div class="coarse"></div><div class="sheen"></div>
      <div class="radar"><img class="glow" src="${radarUrl}"><img class="body" src="${radarUrl}">${tacticalOverlay(o.map)}</div>
    </div>
    <div class="rim"></div>
    <div class="bracket" style="left:26px;top:26px;border-left-width:3px;border-top-width:3px"></div>
    <div class="bracket" style="right:26px;top:26px;border-right-width:3px;border-top-width:3px"></div>
    <div class="bracket" style="left:26px;bottom:26px;border-left-width:3px;border-bottom-width:3px"></div>
    <div class="bracket" style="right:26px;bottom:26px;border-right-width:3px;border-bottom-width:3px"></div>
    <div class="mark" id="c-tl" style="left:0;top:0"></div>
    <div class="mark" id="c-tr" style="left:${tb.width}px;top:0"></div>
    <div class="mark" id="c-br" style="left:${tb.width}px;top:${tb.height}px"></div>
    <div class="mark" id="c-bl" style="left:0;top:${tb.height}px"></div>
    <div class="mark" id="p-c" style="left:${rx + (ping.x / 100) * tb.radar}px;top:${ry + (ping.y / 100) * tb.radar}px"></div>
    <div class="mark" id="p-x" style="left:${rx + (ping.x / 100) * tb.radar + 100}px;top:${ry + (ping.y / 100) * tb.radar}px"></div>
    <div class="mark" id="p-y" style="left:${rx + (ping.x / 100) * tb.radar}px;top:${ry + (ping.y / 100) * tb.radar + 100}px"></div>
  </div>` : ""}
</div></div>
${showStage ? `<div class="layer" id="beams"></div><canvas id="dust" width="${W}" height="${H}"></canvas>${season ? `<div class="layer titlelight"></div>` : ""}<div class="layer vignette"></div><canvas id="grain" class="layer" width="${W}" height="${H}"></canvas>` : ""}
</div>
<script>
(function(){
  var W=${W},H=${H},seed=${o.seed};
  function rnd(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}
  var focus={x:${o.focus.x},y:${o.focus.y}};
  // Beams: [origin x, origin y, width at end, colour, alpha] aimed at the table.
  var beams=${JSON.stringify(
        season
            ? [
                  [W * 0.5, -60, 700, "242,181,58", 0.2, 48],
                  [W * 0.36, -60, 400, "242,181,58", 0.12, 30],
                  [W * 0.64, -60, 400, "242,181,58", 0.12, 30],
                  [W * 0.1, -80, 300, "90,169,255", 0.12, 18],
                  [W * 0.9, -80, 300, "90,169,255", 0.12, 18],
              ]
            : [
                  [W * 0.5, -80, 520, "242,181,58", 0.2, 40],
                  [W * 0.6, -80, 260, "242,181,58", 0.12, 22],
                  [W * 0.88, -80, 480, "90,169,255", 0.18, 34],
                  [W * 0.98, -60, 240, "90,169,255", 0.1, 20],
              ],
    )};
  var host=document.getElementById('beams');
  if(host){beams.forEach(function(b){
    var dx=focus.x-b[0],dy=focus.y-b[1],len=Math.sqrt(dx*dx+dy*dy)*1.08,ang=Math.atan2(dy,dx)*180/Math.PI-90;
    var el=document.createElement('div');el.className='beam';
    el.style.left=(b[0]-b[2]/2)+'px';el.style.top=b[1]+'px';el.style.width=b[2]+'px';el.style.height=len+'px';
    el.style.transform='rotate('+ang+'deg)';
    var core=document.createElement('div');core.style.position='absolute';core.style.inset='0';
    core.style.clipPath='polygon(49% 0,51% 0,'+(50+b[5])+'% 100%,'+(50-b[5])+'% 100%)';
    core.style.background='linear-gradient(180deg, rgba('+b[3]+','+(b[4]*1.5)+') 0%, rgba('+b[3]+','+b[4]+') 30%, rgba('+b[3]+','+(b[4]*0.3)+') 75%, rgba('+b[3]+',0) 100%)';
    var line=document.createElement('div');line.style.position='absolute';line.style.inset='0';
    line.style.clipPath='polygon(49.6% 0,50.4% 0,'+(50+b[5]*0.18)+'% 100%,'+(50-b[5]*0.18)+'% 100%)';
    line.style.background='linear-gradient(180deg, rgba('+b[3]+','+Math.min(1,b[4]*2.6)+') 0%, rgba('+b[3]+','+(b[4]*1.2)+') 45%, rgba('+b[3]+',0) 100%)';
    el.appendChild(core);el.appendChild(line);host.appendChild(el);
  });}
  var cv=document.getElementById('dust');
  if(cv){var ctx=cv.getContext('2d');
    for(var i=0;i<900;i++){
      // Dust gathers in the light above the table.
      var inBeam=rnd()<0.7;
      var x=inBeam?focus.x+(rnd()-0.5)*W*0.62:rnd()*W;
      var y=inBeam?rnd()*focus.y*1.05:rnd()*H;
      var r=rnd()<0.92?0.6+rnd()*1.3:1.8+rnd()*2.4;
      var a=(r>2?0.10:0.22)*(0.35+rnd()*0.65)*(1-Math.min(1,Math.abs(x-focus.x)/(W*0.5)));
      var warm=rnd()<0.6;
      var g=ctx.createRadialGradient(x,y,0,x,y,r*2.2);
      var col=warm?'255,214,150':'170,205,255';
      g.addColorStop(0,'rgba('+col+','+a+')');g.addColorStop(1,'rgba('+col+',0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*2.2,0,Math.PI*2);ctx.fill();
    }}
  // Fine grain over the stage: dithers the dark gradients so they do not band.
  var grain=document.getElementById('grain');
  if(grain){var gx=grain.getContext('2d'),img=gx.createImageData(W,H),d=img.data;
    for(var p=0;p<d.length;p+=4){var v=rnd()<0.5?0:255;d[p]=v;d[p+1]=v;d[p+2]=v;d[p+3]=Math.floor(rnd()*${GRAIN_ALPHA});}
    gx.putImageData(img,0,0);}
  window.__ready=true;
})();
</script>
</body></html>`
}
