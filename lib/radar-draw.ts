/**
 * Canvas 2D radar renderer.
 *
 * One visible canvas. The static base (map art, site areas and letters,
 * vignette) is rendered into an offscreen canvas only when the view, size,
 * floor or art changes; every frame blits it and draws the dynamic layer from
 * a sampled `RadarScene`. Sprites (view cones, smoke, fire, name plates) are
 * rendered once and reused; gradients and dash arrays are cached, so a frame
 * allocates nothing beyond a few temporaries (label relayout ~4×/s).
 *
 * Sizes are CSS px; the context carries the device-pixel ratio.
 */

import type { Floor, Side, UtilityKind } from "@/engine/match/round-script-types"
import type { RadarScene, ScenePlayer, WeaponClass } from "./radar-scene"
import { DEFAULT_VIEW, viewTransform, type RadarBounds, type RadarTransform, type RadarView } from "./radar-view"
import { layoutRadarLabels, type RadarLabel } from "./radar-label-layout"
import type { RadarPlayerDot } from "./radar-types"

export const RADAR_COLORS = {
    ct: "#5AA9FF",
    t: "#FF8A3D",
    gold: "#F2B53A",
    ink: "#07090C",
    shell: "#0D1015",
    panel: "#12161C",
    ink1: "#F2F4F7",
    ink2: "#AEB6C2",
    ink3: "#808A99",
    bomb: "#FF5468",
    positive: "#3DD68C",
    fire: "#FF7A1A",
    fireEdge: "#FFB020",
} as const

const sideColor = (side: Side) => (side === "CT" ? RADAR_COLORS.ct : RADAR_COLORS.t)
/** Opacity of things on the floor the radar is not showing. */
const OTHER_FLOOR = 0.3
const CONE_HALF_ANGLE = 0.4
const TAU = Math.PI * 2
const LABEL_HEIGHT = 18
const LABEL_FONT = '600 11px "Inter Variable", "Segoe UI", system-ui, sans-serif'
const HP_FONT = '700 10px "Inter Variable", "Segoe UI", system-ui, sans-serif'
const SITE_FONT_FAMILY = '"Barlow Condensed", "Arial Narrow", "Segoe UI", sans-serif'
const TIMER_FONT = '700 10px "Inter Variable", "Segoe UI", system-ui, sans-serif'
/** Milliseconds between name relayouts (labels ride with their dots in between). */
const LABEL_RELAYOUT_MS = 250
const FLOOR_FADE_MS = 220
const NO_DASH: number[] = []
const DASH_EDGE = [3, 3]
const DASH_ARC = [2, 4]

// Weapon silhouettes on a 32×12 grid (same shapes as components/match/WeaponGlyph).
const GLYPH_PATHS: Record<WeaponClass, string> = {
    rifle: "M1 4h21v-1h2v1h7v1.6h-6v1.4h-4l-1.4 4.2h-2.4l.9-4.2h-3.3l-.8 2.6h-2.1l.5-2.6h-4.4L4.5 9.5H1z",
    sniper: "M1 4.4h11V3h-1V1.6h7V3h-1v1.4h14.5v1.2H18v1.6h-3.2l-1 3.6h-2.2l.8-3.6H6L3.8 9.5H1z",
    pistol: "M8 2.5h16v3.2h-9.2l-1.4 5.8H9.6l1.3-5.8H8z",
    smg: "M3 3.5h20v-1h2v1h3v1.8h-5v2h-4.6l-.8 3.7h-2.2l.7-3.7H9.5l-.9 2.2H6.4l.8-2.2H3z",
    shotgun: "M1 4h29.5v1.4H15v1.3h-5.2l-.4 1.8H7.6L5 9.5H1z M16 5.4h7v1.6h-7z",
}

export interface RadarSite {
    id: "A" | "B"
    x: number
    y: number
    floor?: Floor
    polygon?: readonly { x: number; y: number }[]
}

export interface RadarFrameOptions {
    level: Floor
    dualLevel: boolean
    showNames: boolean
    reducedMotion: boolean
    /** Wall clock (ms) for pulses and flicker. */
    nowMs: number
    selectedId: string | null
}

/** A pre-rendered image; `image` becomes an ImageBitmap once decoded (cheaper to blit than a canvas). */
interface Sprite { canvas: HTMLCanvasElement; w: number; h: number; image: CanvasImageSource }

function makeSprite(canvas: HTMLCanvasElement, w: number, h: number): Sprite {
    const sp: Sprite = { canvas, w, h, image: canvas }
    if (typeof createImageBitmap === "function") createImageBitmap(canvas).then(b => { sp.image = b }).catch(() => { })
    return sp
}

function releaseSprites(map: Map<string, Sprite>): void {
    for (const sp of map.values()) if (typeof ImageBitmap !== "undefined" && sp.image instanceof ImageBitmap) sp.image.close()
    map.clear()
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas")
    c.width = Math.max(1, Math.ceil(w))
    c.height = Math.max(1, Math.ceil(h))
    return c
}

function ctx2d(c: HTMLCanvasElement, opaque = false): CanvasRenderingContext2D {
    const ctx = (opaque ? c.getContext("2d", { alpha: false }) : c.getContext("2d")) as CanvasRenderingContext2D | null
    if (!ctx) throw new Error("2d context unavailable")
    return ctx
}

export class RadarRenderer {
    readonly canvas: HTMLCanvasElement
    private readonly ctx: CanvasRenderingContext2D
    width = 0
    height = 0
    dpr = 1
    view: RadarView = DEFAULT_VIEW
    private readonly tf: RadarTransform = { k: 1, ox: 0, oy: 0 }
    private images: Partial<Record<Floor, HTMLImageElement>> = {}
    private sites: RadarSite[] = []
    private base: HTMLCanvasElement | null = null
    private prevBase: HTMLCanvasElement | null = null
    private baseKey = ""
    private baseBitmap: ImageBitmap | null = null
    /** Wall clock when the current explosion was first drawn (-1 = none). */
    private blastSeenMs = -1
    private baseFloor: Floor | null = null
    private fadeStart = -Infinity
    private smokeSprite: Sprite | null = null
    private fireSprite: Sprite | null = null
    private glyphs: Partial<Record<WeaponClass, Path2D>> = {}
    private labelSprites = new Map<string, Sprite>()
    private badgeSprites = new Map<string, Sprite>()
    private labelOffsets = new Map<string, { dx: number; dy: number }>()
    private labelPlaced = new Map<string, RadarLabel>()
    private labelLayoutMs = -Infinity
    private labelLayoutT = NaN
    private labelLayoutKey = ""
    private spriteDpr = 0

