/**
 * Synth voices and drums for the project-made audio pack. Every voice writes
 * additively into a stereo buffer; tails run past the gate and are clipped
 * only at the buffer end.
 */
import { SR, TAU, Osc, SVF, Biquad, OnePole, Rng, Pink, ads, adsr, panGains, sec, type Stereo, type Shape } from './dsp'

export interface NoteEvent {
    /** start sample in the target buffer */
    start: number
    /** gate length in samples */
    length: number
    freq: number
    vel: number
    pan?: number
    rng: Rng
}

export type Instrument = (out: Stereo, e: NoteEvent) => void

function write(out: Stereo, i: number, l: number, r: number) {
    if (i >= 0 && i < out.l.length) { out.l[i] += l; out.r[i] += r }
}

// ── Tonal voices ────────────────────────────────────────────────────────────

export interface SupersawOptions {
    voices?: number; detune?: number; spread?: number
    cutoff: number; cutoffEnv?: number; filterAttack?: number; filterDecay?: number; q?: number
    a: number; d: number; s: number; r: number
    gain?: number; shape?: Shape
}

/** Detuned saw stack through a resonant low-pass: pads, strings, chords. */
export function supersaw(o: SupersawOptions): Instrument {
    return (out, e) => {
        const V = o.voices ?? 7
        const oscs: Osc[] = [], ratios: number[] = [], gl: number[] = [], gr: number[] = []
        for (let v = 0; v < V; v++) {
            const pos = V === 1 ? 0 : (v / (V - 1)) * 2 - 1
            const cents = Math.sign(pos) * Math.pow(Math.abs(pos), 1.4) * (o.detune ?? 16)
            ratios.push(Math.pow(2, cents / 1200))
            oscs.push(new Osc(o.shape ?? 'saw', e.rng.next()))
            const [l, r] = panGains(pos * (o.spread ?? 0.8) + (e.pan ?? 0))
            gl.push(l); gr.push(r)
        }
        const fl = new SVF(), fr = new SVF()
        const norm = (o.gain ?? 1) * e.vel / Math.sqrt(V)
        const hold = e.length / SR
        const total = e.length + sec(o.r * 1.3)
        const keyTrack = Math.pow(e.freq / 261.6, 0.35)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            if ((i & 31) === 0) {
                const env = o.cutoffEnv ? ads(t, o.filterAttack ?? 0.01, o.filterDecay ?? 0.6, 0.25) : 0
                const c = o.cutoff * keyTrack * (1 + (o.cutoffEnv ?? 0) * env)
                fl.set(c, o.q ?? 0.8); fr.set(c, o.q ?? 0.8)
            }
            let l = 0, r = 0
            for (let v = 0; v < V; v++) { const y = oscs[v].next(e.freq * ratios[v]); l += y * gl[v]; r += y * gr[v] }
            const amp = adsr(t, hold, o.a, o.d, o.s, o.r) * norm
            write(out, e.start + i, fl.tick(l) * amp, fr.tick(r) * amp)
        }
    }
}

export interface PluckOptions { cutoff: number; envAmt: number; decay: number; ampDecay: number; q?: number; detune?: number; shape?: Shape; gain?: number; release?: number; sub?: number }

