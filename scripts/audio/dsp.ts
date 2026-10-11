/**
 * DSP building blocks for the project-made audio pack (see render-audio-pack.ts).
 * Deterministic by construction: all randomness comes from seeded generators,
 * never Math.random, so a render is byte-identical across runs.
 */

export const SR = 48000
export const TAU = Math.PI * 2

export interface Stereo { l: Float32Array; r: Float32Array }

export const createStereo = (samples: number): Stereo => ({ l: new Float32Array(Math.max(1, samples)), r: new Float32Array(Math.max(1, samples)) })
export const sec = (seconds: number) => Math.max(0, Math.round(seconds * SR))
export const dbToGain = (db: number) => Math.pow(10, db / 20)
export const gainToDb = (gain: number) => 20 * Math.log10(Math.max(1e-12, gain))
export const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
export const clamp = (x: number, lo: number, hi: number) => x < lo ? lo : x > hi ? hi : x

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** 'F#4' → 66, 'Bb2' → 46 (C4 = 60). */
export function midi(name: string): number {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name)
    if (!m) throw new Error(`Bad note name ${name}`)
    return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
}
export const notes = (names: string) => names.trim().split(/\s+/).map(midi)

// ── Randomness ──────────────────────────────────────────────────────────────

export function seedOf(text: string): number {
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    return h >>> 0
}

/** mulberry32 */
export class Rng {
    private state: number
    constructor(seed: number | string) { this.state = (typeof seed === 'string' ? seedOf(seed) : seed) >>> 0 }
    next(): number {
        let t = (this.state = (this.state + 0x6d2b79f5) >>> 0)
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    bi(): number { return this.next() * 2 - 1 }
    range(min: number, max: number): number { return min + (max - min) * this.next() }
    /** Independent child stream keyed by a label (order-independent of later draws). */
    child(label: string | number): Rng { return new Rng((this.state ^ seedOf(String(label))) >>> 0) }
}

/** Paul Kellet's refined pink noise. */
export class Pink {
    private b0 = 0; private b1 = 0; private b2 = 0; private b3 = 0; private b4 = 0; private b5 = 0; private b6 = 0
    constructor(private rng: Rng) {}
    next(): number {
        const w = this.rng.bi()
        this.b0 = 0.99886 * this.b0 + w * 0.0555179
        this.b1 = 0.99332 * this.b1 + w * 0.0750759
        this.b2 = 0.969 * this.b2 + w * 0.153852
        this.b3 = 0.8665 * this.b3 + w * 0.3104856
        this.b4 = 0.55 * this.b4 + w * 0.5329522
        this.b5 = -0.7616 * this.b5 - w * 0.016898
        const out = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + w * 0.5362
        this.b6 = w * 0.115926
        return out * 0.11
    }
}

// ── Oscillators ─────────────────────────────────────────────────────────────

function polyBlep(t: number, dt: number): number {
    if (t < dt) { t /= dt; return t + t - t * t - 1 }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1 }
    return 0
}

export type Shape = 'sine' | 'saw' | 'square' | 'tri'

/** Band-limited (PolyBLEP) oscillator; frequency may change every sample. */
export class Osc {
    constructor(public shape: Shape, public phase = 0, public pulseWidth = 0.5) {}
    next(freq: number): number {
        const dt = Math.min(0.49, Math.abs(freq) / SR)
        const p = this.phase
        let y: number
        switch (this.shape) {
            case 'sine': y = Math.sin(TAU * p); break
            case 'saw': y = 2 * p - 1 - polyBlep(p, dt); break
            case 'square': {
                const pw = this.pulseWidth
                y = (p < pw ? 1 : -1) + polyBlep(p, dt) - polyBlep((p + 1 - pw) % 1, dt)
                break
            }
            default: y = 1 - 4 * Math.abs(p - 0.5)
        }
        this.phase = p + dt >= 1 ? p + dt - 1 : p + dt
        return y
    }
}

// ── Filters ─────────────────────────────────────────────────────────────────