    /** Darkening over the art (the old bright overviews need it, baked art does not). */
    private artDim = 0.16
    /** Outline the plant areas (baked art tints them already). */
    private siteAreas = true

    /** Offscreen canvases (base layer, sprites); injectable for tests. */
    private readonly make: (w: number, h: number) => HTMLCanvasElement

    constructor(canvas: HTMLCanvasElement, createCanvas: (w: number, h: number) => HTMLCanvasElement = makeCanvas) {
        this.canvas = canvas
        this.make = createCanvas
        // Opaque: every frame starts with a full blit of the base, so no blending with the page.
        this.ctx = ctx2d(canvas, true)
    }

    setArtStyle(baked: boolean): void {
        const dim = baked ? 0 : 0.16
        if (dim === this.artDim && this.siteAreas === !baked) return
        this.artDim = dim
        this.siteAreas = !baked
        this.invalidateBase()
    }

    /** Sets the CSS size and device-pixel ratio; returns true if the backing store changed. */
    resize(width: number, height: number, dpr: number): boolean {
        const w = Math.max(1, Math.round(width * dpr)), h = Math.max(1, Math.round(height * dpr))
        if (this.canvas.width === w && this.canvas.height === h && this.width === width && this.height === height && this.dpr === dpr) return false
        this.width = width; this.height = height; this.dpr = dpr
        this.canvas.width = w; this.canvas.height = h
        this.invalidateBase()
        if (this.spriteDpr !== dpr) this.clearSprites()
        return true
    }

    setImage(floor: Floor, image: HTMLImageElement | null): void {
        if (image) this.images[floor] = image
        else delete this.images[floor]
        this.invalidateBase()
    }

    setSites(sites: RadarSite[]): void {
        this.sites = sites
        this.invalidateBase()
    }

    setView(view: RadarView): void {
        if (view.zoom === this.view.zoom && view.cx === this.view.cx && view.cy === this.view.cy) return
        this.view = view
        this.invalidateBase()
        this.labelLayoutMs = -Infinity
    }

    /** Fonts finished loading: name plates are re-rendered with the real face. */
    clearSprites(): void {
        releaseSprites(this.labelSprites)
        releaseSprites(this.badgeSprites)
        this.smokeSprite = null
        this.fireSprite = null
        this.spriteDpr = this.dpr
        this.invalidateBase()
    }

    invalidateBase(): void {
        this.baseKey = ""
    }

    get transform(): Readonly<RadarTransform> {
        return this.tf
    }

    /** Screen position (CSS px) of a map point. */
    project(x: number, y: number): { x: number; y: number } {
        return { x: this.tf.ox + x * this.tf.k, y: this.tf.oy + y * this.tf.k }
    }

    /** Icon scale: grows a little with the radar size and the zoom. */
    private iconScale(): number {
        const size = Math.min(this.width, this.height)
        return Math.max(0.9, Math.min(1.4, size / 720)) * (1 + (this.view.zoom - 1) * 0.25)
    }

    // ─── Base layer ────────────────────────────────────────────────────────