/** Filter-enveloped pluck for arps and stabs. */
export function pluck(o: PluckOptions): Instrument {
    return (out, e) => {
        const det = Math.pow(2, (o.detune ?? 7) / 1200)
        const a = new Osc(o.shape ?? 'saw', e.rng.next()), b = new Osc(o.shape ?? 'saw', e.rng.next()), sub = new Osc('sine', 0)
        const fl = new SVF(), fr = new SVF()
        const [pl, pr] = panGains(e.pan ?? 0)
        const hold = e.length / SR
        const rel = o.release ?? 0.08
        const total = Math.min(sec(o.ampDecay * 6), e.length + sec(rel * 2))
        for (let i = 0; i < total; i++) {
            const t = i / SR
            if ((i & 15) === 0) {
                const c = o.cutoff + o.envAmt * Math.exp(-t / o.decay)
                fl.set(c, o.q ?? 1.1); fr.set(c * 1.04, o.q ?? 1.1)
            }
            const ya = a.next(e.freq / det), yb = b.next(e.freq * det), ys = sub.next(e.freq / 2) * (o.sub ?? 0)
            let amp = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t / o.ampDecay)
            if (t > hold) amp *= Math.exp(-(t - hold) / rel)
            amp *= e.vel * (o.gain ?? 1) * 0.6
            write(out, e.start + i, fl.tick(ya * 0.8 + yb * 0.2 + ys) * amp * pl, fr.tick(yb * 0.8 + ya * 0.2 + ys) * amp * pr)
        }
    }
}

export interface EpianoOptions { gain?: number; bright?: number; decay?: number; tine?: number }

/** Two-operator FM electric piano with a short tine transient. */
export function epiano(o: EpianoOptions = {}): Instrument {
    return (out, e) => {
        const f = e.freq
        const decayTau = (o.decay ?? 2.4) * Math.pow(220 / f, 0.35)
        const hold = e.length / SR
        const total = e.length + sec(0.7)
        const [pl, pr] = panGains(e.pan ?? 0)
        const bright = (o.bright ?? 1) * (0.55 + 0.45 * e.vel)
        let pc = e.rng.next(), pc2 = e.rng.next(), pm = 0, pt = 0
        const g = (o.gain ?? 1) * e.vel * 0.5
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const index = bright * (1.5 * Math.exp(-t / 0.22) + 0.32)
            const tine = (o.tine ?? 1) * bright * 0.8 * Math.exp(-t / 0.018)
            const m = Math.sin(TAU * pm), tn = Math.sin(TAU * pt)
            const y1 = Math.sin(TAU * pc + index * m + tine * tn)
            const y2 = Math.sin(TAU * pc2 + index * 0.85 * m)
            let env = (t < 0.0025 ? t / 0.0025 : 1) * Math.exp(-Math.min(t, hold) / decayTau)
            if (t > hold) env *= Math.exp(-(t - hold) / 0.16)
            const s = env * g
            write(out, e.start + i, (y1 * 0.62 + y2 * 0.38) * s * pl, (y1 * 0.38 + y2 * 0.62) * s * pr)
            pc += f / SR; pc2 += f * 1.0026 / SR; pm += f / SR; pt += 13.95 * f / SR
            if (pc > 1) pc -= 1; if (pc2 > 1) pc2 -= 1; if (pm > 1) pm -= 1; if (pt > 1) pt -= 1
        }
    }
}

export interface BassOptions { cutoff: number; envAmt?: number; decay?: number; q?: number; drive?: number; sub?: number; saw?: number; square?: number; release?: number; attack?: number; gain?: number }

/** Sub + saw bass with filter envelope and soft drive. Mono, centred. */
export function bass(o: BassOptions): Instrument {
    return (out, e) => {
        const sub = new Osc('sine', 0), saw = new Osc('saw', e.rng.next()), sq = new Osc('square', e.rng.next())
        const f = new SVF()
        const hold = e.length / SR
        const rel = o.release ?? 0.06
        const total = e.length + sec(rel * 5)
        const drive = o.drive ?? 1.5
        const norm = 1 / Math.tanh(drive)
        const att = o.attack ?? 0.004
        for (let i = 0; i < total; i++) {
            const t = i / SR
            if ((i & 15) === 0) f.set(o.cutoff + (o.envAmt ?? 0) * Math.exp(-t / (o.decay ?? 0.12)), o.q ?? 0.9)
            const x = sub.next(e.freq) * (o.sub ?? 0.8) + f.tick(saw.next(e.freq) * (o.saw ?? 0.6) + sq.next(e.freq) * (o.square ?? 0))
            let amp = t < att ? t / att : 1
            if (t > hold) amp *= Math.exp(-(t - hold) / rel)
            const y = Math.tanh(x * drive) * norm * amp * e.vel * (o.gain ?? 1) * 0.55
            write(out, e.start + i, y, y)
        }
    }
}