/** Topology-preserving state-variable filter (Cytomic/Zavalishin). */
export class SVF {
    private ic1 = 0; private ic2 = 0
    private a1 = 0; private a2 = 0; private a3 = 0; private k = 1
    lp = 0; bp = 0; hp = 0
    constructor(cutoff = 1000, q = 0.707) { this.set(cutoff, q) }
    set(cutoff: number, q: number): this {
        const g = Math.tan(Math.PI * clamp(cutoff, 10, SR * 0.47) / SR)
        this.k = 1 / Math.max(0.05, q)
        this.a1 = 1 / (1 + g * (g + this.k))
        this.a2 = g * this.a1
        this.a3 = g * this.a2
        return this
    }
    tick(x: number): number {
        const v3 = x - this.ic2
        const v1 = this.a1 * this.ic1 + this.a2 * v3
        const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3
        this.ic1 = 2 * v1 - this.ic1
        this.ic2 = 2 * v2 - this.ic2
        this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2
        return v2
    }
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'lowshelf' | 'highshelf'

/** RBJ cookbook biquad (transposed direct form II). */
export class Biquad {
    private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0
    private z1 = 0; private z2 = 0
    constructor(kind: BiquadKind, freq: number, q = 0.707, gainDb = 0) { this.set(kind, freq, q, gainDb) }
    set(kind: BiquadKind, freq: number, q = 0.707, gainDb = 0): this {
        const w = TAU * clamp(freq, 5, SR * 0.49) / SR
        const cos = Math.cos(w), sin = Math.sin(w)
        const alpha = sin / (2 * q)
        const A = Math.pow(10, gainDb / 40)
        let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
        switch (kind) {
            case 'lowpass': b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break
            case 'highpass': b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break
            case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break
            case 'peak': b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break
            case 'lowshelf': {
                const s = 2 * Math.sqrt(A) * alpha
                b0 = A * ((A + 1) - (A - 1) * cos + s); b1 = 2 * A * ((A - 1) - (A + 1) * cos); b2 = A * ((A + 1) - (A - 1) * cos - s)
                a0 = (A + 1) + (A - 1) * cos + s; a1 = -2 * ((A - 1) + (A + 1) * cos); a2 = (A + 1) + (A - 1) * cos - s
                break
            }
            default: {
                const s = 2 * Math.sqrt(A) * alpha
                b0 = A * ((A + 1) + (A - 1) * cos + s); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - s)
                a0 = (A + 1) - (A - 1) * cos + s; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - s
            }
        }
        this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0
        return this
    }
    tick(x: number): number {
        const y = this.b0 * x + this.z1
        this.z1 = this.b1 * x - this.a1 * y + this.z2
        this.z2 = this.b2 * x - this.a2 * y
        return y
    }
}

export class OnePole {
    private y = 0
    private a: number
    constructor(cutoff: number) { this.a = 1 - Math.exp(-TAU * cutoff / SR) }
    lp(x: number): number { this.y += this.a * (x - this.y); return this.y }
    hp(x: number): number { this.y += this.a * (x - this.y); return x - this.y }
}

/** Apply a chain of fresh biquads (one per channel) in place. */
export function eq(buf: Stereo, bands: { kind: BiquadKind; freq: number; q?: number; gain?: number }[]): Stereo {
    for (const band of bands) {
        const fl = new Biquad(band.kind, band.freq, band.q ?? 0.707, band.gain ?? 0)
        const fr = new Biquad(band.kind, band.freq, band.q ?? 0.707, band.gain ?? 0)
        for (let i = 0; i < buf.l.length; i++) { buf.l[i] = fl.tick(buf.l[i]); buf.r[i] = fr.tick(buf.r[i]) }
    }
    return buf
}

// ── Envelopes ───────────────────────────────────────────────────────────────

/** Level of an attack/decay/sustain envelope at time t (no release). */
export function ads(t: number, a: number, d: number, s: number): number {
    if (t < 0) return 0
    if (t < a) { const x = t / a; return x * (2 - x) }
    return s + (1 - s) * Math.exp(-4.6 * (t - a) / Math.max(1e-4, d))
}

/** ADSR with gate length `hold`; exponential release from the level at gate-off. */
export function adsr(t: number, hold: number, a: number, d: number, s: number, r: number): number {
    if (t < 0) return 0
    if (t <= hold) return ads(t, a, d, s)
    return ads(hold, a, d, s) * Math.exp(-4.6 * (t - hold) / Math.max(1e-4, r))
}