    private ensureBase(level: Floor, dualLevel: boolean, nowMs: number, reducedMotion: boolean): void {
        const image = this.images[level] ?? this.images.upper
        const key = `${this.canvas.width}x${this.canvas.height}|${this.view.zoom},${this.view.cx},${this.view.cy}|${level}|${image?.src ?? ""}|${this.sites.length}|${this.artDim}`
        if (key === this.baseKey && this.base) return
        if (this.base && this.baseFloor !== null && this.baseFloor !== level && !reducedMotion) {
            // Keep the previous floor for a short cross-fade.
            const swap = this.prevBase
            this.prevBase = this.base
            this.base = swap
            this.fadeStart = nowMs
        }
        if (!this.base || this.base.width !== this.canvas.width || this.base.height !== this.canvas.height) {
            this.base = this.make(this.canvas.width, this.canvas.height)
        }
        this.baseKey = key
        this.baseFloor = level
        const ctx = ctx2d(this.base, true)
        const { k, ox, oy } = this.tf
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        ctx.globalAlpha = 1
        ctx.fillStyle = "#0B0E13"
        ctx.fillRect(0, 0, this.width, this.height)
        const size = 100 * k
        if (image && image.complete && image.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = "high"
            ctx.drawImage(image, ox, oy, size, size)
            if (this.artDim > 0) {
                // Sink bright art a little so dots and utility read on top of it.
                ctx.fillStyle = `rgba(7, 9, 12, ${this.artDim})`
                ctx.fillRect(ox, oy, size, size)
            }
        }
        // Bombsites: plant area and letter. Sites on the other floor are faint.
        const s = this.iconScale()
        for (const site of this.sites) {
            const off = dualLevel && site.floor && site.floor !== level
            ctx.globalAlpha = off ? 0.3 : 1
            if (this.siteAreas && site.polygon && site.polygon.length > 2) {
                ctx.beginPath()
                site.polygon.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * k, oy + p.y * k) : ctx.moveTo(ox + p.x * k, oy + p.y * k)))
                ctx.closePath()
                ctx.fillStyle = "rgba(242, 244, 247, 0.05)"
                ctx.fill()
                ctx.setLineDash(DASH_EDGE)
                ctx.lineWidth = 1
                ctx.strokeStyle = "rgba(242, 244, 247, 0.28)"
                ctx.stroke()
                ctx.setLineDash(NO_DASH)
            }
            const fontPx = Math.round(Math.max(22, Math.min(64, 4.6 * k * Math.min(1.6, Math.sqrt(this.view.zoom)))) * Math.min(1.1, s))
            ctx.font = `800 ${fontPx}px ${SITE_FONT_FAMILY}`
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.lineJoin = "round"
            ctx.lineWidth = Math.max(3, fontPx * 0.14)
            ctx.strokeStyle = "rgba(7, 9, 12, 0.85)"
            const sx = ox + site.x * k, sy = oy + site.y * k
            ctx.strokeText(site.id, sx, sy)
            ctx.fillStyle = "rgba(242, 244, 247, 0.62)"
            ctx.fillText(site.id, sx, sy)
        }
        ctx.globalAlpha = 1
        // Vignette: sinks the edges.
        const r = Math.max(this.width, this.height)
        const g = ctx.createRadialGradient(this.width / 2, this.height / 2, r * 0.32, this.width / 2, this.height / 2, r * 0.75)
        g.addColorStop(0, "rgba(0, 0, 0, 0)")
        g.addColorStop(1, "rgba(0, 0, 0, 0.42)")
        ctx.fillStyle = g
        ctx.fillRect(0, 0, this.width, this.height)

        // Blitting an immutable bitmap every frame is much cheaper than a
        // canvas (no per-frame snapshot of the source); until it is ready the
        // canvas itself is drawn.
        this.baseBitmap?.close()
        this.baseBitmap = null
        if (typeof createImageBitmap === "function") {
            createImageBitmap(this.base).then(bmp => {
                if (this.baseKey === key && !this.baseBitmap) this.baseBitmap = bmp
                else bmp.close()
            }).catch(() => { })
        }
    }

    // ─── Sprites ───────────────────────────────────────────────────────────

    private smoke(): Sprite {
        if (this.smokeSprite) return this.smokeSprite
        const S = 128
        const c = this.make(S, S)
        const ctx = ctx2d(c)
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
        g.addColorStop(0, "rgba(176, 184, 195, 0.86)")
        g.addColorStop(0.8, "rgba(166, 175, 187, 0.84)")
        g.addColorStop(0.95, "rgba(158, 167, 180, 0.62)")
        g.addColorStop(1, "rgba(158, 167, 180, 0)")
        ctx.fillStyle = g
        ctx.fillRect(0, 0, S, S)
        // A little texture so it reads as a cloud, not a button.
        let seed = 7
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < 10; i++) {
            const a = rnd() * TAU, d = rnd() * S * 0.3, r = S * (0.1 + rnd() * 0.1)
            const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d
            const b = ctx.createRadialGradient(x, y, 0, x, y, r)
            const light = i % 2 === 0
            b.addColorStop(0, light ? "rgba(214, 220, 228, 0.22)" : "rgba(120, 128, 140, 0.16)")
            b.addColorStop(1, light ? "rgba(214, 220, 228, 0)" : "rgba(120, 128, 140, 0)")
            ctx.fillStyle = b
            ctx.fillRect(x - r, y - r, r * 2, r * 2)
        }
        this.smokeSprite = makeSprite(c, S, S)
        return this.smokeSprite
    }

    private fire(): Sprite {
        if (this.fireSprite) return this.fireSprite
        const S = 128
        const c = this.make(S, S)
        const ctx = ctx2d(c)
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
        g.addColorStop(0, "rgba(255, 196, 77, 0.78)")
        g.addColorStop(0.55, "rgba(255, 122, 26, 0.6)")
        g.addColorStop(0.92, "rgba(232, 72, 20, 0.42)")
        g.addColorStop(1, "rgba(232, 72, 20, 0)")
        ctx.fillStyle = g
        ctx.fillRect(0, 0, S, S)
        let seed = 11
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
        for (let i = 0; i < 14; i++) {
            const a = rnd() * TAU, d = rnd() * S * 0.36, r = S * (0.05 + rnd() * 0.08)
            const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d
            const b = ctx.createRadialGradient(x, y, 0, x, y, r)
            b.addColorStop(0, "rgba(255, 230, 140, 0.75)")
            b.addColorStop(1, "rgba(255, 140, 40, 0)")
            ctx.fillStyle = b
            ctx.fillRect(x - r, y - r, r * 2, r * 2)
        }
        this.fireSprite = makeSprite(c, S, S)
        return this.fireSprite
    }

    /** C4 / defuse-kit badge, rendered once per icon scale. */
    private badge(kind: "c4" | "kit", s: number): Sprite {
        const key = `${kind}|${s.toFixed(2)}`
        const hit = this.badgeSprites.get(key)
        if (hit) return hit
        const w = 14 * s, h = 11 * s, dpr = this.dpr
        const c = this.make(w * dpr, h * dpr)
        const ctx = ctx2d(c)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        if (kind === "c4") drawC4(ctx, w / 2, h / 2, 0.85 * s)
        else drawKit(ctx, w / 2, h / 2, s)
        const sprite = makeSprite(c, w, h)
        if (this.badgeSprites.size > 16) releaseSprites(this.badgeSprites)
        this.badgeSprites.set(key, sprite)
        return sprite
    }

    private glyph(cls: WeaponClass): Path2D | null {
        if (typeof Path2D === "undefined") return null
        return (this.glyphs[cls] ??= new Path2D(GLYPH_PATHS[cls]))
    }

    /** Name plate: side bar, weapon glyph, full nickname, HP when hurt. Rendered once per content. */
    private labelSprite(p: ScenePlayer, selected: boolean): Sprite {
        const hp = Number.isFinite(p.hp) && p.hp < 100 ? Math.max(0, Math.round(p.hp)) : -1
        const key = `${p.id}|${p.name}|${p.side}|${p.weapon ?? ""}|${hp}|${selected ? 1 : 0}`
        const hit = this.labelSprites.get(key)
        if (hit) return hit
        const dpr = this.dpr
        const measure = this.ctx
        measure.font = LABEL_FONT
        const textW = Math.ceil(measure.measureText(p.name).width)
        measure.font = HP_FONT
        const hpText = hp >= 0 ? String(hp) : ""
        const hpW = hp >= 0 ? Math.ceil(measure.measureText(hpText).width) + 6 : 0
        const glyphW = p.weapon ? 20 : 0
        const w = 8 + glyphW + textW + hpW + 7
        const h = LABEL_HEIGHT
        const c = this.make(w * dpr, h * dpr)
        const ctx = ctx2d(c)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 3)
        ctx.fillStyle = "rgba(13, 16, 21, 0.9)"
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = selected ? RADAR_COLORS.gold : "rgba(255, 255, 255, 0.1)"
        ctx.stroke()
        ctx.fillStyle = sideColor(p.side)
        ctx.fillRect(1, 2, 2, h - 4)
        let x = 8
        const glyph = p.weapon ? this.glyph(p.weapon) : null
        if (glyph) {
            ctx.save()
            ctx.translate(x, h / 2 - 3.6)
            ctx.scale(0.56, 0.6)
            ctx.fillStyle = RADAR_COLORS.ink2
            ctx.fill(glyph)
            ctx.restore()
            x += glyphW
        } else if (p.weapon) x += glyphW
        ctx.font = LABEL_FONT
        ctx.textBaseline = "middle"
        ctx.textAlign = "left"
        ctx.fillStyle = RADAR_COLORS.ink1
        ctx.fillText(p.name, x, h / 2 + 0.5)
        if (hpText) {
            ctx.font = HP_FONT
            ctx.fillStyle = hp <= 25 ? RADAR_COLORS.bomb : RADAR_COLORS.ink2
            ctx.fillText(hpText, x + textW + 6, h / 2 + 0.5)
        }
        const sprite = makeSprite(c, w, h)
        if (this.labelSprites.size > 200) releaseSprites(this.labelSprites)
        this.labelSprites.set(key, sprite)
        return sprite
    }

    // ─── Frame ─────────────────────────────────────────────────────────────

    /** Draws one frame. Returns true while something animates on the wall clock (pulses, flicker, fades). */
    draw(scene: RadarScene | null, o: RadarFrameOptions): boolean {
        const ctx = this.ctx
        if (this.spriteDpr !== this.dpr) this.clearSprites()
        viewTransform(this.view, this.width, this.height, this.tf)
        this.ensureBase(o.level, o.dualLevel, o.nowMs, o.reducedMotion)
        let animating = false

        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1
        if (this.base) {
            ctx.drawImage(this.baseBitmap ?? this.base, 0, 0)
        }
        const fade = (o.nowMs - this.fadeStart) / FLOOR_FADE_MS
        if (this.prevBase && fade < 1) {
            ctx.globalAlpha = 1 - Math.max(0, fade)
            ctx.drawImage(this.prevBase, 0, 0)
            ctx.globalAlpha = 1
            animating = true
        }
        if (!scene) return animating
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        ctx.lineCap = "round"
        ctx.lineJoin = "round"

        const { k, ox, oy } = this.tf
        const s = this.iconScale()
        const floorAlpha = (f: Floor) => (!o.dualLevel || f === o.level ? 1 : OTHER_FLOOR)

        // Smokes and fires sit under everything else.
        for (let i = 0; i < scene.utilityCount; i++) {
            const u = scene.utility[i]
            if (u.kind !== "smoke" && u.kind !== "molotov") continue
            const a = u.opacity * floorAlpha(u.floor)
            if (a <= 0.01) continue
            const x = ox + u.x * k, y = oy + u.y * k, R = Math.max(4, u.radius * k)
            if (u.kind === "smoke") {
                const sp = this.smoke()
                ctx.globalAlpha = a
                ctx.drawImage(sp.image, x - R, y - R, R * 2, R * 2)
                ctx.globalAlpha = a * 0.6
                ctx.lineWidth = 1
                ctx.strokeStyle = "rgba(226, 231, 237, 0.9)"
                ctx.beginPath(); ctx.arc(x, y, R * 0.95, 0, TAU); ctx.stroke()
            } else {
                const sp = this.fire()
                const flicker = o.reducedMotion ? 0.85 : 0.78 + 0.14 * Math.sin(o.nowMs / 85 + u.x * 3.1) + 0.06 * Math.sin(o.nowMs / 37 + u.y)
                if (!o.reducedMotion) animating = true
                const j = o.reducedMotion ? 1 : 1 + 0.03 * Math.sin(o.nowMs / 120 + u.y)
                ctx.globalAlpha = a * flicker
                ctx.drawImage(sp.image, x - R * j, y - R * j, R * 2 * j, R * 2 * j)
                ctx.globalAlpha = a * 0.85
                ctx.setLineDash(DASH_EDGE)
                ctx.lineWidth = 1.2
                ctx.strokeStyle = RADAR_COLORS.fireEdge
                ctx.beginPath(); ctx.arc(x, y, R * 0.95, 0, TAU); ctx.stroke()
                ctx.setLineDash(NO_DASH)
            }
            // Time left: an arc around the edge in the thrower's colour.
            if (u.side && u.remaining > 0 && u.progress < 1) {
                ctx.globalAlpha = a * 0.9
                ctx.lineWidth = 2
                ctx.strokeStyle = sideColor(u.side)
                ctx.beginPath(); ctx.arc(x, y, R + 2.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - u.progress)); ctx.stroke()
            }
        }
        ctx.globalAlpha = 1

        // Death markers: an X in the victim's colour, for the rest of the round.
        // Batched per floor (shown / other) and side: one outline stroke, one colour stroke.
        const xs = 4.6 * s
        for (let i = 0; i < scene.deathCount; i++) {
            const d = scene.deaths[i]
            if (d.age >= 0.6 || o.reducedMotion) continue
            // Fresh kill: a ring bursting out of the marker.
            ctx.globalAlpha = floorAlpha(d.floor) * (1 - d.age / 0.6)
            ctx.lineWidth = 1.5
            ctx.strokeStyle = sideColor(d.side)
            ctx.beginPath(); ctx.arc(ox + d.x * k, oy + d.y * k, 6 * s + d.age * 28 * s, 0, TAU); ctx.stroke()
            animating = true
        }
        for (let pass = 0; pass < (o.dualLevel ? 2 : 1) && scene.deathCount > 0; pass++) {
            const offPass = o.dualLevel && pass === 0
            const inPass = (f: Floor) => !o.dualLevel || (f === o.level) !== offPass
            ctx.globalAlpha = offPass ? OTHER_FLOOR : 0.92
            for (let side = 0; side < 3; side++) {
                // side 0 = outline for both, 1 = CT colour, 2 = T colour
                const want: Side | null = side === 0 ? null : side === 1 ? "CT" : "T"
                let any = false
                ctx.beginPath()
                for (let i = 0; i < scene.deathCount; i++) {
                    const d = scene.deaths[i]
                    if (!inPass(d.floor) || (want && d.side !== want)) continue
                    const x = ox + d.x * k, y = oy + d.y * k
                    ctx.moveTo(x - xs, y - xs); ctx.lineTo(x + xs, y + xs)
                    ctx.moveTo(x + xs, y - xs); ctx.lineTo(x - xs, y + xs)
                    any = true
                }
                if (!any) continue
                ctx.lineWidth = want ? 2.2 * s : 4.4 * s
                ctx.strokeStyle = want ? sideColor(want) : RADAR_COLORS.ink
                ctx.stroke()
            }
        }
        ctx.globalAlpha = 1

        // Trails: the last 1.5 s, fading; batched per side and age band.
        this.drawTrails(scene, o, s)

        // View cones (on the shown floor only).
        // Two nested wedges per player (a soft falloff), batched into one fill per side and band.
        const coneLen = Math.max(34, Math.min(120, 7 * k))
        for (let side = 0; side < 2; side++) {
            const want: Side = side === 0 ? "CT" : "T"
            ctx.fillStyle = sideColor(want)
            for (let band = 0; band < 2; band++) {
                const len = band === 0 ? coneLen : coneLen * 0.55
                let any = false
                ctx.beginPath()
                for (let i = 0; i < scene.playerCount; i++) {
                    const p = scene.players[i]
                    if (!p.alive || p.side !== want || floorAlpha(p.floor) < 1) continue
                    const x = ox + p.x * k, y = oy + p.y * k
                    ctx.moveTo(x, y)
                    ctx.arc(x, y, len, p.aim - CONE_HALF_ANGLE, p.aim + CONE_HALF_ANGLE)
                    ctx.closePath()
                    any = true
                }
                if (!any) continue
                ctx.globalAlpha = band === 0 ? 0.13 : 0.15
                ctx.fill()
            }
        }
        ctx.globalAlpha = 1

        // Shot tracers (killer → victim) and damage-only hits.
        for (let i = 0; i < scene.hitCount; i++) {
            const h = scene.hits[i]
            const a = h.strength * floorAlpha(h.floor) * 0.45
            ctx.globalAlpha = a
            ctx.setLineDash(DASH_ARC)
            ctx.lineWidth = 1.2
            ctx.strokeStyle = sideColor(h.side)
            ctx.beginPath(); ctx.moveTo(ox + h.fx * k, oy + h.fy * k); ctx.lineTo(ox + h.tx * k, oy + h.ty * k); ctx.stroke()
            ctx.setLineDash(NO_DASH)
        }
        for (let i = 0; i < scene.tracerCount; i++) {
            const tr = scene.tracers[i]
            const a = tr.strength * floorAlpha(tr.floor)
            const fx = ox + tr.fx * k, fy = oy + tr.fy * k, tx = ox + tr.tx * k, ty = oy + tr.ty * k
            ctx.globalAlpha = a * 0.55
            ctx.lineWidth = (tr.headshot ? 4 : 3.4) * s
            ctx.strokeStyle = RADAR_COLORS.ink
            ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke()
            ctx.globalAlpha = a
            ctx.lineWidth = (tr.headshot ? 2.2 : 1.6) * s
            ctx.strokeStyle = sideColor(tr.side)
            ctx.stroke()
            ctx.fillStyle = sideColor(tr.side)
            ctx.beginPath(); ctx.arc(tx, ty, (tr.headshot ? 3 : 2.4) * s, 0, TAU); ctx.fill()
            if (tr.age < 0.15) {
                ctx.fillStyle = "#FFFFFF"
                ctx.globalAlpha = a * (1 - tr.age / 0.15)
                ctx.beginPath(); ctx.arc(fx, fy, 3.2 * s, 0, TAU); ctx.fill()
            }
            if (tr.headshot) {
                // Small crosshair on the victim.
                ctx.globalAlpha = a * 0.9
                ctx.lineWidth = 1.2
                ctx.strokeStyle = RADAR_COLORS.ink1
                const c = 6 * s
                ctx.beginPath(); ctx.arc(tx, ty, c * 0.7, 0, TAU)
                ctx.moveTo(tx - c, ty); ctx.lineTo(tx - c * 0.4, ty); ctx.moveTo(tx + c * 0.4, ty); ctx.lineTo(tx + c, ty)
                ctx.moveTo(tx, ty - c); ctx.lineTo(tx, ty - c * 0.4); ctx.moveTo(tx, ty + c * 0.4); ctx.lineTo(tx, ty + c)
                ctx.stroke()
            }
            animating = true
        }
        ctx.globalAlpha = 1

        // The bomb on the ground.
        if (this.drawBomb(scene, o, s, floorAlpha)) animating = true

        // Players.
        if (this.drawPlayers(scene, o, s)) animating = true

        // Flash / HE pops on top of players.
        for (let i = 0; i < scene.utilityCount; i++) {
            const u = scene.utility[i]
            if (u.kind !== "flash" && u.kind !== "he") continue
            const a = u.opacity * floorAlpha(u.floor)
            const x = ox + u.x * k, y = oy + u.y * k
            const r = Math.max(5, (0.8 + u.progress * (u.kind === "he" ? 3.8 : 3.2)) * k)
            ctx.globalAlpha = a
            if (u.kind === "flash") {
                ctx.fillStyle = "rgba(255, 255, 255, 0.5)"
                ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
                ctx.lineWidth = 1.5
                ctx.strokeStyle = "#FFFFFF"
                ctx.stroke()
            } else {
                ctx.fillStyle = "rgba(255, 209, 102, 0.32)"
                ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
                ctx.lineWidth = 2
                ctx.strokeStyle = RADAR_COLORS.fireEdge
                ctx.stroke()
            }
            animating = true
        }
        ctx.globalAlpha = 1

        // Grenades in flight: a short arc from the thrower to where it lands.
        for (let i = 0; i < scene.grenadeCount; i++) {
            const g = scene.grenades[i]
            const a = floorAlpha(g.floor)
            const fx = ox + g.fx * k, fy = oy + g.fy * k, tx = ox + g.tx * k, ty = oy + g.ty * k
            const mx = (fx + tx) / 2, my = (fy + ty) / 2
            const dx = tx - fx, dy = ty - fy
            // Bow the arc toward the top of the screen.
            let nx = dy, ny = -dx
            if (ny > 0) { nx = -nx; ny = -ny }
            const cx = mx + nx * 0.22, cy = my + ny * 0.22
            ctx.globalAlpha = a * 0.45
            ctx.setLineDash(DASH_ARC)
            ctx.lineWidth = 1.2
            ctx.strokeStyle = RADAR_COLORS.ink1
            ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(cx, cy, tx, ty); ctx.stroke()
            ctx.setLineDash(NO_DASH)
            const u = g.k, v = 1 - u
            const gx = v * v * fx + 2 * v * u * cx + u * u * tx
            const gy = v * v * fy + 2 * v * u * cy + u * u * ty
            ctx.globalAlpha = a
            ctx.fillStyle = grenadeColor(g.kind)
            ctx.lineWidth = 1.5
            ctx.strokeStyle = RADAR_COLORS.ink
            ctx.beginPath(); ctx.arc(gx, gy, 3 * s, 0, TAU); ctx.fill(); ctx.stroke()
            animating = true
        }
        ctx.globalAlpha = 1

        // Names on top.
        if (o.showNames) this.drawLabels(scene, o, s)
        return animating
    }

    private drawTrails(scene: RadarScene, o: RadarFrameOptions, s: number): void {
        const ctx = this.ctx
        const { k, ox, oy } = this.tf
        // Three age bands, newest strongest.
        const bands = [0.5, 1, 1.5]
        const alphas = [0.5, 0.3, 0.13]
        ctx.lineWidth = 2.2 * s
        for (let side = 0; side < 2; side++) {
            const want: Side = side === 0 ? "CT" : "T"
            ctx.strokeStyle = sideColor(want)
            for (let b = 0; b < bands.length; b++) {
                const lo = b === 0 ? 0 : bands[b - 1], hi = bands[b]
                let any = false
                ctx.beginPath()
                for (let i = 0; i < scene.playerCount; i++) {
                    const p = scene.players[i]
                    if (!p.alive || p.side !== want || p.trailN < 2) continue
                    if (o.dualLevel && p.floor !== o.level) continue
                    for (let j = 0; j + 1 < p.trailN; j++) {
                        const a0 = p.trailAge[j], a1 = p.trailAge[j + 1]
                        if (a1 < lo || a0 > hi) continue
                        const x0 = p.trail[j * 2], y0 = p.trail[j * 2 + 1], x1 = p.trail[j * 2 + 2], y1 = p.trail[j * 2 + 3]
                        if (x0 === x1 && y0 === y1) continue
                        // Clip the segment to this band (linear in age).
                        const u0 = a0 >= lo ? 0 : (lo - a0) / (a1 - a0)
                        const u1 = a1 <= hi ? 1 : (hi - a0) / (a1 - a0)
                        ctx.moveTo(ox + (x0 + (x1 - x0) * u0) * k, oy + (y0 + (y1 - y0) * u0) * k)
                        ctx.lineTo(ox + (x0 + (x1 - x0) * u1) * k, oy + (y0 + (y1 - y0) * u1) * k)
                        any = true
                    }
                }
                if (!any) continue
                ctx.globalAlpha = alphas[b]
                ctx.stroke()
            }
        }
        ctx.globalAlpha = 1
    }

    /**
     * Living players: the other floor first (faint, smaller), then the shown
     * floor. Rings and bodies are batched into one path per style, so a frame
     * strokes / fills a handful of paths instead of ~50.
     */
    private drawPlayers(scene: RadarScene, o: RadarFrameOptions, s: number): boolean {
        const ctx = this.ctx
        const { k, ox, oy } = this.tf
        let animating = false
        const hp = scene.hpKnown
        for (let pass = 0; pass < (o.dualLevel ? 2 : 1); pass++) {
            // pass 0 = shown floor when single level; with two floors pass 0 = other floor.
            const offPass = o.dualLevel && pass === 0
            const onPass = (p: ScenePlayer) => p.alive && (!o.dualLevel || (p.floor === o.level) !== offPass)
            const r = (offPass ? 5.2 : 6.8) * s
            const ringR = r + 3.4 * s
            ctx.globalAlpha = offPass ? OTHER_FLOOR : 1

            // Dark backing disc: the outline of the body and the HP track in one fill.
            const backR = hp ? ringR + 1.5 * s : r * 1.22 + 1.8 * s
            ctx.beginPath()
            for (let i = 0; i < scene.playerCount; i++) {
                const p = scene.players[i]
                if (!onPass(p)) continue
                const x = ox + p.x * k, y = oy + p.y * k
                ctx.moveTo(x + backR, y); ctx.arc(x, y, backR, 0, TAU)
            }
            ctx.fillStyle = "rgba(7, 9, 12, 0.82)"
            ctx.fill()
            if (hp) {
                // HP arcs: white, red when low.
                for (let low = 0; low < 2; low++) {
                    let any = false
                    ctx.beginPath()
                    for (let i = 0; i < scene.playerCount; i++) {
                        const p = scene.players[i]
                        if (!onPass(p) || !(p.hp > 0) || (p.hp <= 25) !== (low === 1)) continue
                        const x = ox + p.x * k, y = oy + p.y * k
                        ctx.moveTo(x, y - ringR)
                        ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.hp / 100))
                        any = true
                    }
                    if (!any) continue
                    ctx.lineWidth = 1.8 * s
                    ctx.strokeStyle = low ? RADAR_COLORS.bomb : RADAR_COLORS.ink1
                    ctx.stroke()
                }
            }
            // Bodies: CT circle, T diamond (colour-independent side signal).
            for (let side = 0; side < 2; side++) {
                const want: Side = side === 0 ? "CT" : "T"
                let any = false
                ctx.beginPath()
                for (let i = 0; i < scene.playerCount; i++) {
                    const p = scene.players[i]
                    if (!onPass(p) || p.side !== want) continue
                    const x = ox + p.x * k, y = oy + p.y * k
                    if (want === "CT") { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU) }
                    else {
                        const d = r * 1.22
                        ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath()
                    }
                    any = true
                }
                if (!any) continue
                ctx.fillStyle = sideColor(want)
                ctx.fill()
            }
            // Per-player extras (rare): selection, hit flash, badges, plant / defuse progress.
            for (let i = 0; i < scene.playerCount; i++) {
                const p = scene.players[i]
                if (!onPass(p)) continue
                const x = ox + p.x * k, y = oy + p.y * k
                if (!offPass && o.selectedId === p.id) {
                    ctx.lineWidth = 2
                    ctx.strokeStyle = RADAR_COLORS.gold
                    ctx.beginPath(); ctx.arc(x, y, r + 7.5 * s, 0, TAU); ctx.stroke()
                }
                if (hp && p.hitAge < 0.45) {
                    const base = ctx.globalAlpha
                    ctx.globalAlpha = base * (1 - p.hitAge / 0.45)
                    ctx.lineWidth = 2.5 * s
                    ctx.strokeStyle = RADAR_COLORS.bomb
                    ctx.beginPath(); ctx.arc(x, y, ringR + 2 * s, 0, TAU); ctx.stroke()
                    ctx.globalAlpha = base
                    animating = true
                }
                if (p.hasBomb || p.hasKit) {
                    const sp = this.badge(p.hasBomb ? "c4" : "kit", s)
                    const d = this.dpr
                    const bx = x + r * 0.95 + (p.hasBomb ? 2 : 1.5) * s, by = y + r * 0.95 + (p.hasBomb ? 1.5 : 1) * s
                    ctx.setTransform(1, 0, 0, 1, 0, 0)
                    ctx.drawImage(sp.image, Math.round((bx - sp.w / 2) * d), Math.round((by - sp.h / 2) * d))
                    ctx.setTransform(d, 0, 0, d, 0, 0)
                }
                if ((p.planting || p.defusing) && p.progress > 0) {
                    const pr = r + 8 * s
                    ctx.lineWidth = 2.6 * s
                    ctx.strokeStyle = "rgba(7, 9, 12, 0.7)"
                    ctx.beginPath(); ctx.arc(x, y, pr, 0, TAU); ctx.stroke()
                    ctx.strokeStyle = p.defusing ? RADAR_COLORS.ct : RADAR_COLORS.bomb
                    ctx.lineWidth = 2.2 * s
                    ctx.beginPath(); ctx.arc(x, y, pr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, p.progress)); ctx.stroke()
                }
            }
        }
        ctx.globalAlpha = 1
        return animating
    }

    private drawBomb(scene: RadarScene, o: RadarFrameOptions, s: number, floorAlpha: (f: Floor) => number): boolean {
        const b = scene.bomb
        if (b.phase !== "exploded") this.blastSeenMs = -1
        if (!b.hasPos || b.phase === "carried" || b.phase === "none") return false
        const ctx = this.ctx
        const { k, ox, oy } = this.tf
        const x = ox + b.x * k, y = oy + b.y * k
        const a = floorAlpha(b.floor)
        let animating = false
        ctx.globalAlpha = a
        switch (b.phase) {
            case "dropped": {
                if (!o.reducedMotion) {
                    const ph = (o.nowMs % 1600) / 1600
                    ctx.globalAlpha = a * 0.6 * (1 - ph)
                    ctx.lineWidth = 1.5
                    ctx.strokeStyle = RADAR_COLORS.bomb
                    ctx.beginPath(); ctx.arc(x, y, (5 + ph * 9) * s, 0, TAU); ctx.stroke()
                    ctx.globalAlpha = a
                    animating = true
                }
                drawC4(ctx, x, y, 1.1 * s)
                break
            }
            case "planting":
                drawC4(ctx, x, y, 1 * s)
                break
            case "planted":
            case "defusing": {
                if (!o.reducedMotion) {
                    const ph = (o.nowMs % 1000) / 1000
                    ctx.globalAlpha = a * 0.75 * (1 - ph)
                    ctx.lineWidth = 2
                    ctx.strokeStyle = RADAR_COLORS.bomb
                    ctx.beginPath(); ctx.arc(x, y, (7 + ph * 16) * s, 0, TAU); ctx.stroke()
                    ctx.globalAlpha = a
                    animating = true
                }
                // 40 s countdown ring.
                const R = 13 * s
                ctx.lineWidth = 3.2 * s
                ctx.strokeStyle = "rgba(7, 9, 12, 0.75)"
                ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke()
                const left = Number.isFinite(b.remaining) ? Math.max(0, Math.min(1, b.remaining / 40)) : 0
                ctx.lineWidth = 2.4 * s
                ctx.strokeStyle = RADAR_COLORS.bomb
                ctx.beginPath(); ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke()
                ctx.fillStyle = "rgba(255, 84, 104, 0.22)"
                ctx.beginPath(); ctx.arc(x, y, R - 2.5 * s, 0, TAU); ctx.fill()
                drawC4(ctx, x, y, 1.1 * s)
                if (Number.isFinite(b.remaining)) {
                    ctx.font = TIMER_FONT
                    ctx.textAlign = "center"
                    ctx.textBaseline = "middle"
                    const text = String(Math.ceil(b.remaining))
                    const ty = y + R + 9
                    ctx.lineWidth = 3
                    ctx.strokeStyle = RADAR_COLORS.ink
                    ctx.strokeText(text, x, ty)
                    ctx.fillStyle = RADAR_COLORS.bomb
                    ctx.fillText(text, x, ty)
                }
                if (b.phase === "defusing" && b.defuserId) {
                    const p = findPlayer(scene, b.defuserId)
                    if (p && p.alive) {
                        ctx.globalAlpha = a * 0.7
                        ctx.setLineDash(DASH_ARC)
                        ctx.lineWidth = 1.4
                        ctx.strokeStyle = RADAR_COLORS.ct
                        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ox + p.x * k, oy + p.y * k); ctx.stroke()
                        ctx.setLineDash(NO_DASH)
                        ctx.globalAlpha = a
                    }
                    ctx.lineWidth = 2.6 * s
                    ctx.strokeStyle = RADAR_COLORS.ct
                    ctx.beginPath(); ctx.arc(x, y, R + 4.5 * s, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, b.progress)); ctx.stroke()
                }
                break
            }
            case "defused": {
                ctx.globalAlpha = a * 0.5
                drawC4(ctx, x, y, 1 * s)
                ctx.globalAlpha = a
                if (b.since < 3) {
                    ctx.globalAlpha = a * (1 - b.since / 3)
                    ctx.fillStyle = "rgba(61, 214, 140, 0.2)"
                    ctx.lineWidth = 2
                    ctx.strokeStyle = RADAR_COLORS.positive
                    ctx.beginPath(); ctx.arc(x, y, 13 * s, 0, TAU); ctx.fill(); ctx.stroke()
                    ctx.lineWidth = 3 * s
                    ctx.beginPath()
                    ctx.moveTo(x - 6 * s, y + 0.5 * s); ctx.lineTo(x - 1.5 * s, y + 5 * s); ctx.lineTo(x + 7 * s, y - 4.5 * s)
                    ctx.stroke()
                    animating = true
                }
                break
            }
            case "exploded": {
                ctx.fillStyle = "rgba(30, 18, 12, 0.6)"
                ctx.beginPath(); ctx.arc(x, y, Math.max(10 * s, 2.6 * k), 0, TAU); ctx.fill()
                // The blast also runs on the wall clock, so a round that stops
                // right after the explosion does not freeze it mid-way.
                if (this.blastSeenMs < 0) this.blastSeenMs = o.nowMs
                const blast = Math.max(b.since, (o.nowMs - this.blastSeenMs) / 1000)
                if (blast < 1.4 && !o.reducedMotion) {
                    ctx.globalAlpha = a * 0.6 * (1 - blast / 1.4)
                    ctx.fillStyle = RADAR_COLORS.fire
                    ctx.beginPath(); ctx.arc(x, y, (3 + blast * 9) * k, 0, TAU); ctx.fill()
                    animating = true
                }
                ctx.globalAlpha = a * 0.5
                drawC4(ctx, x, y, 0.9 * s)
                break
            }
        }
        ctx.globalAlpha = 1
        return animating
    }

    private drawLabels(scene: RadarScene, o: RadarFrameOptions, s: number): void {
        const ctx = this.ctx
        const { k, ox, oy } = this.tf
        // Relayout a few times a second (or after a jump); in between labels ride with their dots.
        const key = `${o.level}|${scene.playerCount}|${this.width}x${this.height}`
        if (o.nowMs - this.labelLayoutMs > LABEL_RELAYOUT_MS || !(Math.abs(scene.t - this.labelLayoutT) < 0.75) || key !== this.labelLayoutKey) {
            this.labelLayoutMs = o.nowMs
            this.labelLayoutT = scene.t
            this.labelLayoutKey = key
            const dots: RadarPlayerDot[] = []
            for (let i = 0; i < scene.playerCount; i++) {
                const p = scene.players[i]
                if (!p.alive || (o.dualLevel && p.floor !== o.level)) continue
                const sx = ox + p.x * k, sy = oy + p.y * k
                if (sx < -4 || sy < -4 || sx > this.width + 4 || sy > this.height + 4) continue
                dots.push({ playerId: p.id, nickname: p.name, x: ox + p.x * k, y: oy + p.y * k, side: p.side === "CT" ? "ct" : "t", isAlive: true, angle: 0 })
            }
            const widths = new Map<string, number>()
            for (let i = 0; i < scene.playerCount; i++) {
                const p = scene.players[i]
                if (p.alive) widths.set(p.id, this.labelSprite(p, o.selectedId === p.id).w)
            }
            const margin = 4
            const placed = layoutRadarLabels(dots, this.labelOffsets, {
                measure: (_text, id) => widths.get(id) ?? 60,
                height: LABEL_HEIGHT,
                distances: [11 * s, 16 * s, 24 * s, 34 * s, 48 * s, 64 * s],
                bounds: { minX: margin, minY: margin, maxX: this.width - margin, maxY: this.height - margin },
                markerHalf: 9 * s,
                gap: 2,
                maxChars: 0,
                uppercase: false,
            })
            const offsets = new Map<string, { dx: number; dy: number }>()
            for (const d of dots) {
                const label = placed.get(d.playerId)
                if (label) offsets.set(d.playerId, { dx: label.x - d.x, dy: label.y - d.y })
            }
            this.labelOffsets = offsets
            this.labelPlaced = placed
        }
        const d = this.dpr
        for (let i = 0; i < scene.playerCount; i++) {
            const p = scene.players[i]
            if (!p.alive || (o.dualLevel && p.floor !== o.level)) continue
            const off = this.labelOffsets.get(p.id)
            if (!off || !this.labelPlaced.has(p.id)) continue
            const px = ox + p.x * k, py = oy + p.y * k
            // Players outside the zoomed viewport get no plate.
            if (px < -4 || py < -4 || px > this.width + 4 || py > this.height + 4) continue
            const sp = this.labelSprite(p, o.selectedId === p.id)
            const lx = Math.max(2, Math.min(this.width - sp.w - 2, px + off.dx))
            const ly = Math.max(2, Math.min(this.height - sp.h - 2, py + off.dy))
            // Leader line when the plate had to move away from its dot.
            const nx = Math.max(lx, Math.min(px, lx + sp.w)), ny = Math.max(ly, Math.min(py, ly + sp.h))
            if (Math.hypot(nx - px, ny - py) > 16 * s) {
                ctx.setTransform(d, 0, 0, d, 0, 0)
                ctx.globalAlpha = 0.7
                ctx.lineWidth = 1
                ctx.strokeStyle = sideColor(p.side)
                ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke()
                ctx.globalAlpha = 1
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.drawImage(sp.image, Math.round(lx * d), Math.round(ly * d))
        }
        ctx.setTransform(d, 0, 0, d, 0, 0)
    }

    /** Living player under a screen point (CSS px), within `radius`. */
    hitTest(scene: RadarScene | null, sx: number, sy: number, radius = 14, level?: Floor, dualLevel = false): string | null {
        if (!scene) return null
        const { k, ox, oy } = this.tf
        let best: string | null = null
        let bestD = radius
        for (let i = 0; i < scene.playerCount; i++) {
            const p = scene.players[i]
            if (!p.alive || (dualLevel && level && p.floor !== level)) continue
            const d = Math.hypot(ox + p.x * k - sx, oy + p.y * k - sy)
            if (d < bestD) { bestD = d; best = p.id }
        }
        return best
    }
}