export interface LeadOptions { cutoff: number; envAmt?: number; q?: number; detune?: number; vibrato?: number; vibRate?: number; a: number; d: number; s: number; r: number; gain?: number; octave?: number; glide?: number }

/** Warm detuned lead with delayed vibrato. */
export function lead(o: LeadOptions): Instrument {
    return (out, e) => {
        const det = Math.pow(2, (o.detune ?? 9) / 1200)
        const a = new Osc('saw', e.rng.next()), b = new Osc('saw', e.rng.next()), c = new Osc('square', e.rng.next())
        const fl = new SVF(), fr = new SVF()
        const hold = e.length / SR
        const total = e.length + sec(o.r * 1.3)
        const [pl, pr] = panGains(e.pan ?? 0)
        let vibPhase = 0
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const vibAmt = (o.vibrato ?? 12) * Math.min(1, Math.max(0, (t - 0.18) / 0.35))
            vibPhase += (o.vibRate ?? 5.2) / SR
            const fm = e.freq * Math.pow(2, vibAmt * Math.sin(TAU * vibPhase) / 1200)
            if ((i & 15) === 0) {
                const cf = o.cutoff * (1 + (o.envAmt ?? 1.2) * Math.exp(-t / 0.2))
                fl.set(cf, o.q ?? 0.9); fr.set(cf * 1.03, o.q ?? 0.9)
            }
            const ya = a.next(fm / det), yb = b.next(fm * det), yc = c.next(fm / 2) * (o.octave ?? 0.3)
            const amp = adsr(t, hold, o.a, o.d, o.s, o.r) * e.vel * (o.gain ?? 1) * 0.45
            write(out, e.start + i, fl.tick(ya * 0.75 + yb * 0.35 + yc) * amp * pl, fr.tick(yb * 0.75 + ya * 0.35 + yc) * amp * pr)
        }
    }
}

export interface BellOptions { ratio?: number; index?: number; decay?: number; gain?: number; attack?: number }

/** FM bell / glass / mallet. */
export function bell(o: BellOptions = {}): Instrument {
    return (out, e) => {
        const ratio = o.ratio ?? 3.5
        const decay = (o.decay ?? 1.4) * Math.pow(523 / e.freq, 0.25)
        const total = sec(decay * 5.5)
        const [pl, pr] = panGains(e.pan ?? 0)
        let pc = 0, pm = 0, p2 = 0
        const att = o.attack ?? 0.0015
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const index = (o.index ?? 2.2) * e.vel * (Math.exp(-t / 0.35) * 0.85 + 0.15)
            const y = Math.sin(TAU * pc + index * Math.sin(TAU * pm)) + 0.25 * Math.sin(TAU * p2) * Math.exp(-t / (decay * 0.4))
            const env = (t < att ? t / att : 1) * Math.exp(-t / decay) * e.vel * (o.gain ?? 1) * 0.42
            write(out, e.start + i, y * env * pl, y * env * pr)
            pc += e.freq / SR; pm += e.freq * ratio / SR; p2 += e.freq * 2.004 / SR
            if (pc > 1) pc -= 1; if (pm > 1) pm -= 1; if (p2 > 1) p2 -= 1
        }
    }
}

export interface BrassOptions { cutoff: number; envAmt?: number; a?: number; d?: number; s?: number; r?: number; gain?: number; voices?: number; detune?: number; q?: number }