// ── Mixing helpers ──────────────────────────────────────────────────────────

/** Constant-power pan gains for p in [-1, 1]. */
export function panGains(p: number): [number, number] {
    const a = (clamp(p, -1, 1) + 1) * Math.PI / 4
    return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2]
}

export function mixInto(target: Stereo, source: Stereo, offset = 0, gain = 1, pan = 0): Stereo {
    const [gl, gr] = panGains(pan)
    const n = Math.min(source.l.length, target.l.length - offset)
    for (let i = Math.max(0, -offset); i < n; i++) {
        target.l[offset + i] += source.l[i] * gain * gl
        target.r[offset + i] += source.r[i] * gain * gr
    }
    return target
}

export function scale(buf: Stereo, gain: number): Stereo {
    for (let i = 0; i < buf.l.length; i++) { buf.l[i] *= gain; buf.r[i] *= gain }
    return buf
}

export function peak(buf: Stereo): number {
    let p = 0
    for (let i = 0; i < buf.l.length; i++) { const a = Math.abs(buf.l[i]), b = Math.abs(buf.r[i]); if (a > p) p = a; if (b > p) p = b }
    return p
}

export function rmsDb(buf: Stereo): number {
    let sum = 0
    for (let i = 0; i < buf.l.length; i++) sum += buf.l[i] * buf.l[i] + buf.r[i] * buf.r[i]
    return gainToDb(Math.sqrt(sum / (2 * buf.l.length)))
}

export function slice(buf: Stereo, start: number, end: number): Stereo {
    return { l: buf.l.slice(start, end), r: buf.r.slice(start, end) }
}

export function concat(...parts: Stereo[]): Stereo {
    const total = parts.reduce((n, p) => n + p.l.length, 0)
    const out = createStereo(total)
    let o = 0
    for (const p of parts) { out.l.set(p.l, o); out.r.set(p.r, o); o += p.l.length }
    return out
}

/** Fold a buffer longer than `period` back onto [0, period): the periodic steady state of a looped render. */
export function fold(buf: Stereo, period: number): Stereo {
    const out = createStereo(period)
    for (let i = 0; i < buf.l.length; i++) { const j = i % period; out.l[j] += buf.l[i]; out.r[j] += buf.r[i] }
    return out
}

export function saturate(buf: Stereo, drive: number, mix = 1): Stereo {
    const norm = 1 / Math.tanh(drive)
    for (let i = 0; i < buf.l.length; i++) {
        buf.l[i] = buf.l[i] * (1 - mix) + Math.tanh(buf.l[i] * drive) * norm * mix
        buf.r[i] = buf.r[i] * (1 - mix) + Math.tanh(buf.r[i] * drive) * norm * mix
    }
    return buf
}

/** Mid/side width: 0 = mono, 1 = unchanged, >1 wider. */
export function width(buf: Stereo, amount: number): Stereo {
    for (let i = 0; i < buf.l.length; i++) {
        const m = (buf.l[i] + buf.r[i]) * 0.5, s = (buf.l[i] - buf.r[i]) * 0.5 * amount
        buf.l[i] = m + s; buf.r[i] = m - s
    }
    return buf
}

export function fadeEdges(buf: Stereo, fadeIn: number, fadeOut: number): Stereo {
    const n = buf.l.length
    for (let i = 0; i < Math.min(fadeIn, n); i++) { const g = i / fadeIn; buf.l[i] *= g; buf.r[i] *= g }
    for (let i = 0; i < Math.min(fadeOut, n); i++) { const g = i / fadeOut; buf.l[n - 1 - i] *= g; buf.r[n - 1 - i] *= g }
    return buf
}

/** Drop the inaudible tail (below `floorDb` relative to full scale) but keep `padSec`. */
export function trimTail(buf: Stereo, floorDb = -75, padSec = 0.03): Stereo {
    const floor = dbToGain(floorDb)
    let last = buf.l.length - 1
    while (last > 0 && Math.abs(buf.l[last]) < floor && Math.abs(buf.r[last]) < floor) last--
    return slice(buf, 0, Math.min(buf.l.length, last + 1 + sec(padSec)))
}