/**
 * Opaque area of a radar image in radar % (downsampled alpha scan, once per
 * image). Null when it cannot be read (tainted canvas, no 2D context).
 */
export function imageContentBounds(image: HTMLImageElement): RadarBounds | null {
    try {
        const N = 200
        const c = makeCanvas(N, N)
        const ctx = c.getContext("2d", { willReadFrequently: true })
        if (!ctx) return null
        ctx.drawImage(image, 0, 0, N, N)
        const data = ctx.getImageData(0, 0, N, N).data
        let minX = N, minY = N, maxX = -1, maxY = -1
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (data[(y * N + x) * 4 + 3] < 24) continue
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
        if (maxX < 0) return null
        const pct = 100 / N
        return { minX: minX * pct, minY: minY * pct, maxX: (maxX + 1) * pct, maxY: (maxY + 1) * pct }
    } catch {
        return null
    }
}

function findPlayer(scene: RadarScene, id: string): ScenePlayer | undefined {
    for (let i = 0; i < scene.playerCount; i++) if (scene.players[i].id === id) return scene.players[i]
    return undefined
}

function grenadeColor(kind: UtilityKind): string {
    return kind === "smoke" ? "#D9DDE3" : kind === "molotov" ? RADAR_COLORS.fire : kind === "flash" ? "#FFFFFF" : "#B5E06A"
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
}

/** C4 glyph centred on (x, y): red block with a dark band. */
function drawC4(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    const w = 11 * scale, h = 7.5 * scale
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 1.6 * scale)
    ctx.fillStyle = RADAR_COLORS.bomb
    ctx.fill()
    ctx.lineWidth = 1.3
    ctx.strokeStyle = RADAR_COLORS.ink
    ctx.stroke()
    ctx.fillStyle = "rgba(7, 9, 12, 0.75)"
    ctx.fillRect(x - w / 2 + 2 * scale, y - 0.6 * scale, w - 4 * scale, 1.2 * scale)
}

/** Defuse kit badge: small light block with a handle. */
function drawKit(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
    const w = 8 * scale, h = 6 * scale
    roundRect(ctx, x - w / 2, y - h / 2, w, h, 1.4 * scale)
    ctx.fillStyle = RADAR_COLORS.ink1
    ctx.fill()
    ctx.lineWidth = 1.2
    ctx.strokeStyle = RADAR_COLORS.ink
    ctx.stroke()
    ctx.fillStyle = RADAR_COLORS.ct
    ctx.fillRect(x - 0.8 * scale, y - h / 2 + 1.2 * scale, 1.6 * scale, h - 2.4 * scale)
}