/** Synth brass: saw stack with a "bwah" filter swell and a small pitch scoop. */
export function brass(o: BrassOptions): Instrument {
    return (out, e) => {
        const V = o.voices ?? 3
        const oscs: Osc[] = [], ratios: number[] = [], gl: number[] = [], gr: number[] = []
        for (let v = 0; v < V; v++) {
            const pos = V === 1 ? 0 : (v / (V - 1)) * 2 - 1
            ratios.push(Math.pow(2, pos * (o.detune ?? 9) / 1200))
            oscs.push(new Osc('saw', e.rng.next()))
            const [l, r] = panGains(pos * 0.5 + (e.pan ?? 0))
            gl.push(l); gr.push(r)
        }
        const fl = new SVF(), fr = new SVF()
        const hold = e.length / SR
        const A = o.a ?? 0.03, D = o.d ?? 0.35, S = o.s ?? 0.7, R = o.r ?? 0.25
        const total = e.length + sec(R * 1.3)
        const norm = (o.gain ?? 1) * e.vel * 0.55 / Math.sqrt(V)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const scoop = Math.pow(2, -28 * Math.exp(-t / 0.035) / 1200)
            if ((i & 15) === 0) {
                const env = ads(t, 0.07, 0.4, 0.45)
                const c = o.cutoff * (1 + (o.envAmt ?? 2.2) * env * (0.6 + 0.4 * e.vel))
                fl.set(c, o.q ?? 1); fr.set(c, o.q ?? 1)
            }
            let l = 0, r = 0
            for (let v = 0; v < V; v++) { const y = oscs[v].next(e.freq * ratios[v] * scoop); l += y * gl[v]; r += y * gr[v] }
            const amp = adsr(t, hold, A, D, S, R) * norm
            write(out, e.start + i, fl.tick(l) * amp, fr.tick(r) * amp)
        }
    }
}

/** Soft sine/triangle voice for flute-like melodies and sub drones. */
export function softSine(o: { a: number; d: number; s: number; r: number; gain?: number; tri?: number; vibrato?: number; breath?: number }): Instrument {
    return (out, e) => {
        const s = new Osc('sine', 0), tr = new Osc('tri', 0.25)
        const hold = e.length / SR
        const total = e.length + sec(o.r * 1.3)
        const [pl, pr] = panGains(e.pan ?? 0)
        const breath = new SVF(e.freq * 2, 2)
        let vib = 0
        for (let i = 0; i < total; i++) {
            const t = i / SR
            vib += 4.8 / SR
            const fm = e.freq * Math.pow(2, (o.vibrato ?? 0) * Math.min(1, t / 0.6) * Math.sin(TAU * vib) / 1200)
            let n = 0
            if (o.breath) { breath.tick(e.rng.bi()); n = breath.bp * o.breath }
            const y = s.next(fm) * (1 - (o.tri ?? 0)) + tr.next(fm) * (o.tri ?? 0) + n
            const amp = adsr(t, hold, o.a, o.d, o.s, o.r) * e.vel * (o.gain ?? 1) * 0.5
            write(out, e.start + i, y * amp * pl, y * amp * pr)
        }
    }
}

// ── Drums ───────────────────────────────────────────────────────────────────

export function kick(o: { pitch?: number; end?: number; decay?: number; click?: number; drive?: number; gain?: number; sweep?: number } = {}): Instrument {
    return (out, e) => {
        const p0 = o.pitch ?? 150, p1 = o.end ?? 47, decay = o.decay ?? 0.32
        const total = sec(decay * 5)
        const drive = o.drive ?? 1.6, norm = 1 / Math.tanh(drive)
        const hp = new OnePole(1800)
        let ph = 0
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const f = p1 + (p0 - p1) * Math.exp(-t / (o.sweep ?? 0.03))
            ph += f / SR
            const body = Math.sin(TAU * ph) * Math.exp(-t / decay) * (t < 0.0012 ? t / 0.0012 : 1)
            const click = hp.hp(e.rng.bi()) * Math.exp(-t / 0.0022) * (o.click ?? 0.35)
            const y = Math.tanh((body + click) * drive) * norm * e.vel * (o.gain ?? 1) * 0.8
            write(out, e.start + i, y, y)
        }
    }
}