// ── Effects ─────────────────────────────────────────────────────────────────

class Comb {
    private buf: Float32Array; private idx = 0; private store = 0
    constructor(size: number) { this.buf = new Float32Array(size) }
    tick(x: number, feedback: number, damp: number): number {
        const out = this.buf[this.idx]
        this.store = out * (1 - damp) + this.store * damp
        this.buf[this.idx] = x + this.store * feedback
        if (++this.idx >= this.buf.length) this.idx = 0
        return out
    }
}
class Allpass {
    private buf: Float32Array; private idx = 0
    constructor(size: number) { this.buf = new Float32Array(size) }
    tick(x: number): number {
        const b = this.buf[this.idx]
        this.buf[this.idx] = x + b * 0.5
        if (++this.idx >= this.buf.length) this.idx = 0
        return b - x
    }
}

export interface ReverbOptions { room?: number; damp?: number; width?: number; preDelay?: number; lowCut?: number; highCut?: number }

/** Freeverb (Schroeder/Moorer) with pre-delay and wet filtering. Returns the wet signal only. */
export function reverb(input: Stereo, opts: ReverbOptions = {}): Stereo {
    const room = opts.room ?? 0.8, damp = (opts.damp ?? 0.4) * 0.4, w = opts.width ?? 1
    const feedback = room * 0.28 + 0.7
    const scaleT = SR / 44100
    const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
    const apT = [556, 441, 341, 225]
    const combsL = combT.map(t => new Comb(Math.round(t * scaleT)))
    const combsR = combT.map(t => new Comb(Math.round((t + 23) * scaleT)))
    const apsL = apT.map(t => new Allpass(Math.round(t * scaleT)))
    const apsR = apT.map(t => new Allpass(Math.round((t + 23) * scaleT)))
    const pre = Math.max(1, sec(opts.preDelay ?? 0.02))
    const preL = new Float32Array(pre), preR = new Float32Array(pre)
    const inHp = new OnePole(opts.lowCut ?? 180), inHpR = new OnePole(opts.lowCut ?? 180)
    const outL = new Biquad('lowpass', opts.highCut ?? 9000, 0.6), outR = new Biquad('lowpass', opts.highCut ?? 9000, 0.6)
    const wet1 = w / 2 + 0.5, wet2 = (1 - w) / 2
    const n = input.l.length
    const out = createStereo(n)
    let pi = 0
    for (let i = 0; i < n; i++) {
        const dl = preL[pi], dr = preR[pi]
        preL[pi] = inHp.hp(input.l[i]); preR[pi] = inHpR.hp(input.r[i])
        if (++pi >= pre) pi = 0
        const x = (dl + dr) * 0.015
        let l = 0, r = 0
        for (let c = 0; c < 8; c++) { l += combsL[c].tick(x, feedback, damp); r += combsR[c].tick(x, feedback, damp) }
        for (let a = 0; a < 4; a++) { l = apsL[a].tick(l); r = apsR[a].tick(r) }
        out.l[i] = outL.tick(l * wet1 + r * wet2) * 3
        out.r[i] = outR.tick(r * wet1 + l * wet2) * 3
    }
    return out
}

/** Stereo ping-pong delay with a damped feedback path. Returns wet only. */
export function pingPong(input: Stereo, time: number, feedback = 0.35, highCut = 4500, lowCut = 250): Stereo {
    const size = Math.max(1, sec(time))
    const bl = new Float32Array(size), br = new Float32Array(size)
    const lpL = new OnePole(highCut), lpR = new OnePole(highCut)
    const hpL = new OnePole(lowCut), hpR = new OnePole(lowCut)
    const out = createStereo(input.l.length)
    let idx = 0
    for (let i = 0; i < input.l.length; i++) {
        const dl = bl[idx], dr = br[idx]
        const mono = (input.l[i] + input.r[i]) * 0.5
        bl[idx] = hpL.hp(lpL.lp(mono + dr * feedback))
        br[idx] = hpR.hp(lpR.lp(dl * feedback))
        if (++idx >= size) idx = 0
        out.l[i] = dl; out.r[i] = dr
    }
    return out
}

/**
 * Stereo chorus. `period` (samples) rounds the LFO so it repeats exactly
 * within a loop, keeping looped renders seamless.
 */
export function chorus(input: Stereo, rate = 0.6, depthMs = 2.5, baseMs = 11, mix = 0.5, period = 0): Stereo {
    const maxD = sec((baseMs + depthMs) / 1000) + 4
    const size = maxD + 2
    const bl = new Float32Array(size), br = new Float32Array(size)
    let f = rate
    if (period > 0) f = Math.max(1, Math.round(rate * period / SR)) * SR / period
    const out = createStereo(input.l.length)
    let w = 0
    for (let i = 0; i < input.l.length; i++) {
        bl[w] = input.l[i]; br[w] = input.r[i]
        const ph = TAU * f * i / SR
        const dL = (baseMs + depthMs * (0.5 + 0.5 * Math.sin(ph))) * SR / 1000
        const dR = (baseMs + depthMs * (0.5 + 0.5 * Math.sin(ph + Math.PI / 2))) * SR / 1000
        const readL = (w - dL + size) % size, readR = (w - dR + size) % size
        const iL = Math.floor(readL), fL = readL - iL, iR = Math.floor(readR), fR = readR - iR
        const wl = bl[iL] * (1 - fL) + bl[(iL + 1) % size] * fL
        const wr = br[iR] * (1 - fR) + br[(iR + 1) % size] * fR
        out.l[i] = input.l[i] * (1 - mix) + wl * mix
        out.r[i] = input.r[i] * (1 - mix) + wr * mix
        if (++w >= size) w = 0
    }
    return out
}

export interface CompressorOptions { threshold: number; ratio: number; attack: number; release: number; makeup?: number; knee?: number }

/** Feed-forward, stereo-linked compressor (in place). */
export function compress(buf: Stereo, o: CompressorOptions): Stereo {
    const att = Math.exp(-1 / (o.attack * SR)), rel = Math.exp(-1 / (o.release * SR))
    const knee = o.knee ?? 6, makeup = dbToGain(o.makeup ?? 0)
    let env = 0
    for (let i = 0; i < buf.l.length; i++) {
        const x = Math.max(Math.abs(buf.l[i]), Math.abs(buf.r[i]))
        env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x
        const level = gainToDb(env)
        const over = level - o.threshold
        let reduction = 0
        if (over > knee / 2) reduction = over * (1 - 1 / o.ratio)
        else if (over > -knee / 2) reduction = (1 - 1 / o.ratio) * (over + knee / 2) ** 2 / (2 * knee)
        const g = dbToGain(-reduction) * makeup
        buf.l[i] *= g; buf.r[i] *= g
    }
    return buf
}

/**
 * Offline look-ahead brickwall limiter: the gain curve is the windowed minimum
 * of the required gain, smoothed forward (release) and backward (attack), so
 * the output never exceeds the ceiling and never clicks.
 */
export function limit(buf: Stereo, ceilingDb = -1, lookahead = 0.004, release = 0.12): Stereo {
    const n = buf.l.length
    const ceil = dbToGain(ceilingDb)
    const req = new Float32Array(n)
    for (let i = 0; i < n; i++) {
        const a = Math.max(Math.abs(buf.l[i]), Math.abs(buf.r[i]))
        req[i] = a > ceil ? ceil / a : 1
    }
    const la = Math.max(1, sec(lookahead))
    // windowed minimum over [i - la, i + la] (monotonic deque)
    const env = new Float32Array(n)
    const dq = new Int32Array(n + 2 * la + 1)
    let head = 0, tail = 0
    for (let i = 0; i < n + la; i++) {
        if (i < n) {
            while (tail > head && req[dq[tail - 1]] >= req[i]) tail--
            dq[tail++] = i
        }
        const center = i - la
        if (center >= 0) {
            while (dq[head] < center - la) head++
            env[center] = req[dq[head]]
        }
    }
    const relC = 1 - Math.exp(-1 / (release * SR))
    let g = 1
    for (let i = 0; i < n; i++) { g = Math.min(env[i], g + (1 - g) * relC); env[i] = g }
    const attC = 1 - Math.exp(-1 / (lookahead * SR / 2))
    g = 1
    for (let i = n - 1; i >= 0; i--) { g = Math.min(env[i], g + (1 - g) * attC); env[i] = g }
    for (let i = 0; i < n; i++) {
        buf.l[i] = clamp(buf.l[i] * env[i], -ceil, ceil)
        buf.r[i] = clamp(buf.r[i] * env[i], -ceil, ceil)
    }
    return buf
}