export function snare(o: { tone?: number; noise?: number; snap?: number; pitch?: number; gain?: number; color?: number } = {}): Instrument {
    return (out, e) => {
        const total = sec((o.snap ?? 0.16) * 5)
        const bpL = new SVF(o.color ?? 3800, 0.55), bpR = new SVF((o.color ?? 3800) * 1.07, 0.55)
        const hp = new Biquad('highpass', 700)
        const hpR = new Biquad('highpass', 700)
        const [pl, pr] = panGains(e.pan ?? 0)
        let p1 = 0, p2 = 0
        const f1 = o.pitch ?? 185
        for (let i = 0; i < total; i++) {
            const t = i / SR
            p1 += f1 * (1 + 0.5 * Math.exp(-t / 0.012)) / SR
            p2 += f1 * 1.78 / SR
            const tone = (Math.sin(TAU * p1) * Math.exp(-t / 0.075) * 0.65 + Math.sin(TAU * p2) * Math.exp(-t / 0.045) * 0.35) * (o.tone ?? 0.8)
            const nShared = e.rng.bi(), nSide = e.rng.bi() * 0.35
            const env = Math.exp(-t / (o.snap ?? 0.16)) * (t < 0.001 ? t / 0.001 : 1) * (o.noise ?? 0.9)
            bpL.tick(nShared + nSide); bpR.tick(nShared - nSide)
            const nl = hp.tick(bpL.bp * 1.4 + bpL.hp * 0.5) * env, nr = hpR.tick(bpR.bp * 1.4 + bpR.hp * 0.5) * env
            const k = e.vel * (o.gain ?? 1) * 0.55
            write(out, e.start + i, Math.tanh((tone + nl) * 1.3) * k * pl, Math.tanh((tone + nr) * 1.3) * k * pr)
        }
    }
}

export function clap(o: { gain?: number; tail?: number; color?: number } = {}): Instrument {
    return (out, e) => {
        const total = sec(0.04 + (o.tail ?? 0.12) * 5)
        const fl = new SVF(o.color ?? 1250, 1.3), fr = new SVF((o.color ?? 1250) * 1.08, 1.3)
        const hl = new OnePole(500), hr = new OnePole(500)
        const bursts = [0, 0.0105, 0.0215, 0.033]
        const [pl, pr] = panGains(e.pan ?? 0)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            let env = 0
            for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.0045))
            if (t >= 0.033) env = Math.max(env, 0.55 * Math.exp(-(t - 0.033) / (o.tail ?? 0.12)))
            const n = e.rng.bi(), s = e.rng.bi() * 0.3
            fl.tick(n + s); fr.tick(n - s)
            const k = env * e.vel * (o.gain ?? 1) * 1.6
            write(out, e.start + i, hl.hp(fl.bp) * k * pl, hr.hp(fr.bp) * k * pr)
        }
    }
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]

export function hat(o: { decay?: number; tone?: number; gain?: number; metal?: number } = {}): Instrument {
    return (out, e) => {
        const decay = o.decay ?? 0.035
        const total = sec(decay * 6)
        const tone = o.tone ?? 1.65
        const oscs = METAL.map(f => new Osc('square', e.rng.next()))
        const bp = new SVF(9800, 1.1)
        const hp = new Biquad('highpass', 7200, 0.8)
        const hpN = new Biquad('highpass', 8500, 0.7)
        const [pl, pr] = panGains(e.pan ?? 0)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            let m = 0
            for (let k = 0; k < 6; k++) m += oscs[k].next(METAL[k] * tone)
            bp.tick(m / 6)
            const metal = hp.tick(bp.bp)
            const noise = hpN.tick(e.rng.bi())
            const env = (t < 0.0006 ? t / 0.0006 : 1) * Math.exp(-t / decay)
            const y = (metal * (o.metal ?? 0.7) + noise * 0.45) * env * e.vel * (o.gain ?? 1) * 0.8
            write(out, e.start + i, y * pl, y * pr)
        }
    }
}

export function shaker(o: { gain?: number; decay?: number } = {}): Instrument {
    return (out, e) => {
        const total = sec(0.012 + (o.decay ?? 0.06) * 5)
        const bp = new SVF(6800, 0.9)
        const [pl, pr] = panGains(e.pan ?? 0)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const env = t < 0.012 ? (t / 0.012) ** 2 : Math.exp(-(t - 0.012) / (o.decay ?? 0.06))
            bp.tick(e.rng.bi())
            const y = (bp.bp + bp.hp * 0.25) * env * e.vel * (o.gain ?? 1) * 0.6
            write(out, e.start + i, y * pl, y * pr)
        }
    }
}

export function rim(o: { gain?: number; pitch?: number } = {}): Instrument {
    return (out, e) => {
        const total = sec(0.12)
        const bp = new SVF(4200, 1.4)
        const [pl, pr] = panGains(e.pan ?? 0)
        let p1 = 0, p2 = 0
        const f = o.pitch ?? 1650
        for (let i = 0; i < total; i++) {
            const t = i / SR
            p1 += f / SR; p2 += f * 0.32 / SR
            bp.tick(e.rng.bi())
            const y = (Math.sin(TAU * p1) * Math.exp(-t / 0.009) * 0.7 + Math.sin(TAU * p2) * Math.exp(-t / 0.02) * 0.35 + bp.bp * Math.exp(-t / 0.004) * 0.8) * e.vel * (o.gain ?? 1) * 0.6
            write(out, e.start + i, y * pl, y * pr)
        }
    }
}

export function tom(o: { decay?: number; gain?: number; bend?: number } = {}): Instrument {
    return (out, e) => {
        const decay = o.decay ?? 0.32
        const total = sec(decay * 5)
        const [pl, pr] = panGains(e.pan ?? 0)
        const lp = new OnePole(3000)
        let ph = 0
        for (let i = 0; i < total; i++) {
            const t = i / SR
            ph += e.freq * (1 + (o.bend ?? 0.55) * Math.exp(-t / 0.045)) / SR
            const y = (Math.sin(TAU * ph) * Math.exp(-t / decay) + lp.lp(e.rng.bi()) * Math.exp(-t / 0.012) * 0.4) * (t < 0.001 ? t / 0.001 : 1)
            const k = Math.tanh(y * 1.4) * e.vel * (o.gain ?? 1) * 0.7
            write(out, e.start + i, k * pl, k * pr)
        }
    }
}

export function crash(o: { decay?: number; gain?: number; tone?: number; reverse?: boolean; length?: number } = {}): Instrument {
    return (out, e) => {
        const decay = o.decay ?? 1.7
        const total = o.reverse ? sec(o.length ?? 1.5) : sec(decay * 4)
        const tone = o.tone ?? 2.9
        const oscs = METAL.map(() => new Osc('square', e.rng.next()))
        const hpL = new Biquad('highpass', 3200, 0.7), hpR = new Biquad('highpass', 3300, 0.7)
        const pkL = new Biquad('peak', 7000, 0.8, 4), pkR = new Biquad('peak', 7400, 0.8, 4)
        const [pl, pr] = panGains(e.pan ?? 0)
        for (let i = 0; i < total; i++) {
            const t = i / SR
            let m = 0
            for (let k = 0; k < 6; k++) m += oscs[k].next(METAL[k] * tone * (1 + 0.002 * k))
            m /= 6
            const n1 = e.rng.bi(), n2 = e.rng.bi()
            const env = o.reverse
                ? Math.pow(t / (total / SR), 2.2) * Math.exp(-Math.max(0, (total / SR) - t) / (decay * 0.8)) * Math.min(1, ((total / SR) - t) / 0.004)
                : (t < 0.002 ? t / 0.002 : 1) * (Math.exp(-t / decay) * 0.8 + Math.exp(-t / 0.08) * 0.5)
            const k = env * e.vel * (o.gain ?? 1) * 0.5
            write(out, e.start + i, pkL.tick(hpL.tick(m * 0.45 + n1 * 0.7)) * k * pl, pkR.tick(hpR.tick(m * 0.45 + n2 * 0.7)) * k * pr)
        }
    }
}