/** Run a stateful master process on a loop as if it were repeating forever. */
export function processLooped(loop: Stereo, fn: (b: Stereo) => Stereo): Stereo {
    const n = loop.l.length
    const out = fn(concat(loop, loop, loop))
    return slice(out, n, 2 * n)
}

// ── Analysis ────────────────────────────────────────────────────────────────

function kWeight(x: Float32Array): Float64Array {
    // ITU-R BS.1770-4 pre-filter + RLB high-pass at 48 kHz
    const out = new Float64Array(x.length)
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0
    for (let i = 0; i < x.length; i++) {
        const xi = x[i]
        const y = 1.53512485958697 * xi - 2.69169618940638 * x1 + 1.19839281085285 * x2 + 1.69065929318241 * y1 - 0.73248077421585 * y2
        x2 = x1; x1 = xi; y2 = y1; y1 = y
        const v = y - 2 * u1 + u2 + 1.99004745483398 * v1 - 0.99007225036621 * v2
        u2 = u1; u1 = y; v2 = v1; v1 = v
        out[i] = v
    }
    return out
}

export interface Loudness { integrated: number; maxMomentary: number; maxShortTerm: number }

/** BS.1770 loudness (LUFS). Short sounds are zero-padded to one 400 ms block. */
export function loudness(buf: Stereo): Loudness {
    const block = sec(0.4), hop = sec(0.1), st = sec(3)
    const n = Math.max(buf.l.length, block)
    const kl = kWeight(buf.l), kr = kWeight(buf.r)
    const prefix = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) {
        const a = i < kl.length ? kl[i] : 0, b = i < kr.length ? kr[i] : 0
        prefix[i + 1] = prefix[i] + a * a + b * b
    }
    const lufs = (z: number) => -0.691 + 10 * Math.log10(Math.max(1e-20, z))
    const blocks: number[] = []
    let maxM = -Infinity
    for (let s = 0; s + block <= n; s += hop) {
        const z = (prefix[s + block] - prefix[s]) / block
        blocks.push(z)
        maxM = Math.max(maxM, lufs(z))
    }
    let maxS = -Infinity
    for (let s = 0; s + Math.min(st, n) <= n; s += hop) {
        const len = Math.min(st, n)
        maxS = Math.max(maxS, lufs((prefix[s + len] - prefix[s]) / len))
    }
    const abs = blocks.filter(z => lufs(z) > -70)
    if (!abs.length) return { integrated: -Infinity, maxMomentary: maxM, maxShortTerm: maxS }
    const relGate = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10
    const gated = abs.filter(z => lufs(z) > relGate)
    return { integrated: lufs(gated.reduce((a, b) => a + b, 0) / gated.length), maxMomentary: maxM, maxShortTerm: maxS }
}

/** 4× oversampled peak estimate (dBTP) with a windowed-sinc interpolator. */
export function truePeakDb(buf: Stereo): number {
    const taps = 12
    const kernels: Float64Array[] = []
    for (let p = 1; p < 4; p++) {
        const frac = p / 4
        const k = new Float64Array(2 * taps)
        for (let j = -taps + 1; j <= taps; j++) {
            const x = j - frac
            const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
            const win = 0.5 + 0.5 * Math.cos(Math.PI * x / taps)
            k[j + taps - 1] = sinc * win
        }
        kernels.push(k)
    }
    let best = peak(buf)
    for (const ch of [buf.l, buf.r]) {
        for (let i = taps; i < ch.length - taps; i++) {
            // cheap skip: only interpolate near loud samples
            if (Math.abs(ch[i]) < best * 0.7 && Math.abs(ch[i + 1]) < best * 0.7) continue
            for (const k of kernels) {
                let y = 0
                for (let j = -taps + 1; j <= taps; j++) y += ch[i + j] * k[j + taps - 1]
                if (Math.abs(y) > best) best = Math.abs(y)
            }
        }
    }
    return gainToDb(best)
}