// ── Textures ────────────────────────────────────────────────────────────────

/** Noise riser: band-pass sweep with rising level, optional pitched saw. */
export function riser(o: { from?: number; to?: number; q?: number; gain?: number; tonal?: number; curve?: number } = {}): Instrument {
    return (out, e) => {
        const T = e.length / SR
        const total = e.length + sec(0.05)
        const fl = new SVF(), fr = new SVF()
        const saw = new Osc('saw', 0.3), saw2 = new Osc('saw', 0.7)
        const from = o.from ?? 300, to = o.to ?? 9000
        for (let i = 0; i < total; i++) {
            const t = Math.min(i / SR, T)
            const x = t / T
            const c = from * Math.pow(to / from, Math.pow(x, o.curve ?? 1.6))
            if ((i & 15) === 0) { fl.set(c, o.q ?? 2.2); fr.set(c * 1.05, o.q ?? 2.2) }
            const n1 = e.rng.bi(), n2 = e.rng.bi()
            const pitch = e.freq * Math.pow(2, x * 1.0)
            const tonal = (o.tonal ?? 0) * (saw.next(pitch) * 0.5 + saw2.next(pitch * 1.006) * 0.5)
            let amp = Math.pow(x, 1.8) * e.vel * (o.gain ?? 1) * 0.7
            if (i / SR > T) amp *= Math.max(0, 1 - (i / SR - T) / 0.05)
            fl.tick(n1 + tonal); fr.tick(n2 + tonal)
            write(out, e.start + i, fl.bp * amp, fr.bp * amp)
        }
    }
}

/** Downward whoosh / swish: noise band sweeping with a pan motion. */
export function whoosh(o: { from?: number; to?: number; q?: number; gain?: number; panFrom?: number; panTo?: number; peakAt?: number } = {}): Instrument {
    return (out, e) => {
        const T = e.length / SR
        const fl = new SVF(), fr = new SVF()
        const from = o.from ?? 600, to = o.to ?? 4200
        const peakAt = o.peakAt ?? 0.6
        for (let i = 0; i < e.length; i++) {
            const t = i / SR, x = t / T
            const c = from * Math.pow(to / from, x)
            if ((i & 15) === 0) { fl.set(c, o.q ?? 1.4); fr.set(c * 1.07, o.q ?? 1.4) }
            const env = x < peakAt ? Math.pow(x / peakAt, 2) : Math.pow(Math.max(0, 1 - (x - peakAt) / (1 - peakAt)), 1.6)
            const [pl, pr] = panGains((o.panFrom ?? -0.6) + ((o.panTo ?? 0.6) - (o.panFrom ?? -0.6)) * x)
            fl.tick(e.rng.bi()); fr.tick(e.rng.bi())
            const k = env * e.vel * (o.gain ?? 1)
            write(out, e.start + i, fl.bp * k * pl, fr.bp * k * pr)
        }
    }
}

/** Sub boom / impact body. */
export function boom(o: { pitch?: number; end?: number; decay?: number; gain?: number; noise?: number; lp?: number } = {}): Instrument {
    return (out, e) => {
        const decay = o.decay ?? 0.9
        const total = sec(decay * 4)
        const lpL = new SVF(o.lp ?? 900, 0.7), lpR = new SVF((o.lp ?? 900) * 1.1, 0.7)
        let ph = 0
        for (let i = 0; i < total; i++) {
            const t = i / SR
            ph += ((o.end ?? 38) + ((o.pitch ?? 95) - (o.end ?? 38)) * Math.exp(-t / 0.09)) / SR
            const body = Math.sin(TAU * ph) * Math.exp(-t / (decay * 0.6))
            const nEnv = Math.exp(-t / (decay * 0.35)) * (o.noise ?? 0.6)
            const nl = lpL.tick(e.rng.bi()) * nEnv, nr = lpR.tick(e.rng.bi()) * nEnv
            const att = t < 0.002 ? t / 0.002 : 1
            const k = e.vel * (o.gain ?? 1) * att
            write(out, e.start + i, Math.tanh((body + nl) * 1.5) * k * 0.7, Math.tanh((body + nr) * 1.5) * k * 0.7)
        }
    }
}

/**
 * Stadium crowd: a formant-filtered pink-noise roar plus dense applause
 * (hundreds of tiny band-passed claps at random times and positions).
 * `length` is the swell length; level rises, holds, then falls.
 */
export function crowd(o: { gain?: number; claps?: number; roar?: number; attack?: number; release?: number } = {}): Instrument {
    return (out, e) => {
        const T = e.length / SR
        const A = o.attack ?? 0.8, R = o.release ?? 1.2
        const pinkL = new Pink(e.rng.child('pl')), pinkR = new Pink(e.rng.child('pr'))
        const formants = [[620, 3], [1150, 4], [2600, 5]].map(([f, q]) => [new SVF(f, q), new SVF(f * 1.04, q)])
        const roarHp = [new OnePole(180), new OnePole(180)]
        const env = (t: number) => t < A ? Math.pow(t / A, 1.5) : t < T ? 1 : Math.exp(-(t - T) / (R / 4.6))
        const total = e.length + sec(R * 1.2)
        // slow random swells so the roar breathes
        const swell = new SVF(1.5, 0.5)
        const swellRng = e.rng.child('swell')
        for (let i = 0; i < total; i++) {
            const t = i / SR
            const sw = 0.75 + 0.5 * Math.tanh(swell.tick(swellRng.bi() * 40))
            const pl = pinkL.next(), pr = pinkR.next()
            let l = 0, r = 0
            for (const [fL, fR] of formants) { fL.tick(pl); fR.tick(pr); l += fL.bp; r += fR.bp }
            const g = env(t) * sw * (o.roar ?? 1) * e.vel * (o.gain ?? 1) * 1.1
            write(out, e.start + i, roarHp[0].hp(l) * g, roarHp[1].hp(r) * g)
        }
        // applause
        const clapRng = e.rng.child('claps')
        const density = o.claps ?? 140
        const count = Math.round(density * (T + R))
        for (let c = 0; c < count; c++) {
            const t = clapRng.next() * (T + R * 0.8)
            const level = env(t) * (0.35 + 0.65 * clapRng.next())
            if (level < 0.02) continue
            const color = 900 + clapRng.next() * 2200
            const bp = new SVF(color, 1.6)
            const [gl, gr] = panGains(clapRng.bi() * 0.95)
            const len = sec(0.012 + clapRng.next() * 0.02)
            const s0 = e.start + sec(t)
            const k = level * e.vel * (o.gain ?? 1) * 0.5
            for (let i = 0; i < len; i++) {
                const tt = i / SR
                bp.tick(clapRng.bi())
                const y = bp.bp
                const a = Math.exp(-tt / 0.0035) * k
                write(out, s0 + i, y * a * gl, y * a * gr)
            }
        }
    }
}

/** Render one note directly (used by stingers). */
export function hit(out: Stereo, inst: Instrument, at: number, dur: number, freq: number, vel: number, rng: Rng, pan = 0) {
    inst(out, { start: sec(at), length: sec(dur), freq, vel, pan, rng })
}
