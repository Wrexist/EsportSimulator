/**
 * Sound effects and stingers. Feel: modern broadcast/esports — crisp UI ticks,
 * airy whooshes, punchy but not harsh stingers. Positive cues sit in D major,
 * negative ones in D minor, so stingers agree with the music.
 */
import { SR, TAU, Rng, SVF, OnePole, Osc, createStereo, sec, midi, mtof, notes, mixInto, reverb, eq, panGains, type Stereo, type ReverbOptions } from './dsp'
import { supersaw, pluck, epiano, bell, brass, lead, kick, snare, hat, tom, crash, riser, whoosh, boom, crowd, hit, type Instrument } from './instruments'

export type SfxCategory = 'ui' | 'match' | 'moment'

export interface SfxDef {
    id: string
    category: SfxCategory
    /** render length in seconds (the silent tail is trimmed afterwards) */
    length: number
    /** max momentary loudness target (LUFS) */
    target: number
    render: (out: Stereo, rng: Rng) => void
    reverb?: ReverbOptions & { mix: number }
    /** music duck level while this plays (moment/match stingers) */
    duck?: number
    /** random playback-rate variation for repeated UI sounds */
    variation?: number
}

// ── small building blocks ───────────────────────────────────────────────────

function write(out: Stereo, i: number, l: number, r: number) {
    if (i >= 0 && i < out.l.length) { out.l[i] += l; out.r[i] += r }
}

/** Short tonal blip with an optional pitch glide. */
function blip(out: Stereo, at: number, f0: number, f1: number, glide: number, decay: number, gain: number, pan = 0, shape: 'sine' | 'tri' = 'sine', attack = 0.0006) {
    const osc = new Osc(shape, 0)
    const [pl, pr] = panGains(pan)
    const n = sec(decay * 7)
    for (let i = 0; i < n; i++) {
        const t = i / SR
        const f = f1 + (f0 - f1) * Math.exp(-t / Math.max(1e-4, glide))
        const env = (t < attack ? t / attack : 1) * Math.exp(-t / decay) * gain
        const y = osc.next(f) * env
        write(out, sec(at) + i, y * pl, y * pr)
    }
}

/** Band-passed noise transient. */
function tick(out: Stereo, at: number, freq: number, q: number, decay: number, gain: number, rng: Rng, pan = 0) {
    const fl = new SVF(freq, q), fr = new SVF(freq * 1.05, q)
    const [pl, pr] = panGains(pan)
    const n = sec(decay * 7)
    for (let i = 0; i < n; i++) {
        const t = i / SR
        const env = Math.exp(-t / decay) * gain * (t < 0.0003 ? t / 0.0003 : 1)
        fl.tick(rng.bi()); fr.tick(rng.bi())
        write(out, sec(at) + i, fl.bp * env * pl, fr.bp * env * pr)
    }
}

/** Soft air/shimmer: high-passed noise swell. */
function air(out: Stereo, at: number, length: number, peakAt: number, gain: number, rng: Rng, cutoff = 6000) {
    const hl = new SVF(cutoff, 0.7), hr = new SVF(cutoff * 1.1, 0.7)
    const n = sec(length)
    for (let i = 0; i < n; i++) {
        const x = i / n
        const env = (x < peakAt ? x / peakAt : Math.pow(1 - (x - peakAt) / (1 - peakAt), 2)) * gain
        hl.tick(rng.bi()); hr.tick(rng.bi())
        write(out, sec(at) + i, hl.hp * env, hr.hp * env)
    }
}

/** Play a chord (array of note names) on an instrument. */
function chord(out: Stereo, inst: Instrument, at: number, dur: number, voicing: string, vel: number, rng: Rng, spread = 0.3, strum = 0) {
    const ms = notes(voicing)
    ms.forEach((m, i) => hit(out, inst, at + i * strum, dur, mtof(m), vel, rng.child(`${voicing}${i}${at}`), ms.length > 1 ? (i / (ms.length - 1) * 2 - 1) * spread : 0))
}

function seq(out: Stereo, inst: Instrument, start: number, step: number, dur: number, line: string, vel: number, rng: Rng, pans?: number[]) {
    notes(line).forEach((m, i) => hit(out, inst, start + i * step, dur, mtof(m), vel, rng.child(`seq${i}${start}`), pans?.[i % pans.length] ?? 0))
}

function lowpass(buf: Stereo, freq: number, q = 0.7): Stereo { return eq(buf, [{ kind: 'lowpass', freq, q }]) }

// shared voices
const glass = bell({ ratio: 2.0, index: 1.1, decay: 0.45 })
const chime = bell({ ratio: 3.5, index: 1.3, decay: 0.7 })
const sparkle = bell({ ratio: 1.41, index: 1.6, decay: 0.28 })
const softPluck = pluck({ cutoff: 900, envAmt: 3200, decay: 0.07, ampDecay: 0.3, q: 1.2, detune: 6 })
const stabBrass = brass({ cutoff: 1100, envAmt: 2.6, a: 0.015, d: 0.3, s: 0.65, r: 0.35, voices: 3, detune: 10 })
const strings = supersaw({ voices: 7, detune: 14, cutoff: 1800, a: 0.08, d: 1, s: 0.8, r: 1.2, gain: 0.9 })
const softPad = supersaw({ voices: 5, detune: 12, cutoff: 1100, a: 0.25, d: 1.2, s: 0.8, r: 1.4, gain: 0.8 })
const bigKick = kick({ pitch: 160, end: 50, decay: 0.3, click: 0.4, drive: 1.9 })
const tightSnare = snare({ snap: 0.13 })

// ── definitions ─────────────────────────────────────────────────────────────

export const SFX: SfxDef[] = [
    // ── UI ──
    {
        id: 'click', category: 'ui', length: 0.12, target: -27, variation: 0.035,
        render: (o, r) => {
            tick(o, 0, 3300, 1.1, 0.0018, 0.9, r)
            blip(o, 0, 2050, 1600, 0.012, 0.011, 0.38)
            blip(o, 0, 520, 380, 0.01, 0.007, 0.28)
        },
        reverb: { mix: 0.05, room: 0.3, damp: 0.5, preDelay: 0.004, lowCut: 600 },
    },
    {
        id: 'hover', category: 'ui', length: 0.08, target: -37, variation: 0.05,
        render: (o, r) => { blip(o, 0, 2700, 2600, 0.01, 0.006, 0.3); tick(o, 0, 7000, 0.8, 0.0015, 0.2, r) },
    },
    {
        id: 'tab', category: 'ui', length: 0.2, target: -27, variation: 0.03,
        render: (o, r) => {
            hit(o, whoosh({ from: 1400, to: 5000, q: 1.2, panFrom: -0.3, panTo: 0.3, peakAt: 0.35 }), 0, 0.06, 0, 0.35, r)
            blip(o, 0.004, 1150, 1380, 0.015, 0.02, 0.32, 0, 'tri')
            tick(o, 0.004, 2600, 1.4, 0.0015, 0.5, r)
        },
        reverb: { mix: 0.06, room: 0.35, damp: 0.5, preDelay: 0.005, lowCut: 600 },
    },
    {
        id: 'toggle', category: 'ui', length: 0.14, target: -27, variation: 0.03,
        render: (o, r) => {
            tick(o, 0, 1700, 1.6, 0.0016, 0.7, r, -0.1)
            blip(o, 0, 1300, 1250, 0.01, 0.008, 0.26)
            tick(o, 0.028, 3000, 1.6, 0.0014, 0.6, r, 0.1)
            blip(o, 0.028, 2150, 2100, 0.01, 0.01, 0.3)
        },
        reverb: { mix: 0.05, room: 0.3, damp: 0.5, preDelay: 0.004, lowCut: 600 },
    },
    {
        id: 'back', category: 'ui', length: 0.25, target: -27, variation: 0.03,
        render: (o, r) => {
            tick(o, 0, 2200, 1.2, 0.0016, 0.5, r)
            blip(o, 0, 1150, 700, 0.045, 0.045, 0.3, 0, 'tri')
            blip(o, 0.05, 760, 640, 0.03, 0.03, 0.14)
            lowpass(o, 5200)
        },
        reverb: { mix: 0.07, room: 0.4, damp: 0.5, preDelay: 0.006, lowCut: 500 },
    },
    {
        id: 'success', category: 'ui', length: 0.9, target: -22,
        render: (o, r) => {
            tick(o, 0, 2800, 1.2, 0.0016, 0.4, r)
            hit(o, glass, 0, 0.2, mtof(midi('A5')), 0.8, r.child('a'), -0.15)
            hit(o, glass, 0.075, 0.3, mtof(midi('E6')), 0.85, r.child('b'), 0.15)
            hit(o, softPluck, 0, 0.18, mtof(midi('A4')), 0.35, r.child('c'))
            air(o, 0.05, 0.4, 0.2, 0.02, r)
        },
        reverb: { mix: 0.18, room: 0.6, damp: 0.5, preDelay: 0.012, lowCut: 400 },
    },
    {
        id: 'notification', category: 'ui', length: 1.3, target: -22,
        render: (o, r) => {
            hit(o, chime, 0, 0.2, mtof(midi('A5')), 0.75, r.child('a'), -0.2)
            hit(o, chime, 0.12, 0.3, mtof(midi('D6')), 0.85, r.child('b'), 0.2)
            air(o, 0, 0.5, 0.3, 0.025, r, 5000)
        },
        reverb: { mix: 0.22, room: 0.7, damp: 0.45, preDelay: 0.015, lowCut: 400 },
    },
    {
        id: 'decision', category: 'ui', length: 1.6, target: -21,
        render: (o, r) => {
            hit(o, boom({ pitch: 90, end: 55, decay: 0.22, noise: 0.15, lp: 600 }), 0, 0.1, 0, 0.4, r.child('b'))
            seq(o, glass, 0, 0.085, 0.3, 'D5 F#5 A5', 0.8, r, [-0.3, 0, 0.3])
            hit(o, chime, 0.26, 0.4, mtof(midi('D6')), 0.6, r.child('c'))
            air(o, 0, 0.6, 0.3, 0.02, r, 5000)
        },
        reverb: { mix: 0.22, room: 0.72, damp: 0.45, preDelay: 0.015, lowCut: 350 },
    },
    {
        id: 'error', category: 'ui', length: 0.45, target: -23,
        render: (o, r) => {
            const buzz = pluck({ cutoff: 500, envAmt: 600, decay: 0.03, ampDecay: 0.09, q: 0.9, detune: 14, release: 0.02 })
            hit(o, buzz, 0, 0.07, 164.8, 0.9, r.child('a'))
            hit(o, buzz, 0.115, 0.08, 155.6, 0.9, r.child('b'))
            tick(o, 0, 900, 1, 0.003, 0.25, r)
            lowpass(o, 1800)
        },
        reverb: { mix: 0.08, room: 0.4, damp: 0.6, preDelay: 0.008, lowCut: 300 },
    },
    {
        id: 'money', category: 'ui', length: 1.0, target: -21,
        render: (o, r) => {
            hit(o, sparkle, 0, 0.1, mtof(midi('B6')), 0.7, r.child('a'), -0.25)
            hit(o, sparkle, 0.06, 0.1, mtof(midi('E7')), 0.75, r.child('b'), 0.25)
            hit(o, sparkle, 0.12, 0.1, mtof(midi('B6')), 0.4, r.child('c'), 0)
            chord(o, softPluck, 0, 0.2, 'D5 F#5 A5', 0.35, r, 0.3, 0.01)
            air(o, 0, 0.35, 0.15, 0.03, r, 7000)
        },
        reverb: { mix: 0.16, room: 0.55, damp: 0.4, preDelay: 0.01, lowCut: 500 },
    },
    {
        id: 'weekAdvance', category: 'ui', length: 1.3, target: -22,
        render: (o, r) => {
            hit(o, whoosh({ from: 350, to: 3800, q: 1.1, panFrom: -0.6, panTo: 0.5, peakAt: 0.8 }), 0, 0.36, 0, 0.5, r.child('w'))
            hit(o, boom({ pitch: 120, end: 52, decay: 0.2, noise: 0.25, lp: 800 }), 0.33, 0.1, 0, 0.55, r.child('b'))
            tick(o, 0.33, 2400, 1.1, 0.002, 0.4, r)
            chord(o, glass, 0.34, 0.3, 'A5 D6', 0.4, r, 0.4, 0.02)
            air(o, 0.3, 0.6, 0.15, 0.02, r)
        },
        reverb: { mix: 0.18, room: 0.65, damp: 0.5, preDelay: 0.01, lowCut: 400 },
    },
    {
        id: 'transfer', category: 'ui', length: 1.0, target: -22,
        render: (o, r) => {
            hit(o, whoosh({ from: 2500, to: 7000, q: 0.9, panFrom: 0.4, panTo: -0.4, peakAt: 0.5 }), 0, 0.16, 0, 0.35, r.child('w'))
            hit(o, softPluck, 0.1, 0.2, mtof(midi('A4')), 0.6, r.child('a'), -0.15)
            hit(o, softPluck, 0.2, 0.3, mtof(midi('D5')), 0.7, r.child('b'), 0.15)
            hit(o, glass, 0.2, 0.3, mtof(midi('D6')), 0.35, r.child('c'))
        },
        reverb: { mix: 0.16, room: 0.6, damp: 0.5, preDelay: 0.01, lowCut: 400 },
    },
    {
        id: 'contractSign', category: 'ui', length: 1.3, target: -22,
        render: (o, r) => {
            // pen strokes: wobbling band-passed noise
            for (const [at, len, f] of [[0, 0.09, 2600], [0.11, 0.07, 3200], [0.2, 0.12, 2300]] as const) {
                const bp = new SVF(f, 3)
                const n = sec(len)
                for (let i = 0; i < n; i++) {
                    const x = i / n
                    bp.set(f * (1 + 0.25 * Math.sin(TAU * 18 * i / SR)), 3)
                    bp.tick(r.bi())
                    const env = Math.sin(Math.PI * x) * 0.5
                    write(o, sec(at) + i, bp.bp * env, bp.bp * env * 0.9)
                }
            }
            hit(o, chime, 0.36, 0.25, mtof(midi('A5')), 0.6, r.child('a'), -0.2)
            hit(o, chime, 0.44, 0.3, mtof(midi('D6')), 0.7, r.child('b'), 0.2)
        },
        reverb: { mix: 0.16, room: 0.6, damp: 0.5, preDelay: 0.01, lowCut: 400 },
    },

    // ── MATCH ──
    {
        id: 'matchIntro', category: 'match', length: 5.5, target: -16, duck: 0.3,
        render: (o, r) => {
            hit(o, riser({ from: 250, to: 9000, q: 2.2, tonal: 0.25, curve: 1.5 }), 0, 2.0, mtof(midi('D3')), 0.8, r.child('riser'))
            // accelerating snare roll
            let t = 0.9
            let k = 0
            while (t < 2.0) {
                const step = 0.125 * Math.pow(0.42, (t - 0.9) / 1.1)
                hit(o, tightSnare, t, 0.05, 0, 0.25 + 0.55 * (t - 0.9) / 1.1, r.child(`roll${k++}`), (k % 2 ? -0.2 : 0.2))
                t += Math.max(0.03, step)
            }
            hit(o, boom({ pitch: 130, end: 40, decay: 0.75, noise: 0.7, lp: 700 }), 2.0, 0.2, 0, 1, r.child('boom'))
            hit(o, bigKick, 2.0, 0.2, 0, 1, r.child('kick'))
            hit(o, crash({ decay: 2.2 }), 2.0, 0.2, 0, 0.85, r.child('crash'))
            chord(o, stabBrass, 2.0, 0.55, 'D3 A3 D4 F#4 A4', 0.95, r, 0.5)
            chord(o, strings, 2.0, 1.4, 'D4 F#4 A4 D5', 0.6, r, 0.6)
            hit(o, glass, 2.02, 0.3, mtof(midi('D6')), 0.5, r.child('g'))
        },
        reverb: { mix: 0.3, room: 0.85, damp: 0.45, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'countdown', category: 'match', length: 4.6, target: -19, duck: 0.45,
        render: (o, r) => {
            for (const at of [0, 1, 2]) {
                tick(o, at, 3000, 1.4, 0.0015, 1.2, r)
                blip(o, at, 880 * 1.02, 880, 0.01, 0.09, 1.1)
                blip(o, at, 1760, 1760, 0.01, 0.03, 0.3)
                blip(o, at, 440, 440, 0.01, 0.05, 0.35)
            }
            // GO
            hit(o, whoosh({ from: 600, to: 6000, q: 1, peakAt: 0.9, panFrom: -0.3, panTo: 0.3 }), 2.7, 0.3, 0, 0.45, r.child('w'))
            hit(o, bigKick, 3.0, 0.2, 0, 0.85, r.child('k'))
            chord(o, stabBrass, 3.0, 0.5, 'D4 F#4 A4 D5', 0.95, r, 0.45)
            hit(o, glass, 3.0, 0.3, mtof(midi('D6')), 0.7, r.child('g'))
            hit(o, crash({ decay: 1.4 }), 3.0, 0.2, 0, 0.45, r.child('c'))
        },
        reverb: { mix: 0.2, room: 0.7, damp: 0.5, preDelay: 0.012, lowCut: 300 },
    },
    {
        id: 'roundWin', category: 'match', length: 1.2, target: -21,
        render: (o, r) => {
            hit(o, softPluck, 0, 0.12, mtof(midi('D5')), 0.75, r.child('a'), -0.2)
            hit(o, softPluck, 0.09, 0.25, mtof(midi('A5')), 0.85, r.child('b'), 0.2)
            hit(o, glass, 0.09, 0.3, mtof(midi('A6')), 0.35, r.child('c'))
            tick(o, 0, 2500, 1.2, 0.0018, 0.35, r)
            air(o, 0.05, 0.4, 0.2, 0.02, r)
        },
        reverb: { mix: 0.18, room: 0.6, damp: 0.45, preDelay: 0.01, lowCut: 400 },
    },
    {
        id: 'roundLose', category: 'match', length: 1.1, target: -22,
        render: (o, r) => {
            const muted = pluck({ cutoff: 500, envAmt: 1400, decay: 0.06, ampDecay: 0.3, q: 0.9, detune: 6 })
            hit(o, muted, 0, 0.15, mtof(midi('A4')), 0.75, r.child('a'), -0.15)
            hit(o, muted, 0.1, 0.3, mtof(midi('F4')), 0.75, r.child('b'), 0.15)
            hit(o, muted, 0.1, 0.3, mtof(midi('D4')), 0.45, r.child('c'))
            lowpass(o, 2600)
        },
        reverb: { mix: 0.16, room: 0.6, damp: 0.6, preDelay: 0.01, lowCut: 300 },
    },
    {
        id: 'bombPlant', category: 'match', length: 0.8, target: -21,
        render: (o, r) => {
            hit(o, tom({ decay: 0.06, bend: 0.2 }), 0, 0.05, 140, 0.6, r.child('thunk'))
            tick(o, 0, 1200, 1.5, 0.004, 0.5, r)
            for (const at of [0.08, 0.2]) blip(o, at, 2093, 2093, 0.01, 0.035, 0.32)
        },
        reverb: { mix: 0.12, room: 0.5, damp: 0.5, preDelay: 0.008, lowCut: 400 },
    },
    {
        id: 'bombDefuse', category: 'match', length: 1.1, target: -21,
        render: (o, r) => {
            const sweep = new Osc('tri', 0)
            const n = sec(0.26)
            for (let i = 0; i < n; i++) {
                const x = i / n
                const y = sweep.next(600 * Math.pow(3, x)) * Math.sin(Math.PI * x) * 0.25
                write(o, i, y, y)
            }
            tick(o, 0.27, 2600, 1.4, 0.0016, 0.5, r)
            blip(o, 0.28, 1568, 1568, 0.01, 0.05, 0.3)
            blip(o, 0.37, 2349, 2349, 0.01, 0.09, 0.32)
            hit(o, glass, 0.37, 0.3, mtof(midi('D6')), 0.4, r.child('g'))
        },
        reverb: { mix: 0.14, room: 0.55, damp: 0.5, preDelay: 0.01, lowCut: 400 },
    },
    {
        id: 'bombExplode', category: 'match', length: 3.2, target: -19,
        render: (o, r) => {
            hit(o, boom({ pitch: 75, end: 38, decay: 0.9, noise: 1.1, lp: 420 }), 0.01, 0.3, 0, 1, r.child('b'))
            // rumble tail
            const lp1 = new OnePole(180), lp2 = new OnePole(190), lp3 = new OnePole(220), lp4 = new OnePole(230)
            const n = sec(2.8)
            for (let i = 0; i < n; i++) {
                const t = i / SR
                const env = (t < 0.03 ? t / 0.03 : 1) * Math.exp(-t / 0.7) * 0.9
                write(o, sec(0.01) + i, lp3.lp(lp1.lp(r.bi())) * env * 3, lp4.lp(lp2.lp(r.bi())) * env * 3)
            }
            lowpass(o, 900, 0.6)
        },
        reverb: { mix: 0.35, room: 0.88, damp: 0.75, preDelay: 0.03, lowCut: 60, highCut: 1500 },
    },
    {
        id: 'clutch', category: 'match', length: 2.6, target: -18, duck: 0.4,
        render: (o, r) => {
            hit(o, bigKick, 0, 0.2, 0, 0.9, r.child('k'))
            hit(o, boom({ pitch: 110, end: 44, decay: 0.4, noise: 0.4 }), 0, 0.2, 0, 0.6, r.child('b'))
            chord(o, stabBrass, 0, 0.3, 'D4 F4 A4', 0.85, r, 0.4)
            seq(o, lead({ cutoff: 2400, a: 0.005, d: 0.2, s: 0.7, r: 0.25, vibrato: 14 }), 0.32, 0.11, 0.1, 'D5 F#5 A5', 0.8, r, [-0.2, 0, 0.2])
            hit(o, lead({ cutoff: 2600, a: 0.005, d: 0.4, s: 0.75, r: 0.5, vibrato: 18 }), 0.65, 0.7, mtof(midi('D6')), 0.85, r.child('top'))
            chord(o, strings, 0.65, 0.9, 'D4 F#4 A4 D5', 0.5, r, 0.6)
            hit(o, crash({ decay: 1.8 }), 0.65, 0.2, 0, 0.55, r.child('c'))
        },
        reverb: { mix: 0.28, room: 0.82, damp: 0.45, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'victory', category: 'match', length: 3.8, target: -16, duck: 0.25,
        render: (o, r) => {
            const hits: [number, string, string][] = [[0, 'G3 B3 D4 G4', 'B5'], [0.24, 'A3 C#4 E4 A4', 'C#6'], [0.48, 'A3 D4 F#4 A4 D5', 'D6']]
            hits.forEach(([at, v, top], i) => {
                const last = i === hits.length - 1
                chord(o, stabBrass, at, last ? 1.5 : 0.18, v, 0.95, r, 0.45)
                chord(o, strings, at, last ? 1.6 : 0.2, v, last ? 0.55 : 0.4, r, 0.7)
                hit(o, glass, at, 0.3, mtof(midi(top)), 0.7, r.child(`t${i}`))
                hit(o, bigKick, at, 0.2, 0, 0.8, r.child(`k${i}`))
                hit(o, tightSnare, at, 0.1, 0, last ? 0.8 : 0.55, r.child(`s${i}`))
            })
            hit(o, crash({ decay: 2.2 }), 0.48, 0.2, 0, 0.8, r.child('c'))
            seq(o, sparkle, 0.6, 0.07, 0.2, 'D6 F#6 A6 D7', 0.45, r, [-0.4, -0.1, 0.1, 0.4])
            hit(o, boom({ pitch: 90, end: 45, decay: 0.4, noise: 0.3 }), 0.48, 0.2, 0, 0.6, r.child('b'))
        },
        reverb: { mix: 0.3, room: 0.85, damp: 0.4, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'defeat', category: 'match', length: 3.4, target: -17, duck: 0.3,
        render: (o, r) => {
            hit(o, boom({ pitch: 70, end: 42, decay: 0.5, noise: 0.25, lp: 500 }), 0, 0.2, 0, 0.6, r.child('b'))
            chord(o, softPad, 0, 1.6, 'D3 F3 A3', 0.7, r, 0.5)
            chord(o, softPad, 1.0, 1.2, 'C#3 E3 A3', 0.55, r, 0.5)
            const ep = epiano({ decay: 2.2, bright: 0.7 })
            seq(o, ep, 0.05, 0.42, 0.6, 'A4 F4 E4', 0.55, r, [-0.2, 0, 0.2])
            hit(o, ep, 1.31, 1.4, mtof(midi('D4')), 0.55, r.child('end'))
            lowpass(o, 3200)
        },
        reverb: { mix: 0.3, room: 0.85, damp: 0.6, preDelay: 0.02, lowCut: 200 },
    },

    // ── MOMENTS ──
    {
        id: 'titleWin', category: 'moment', length: 6.2, target: -15, duck: 0.15,
        render: (o, r) => {
            // snare build
            for (let i = 0; i < 8; i++) hit(o, tightSnare, i * 0.0625, 0.05, 0, 0.3 + i * 0.08, r.child(`roll${i}`), i % 2 ? 0.2 : -0.2)
            const hits: [number, number, string][] = [[0.5, 0.35, 'B3 D4 G4 B4'], [0.95, 0.35, 'C#4 E4 A4 C#5'], [1.4, 2.6, 'D4 F#4 A4 D5 F#5']]
            hits.forEach(([at, d, v], i) => {
                chord(o, stabBrass, at, d, v, 1, r, 0.5)
                chord(o, strings, at, d + 0.2, v, 0.5, r, 0.8)
                hit(o, bigKick, at, 0.2, 0, 0.9, r.child(`k${i}`))
                hit(o, tom({ decay: 0.5, bend: 0.3 }), at, 0.2, mtof(midi('D2')), 0.7, r.child(`tm${i}`))
            })
            hit(o, crash({ decay: 2.6 }), 1.4, 0.2, 0, 0.9, r.child('c1'))
            hit(o, boom({ pitch: 100, end: 42, decay: 0.7, noise: 0.5 }), 1.4, 0.2, 0, 0.8, r.child('b'))
            seq(o, chime, 1.45, 0.11, 0.3, 'D6 F#6 A6 D7', 0.55, r, [-0.4, -0.1, 0.1, 0.4])
            // timpani-ish roll under the hold
            for (let i = 0; i < 18; i++) hit(o, tom({ decay: 0.35, bend: 0.15 }), 2.0 + i * 0.07, 0.05, mtof(midi('A1')), 0.25 + 0.2 * Math.sin(Math.PI * i / 18), r.child(`roll2${i}`), i % 2 ? 0.3 : -0.3)
            hit(o, crowd({ claps: 120, attack: 0.8, release: 1.8, roar: 0.8 }), 1.4, 2.6, 0, 0.35, r.child('crowd'))
        },
        reverb: { mix: 0.3, room: 0.86, damp: 0.4, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'titleWinMajor', category: 'moment', length: 9.0, target: -14.5, duck: 0.1,
        render: (o, r) => {
            hit(o, riser({ from: 200, to: 9000, q: 2.4, tonal: 0.2 }), 0, 1.2, mtof(midi('A2')), 0.75, r.child('riser'))
            for (let i = 0; i < 10; i++) hit(o, tightSnare, 0.6 + i * 0.06, 0.05, 0, 0.3 + i * 0.06, r.child(`roll${i}`), i % 2 ? 0.2 : -0.2)
            const hits: [number, number, string, string][] = [
                [1.2, 0.5, 'Bb3 D4 F4 Bb4', 'Bb1'],
                [1.8, 0.5, 'C4 E4 G4 C5', 'C2'],
                [2.4, 3.6, 'D4 F#4 A4 D5 F#5', 'D2'],
            ]
            hits.forEach(([at, d, v, root], i) => {
                chord(o, stabBrass, at, d, v, 1, r, 0.55)
                chord(o, stabBrass, at, d, v.split(' ').map(n => n.replace(/(\d)$/, (_, x) => String(Number(x) - 1))).join(' '), 0.6, r.child(`low${i}`), 0.3)
                chord(o, strings, at, d + 0.3, v, 0.55, r, 0.9)
                hit(o, bigKick, at, 0.2, 0, 1, r.child(`k${i}`))
                hit(o, boom({ pitch: 110, end: 42, decay: i === 2 ? 0.85 : 0.45, noise: 0.5 }), at, 0.2, mtof(midi(root)), i === 2 ? 1 : 0.6, r.child(`b${i}`))
                hit(o, tom({ decay: 0.6, bend: 0.25 }), at, 0.2, mtof(midi(root)) * 2, 0.8, r.child(`t${i}`))
            })
            hit(o, crash({ decay: 3 }), 2.4, 0.2, 0, 1, r.child('c1'))
            hit(o, crash({ decay: 2.4, tone: 3.4 }), 1.2, 0.2, 0, 0.55, r.child('c0'), -0.3)
            seq(o, chime, 2.45, 0.1, 0.3, 'A5 D6 F#6 A6 D7', 0.6, r, [-0.5, -0.25, 0, 0.25, 0.5])
            seq(o, sparkle, 3.2, 0.16, 0.3, 'D7 A6 F#6 A6 D7 F#7', 0.3, r, [0.4, -0.4])
            for (let i = 0; i < 30; i++) hit(o, tom({ decay: 0.4, bend: 0.12 }), 3.0 + i * 0.065, 0.05, mtof(midi('D2')), 0.2 + 0.25 * Math.sin(Math.PI * i / 30), r.child(`timp${i}`), i % 2 ? 0.35 : -0.35)
            hit(o, crash({ reverse: true, length: 1.2, decay: 1 }), 0, 0.2, 0, 0.45, r.child('rev'))
            hit(o, crowd({ claps: 220, attack: 1.0, release: 2.2, roar: 1 }), 2.2, 4.4, 0, 0.6, r.child('crowd'))
        },
        reverb: { mix: 0.32, room: 0.88, damp: 0.4, preDelay: 0.025, lowCut: 220 },
    },
    {
        id: 'promotion', category: 'moment', length: 4.2, target: -16, duck: 0.2,
        render: (o, r) => {
            seq(o, softPluck, 0, 0.065, 0.12, 'D4 F#4 A4 D5 F#5 A5 D6', 0.75, r, [-0.4, -0.2, 0, 0.2, 0.4])
            chord(o, strings, 0.1, 1.9, 'D4 F#4 A4 D5', 0.55, r, 0.7)
            chord(o, stabBrass, 0.46, 1.6, 'A3 D4 F#4 A4', 0.9, r, 0.45)
            hit(o, bigKick, 0.46, 0.2, 0, 0.8, r.child('k'))
            hit(o, crash({ decay: 2 }), 0.46, 0.2, 0, 0.6, r.child('c'))
            seq(o, chime, 0.5, 0.12, 0.3, 'F#6 A6 D7', 0.5, r, [-0.3, 0, 0.3])
            air(o, 0.2, 1.4, 0.3, 0.02, r)
        },
        reverb: { mix: 0.28, room: 0.84, damp: 0.4, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'relegation', category: 'moment', length: 4.4, target: -17, duck: 0.2,
        render: (o, r) => {
            hit(o, boom({ pitch: 65, end: 40, decay: 0.7, noise: 0.3, lp: 400 }), 0, 0.2, 0, 0.8, r.child('b'))
            chord(o, softPad, 0, 1.4, 'D3 F3 A3 D4', 0.7, r, 0.6)
            chord(o, softPad, 1.2, 1.6, 'Bb2 D3 F3 Bb3', 0.6, r, 0.6)
            const ep = epiano({ decay: 2.4, bright: 0.6 })
            seq(o, ep, 0.1, 0.5, 0.7, 'F4 E4 D4', 0.55, r, [0.2, 0, -0.2])
            hit(o, ep, 1.62, 1.8, mtof(midi('A3')), 0.5, r.child('end'))
            lowpass(o, 2600)
        },
        reverb: { mix: 0.32, room: 0.86, damp: 0.65, preDelay: 0.02, lowCut: 180 },
    },
    {
        id: 'signing', category: 'moment', length: 3.4, target: -16, duck: 0.25,
        render: (o, r) => {
            hit(o, whoosh({ from: 400, to: 5000, q: 1.1, peakAt: 0.92, panFrom: -0.6, panTo: 0.2 }), 0, 0.42, 0, 0.6, r.child('w'))
            hit(o, bigKick, 0.42, 0.2, 0, 0.8, r.child('k'))
            hit(o, boom({ pitch: 100, end: 46, decay: 0.4, noise: 0.35 }), 0.42, 0.2, 0, 0.55, r.child('b'))
            chord(o, strings, 0.42, 1.2, 'D4 F#4 A4 E5', 0.6, r, 0.8)
            seq(o, glass, 0.44, 0.08, 0.3, 'A5 D6 F#6 A6', 0.6, r, [-0.4, -0.1, 0.1, 0.4])
            hit(o, crash({ decay: 1.6, tone: 3.2 }), 0.42, 0.2, 0, 0.45, r.child('c'))
            air(o, 0.4, 1.2, 0.2, 0.02, r)
        },
        reverb: { mix: 0.28, room: 0.84, damp: 0.42, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'sale', category: 'moment', length: 2.2, target: -17, duck: 0.35,
        render: (o, r) => {
            hit(o, whoosh({ from: 3000, to: 900, q: 1, peakAt: 0.4, panFrom: 0.5, panTo: -0.3 }), 0, 0.3, 0, 0.4, r.child('w'))
            seq(o, sparkle, 0.1, 0.06, 0.1, 'B6 E7 B6 E7', 0.55, r, [-0.3, 0.3])
            chord(o, softPluck, 0.12, 0.25, 'C#4 E4 A4', 0.6, r, 0.3, 0.01)
            chord(o, softPluck, 0.36, 0.5, 'D4 F#4 A4 D5', 0.7, r, 0.3, 0.012)
            chord(o, softPad, 0.36, 0.7, 'D4 F#4 A4', 0.35, r, 0.6)
            hit(o, boom({ pitch: 110, end: 55, decay: 0.2, noise: 0.2 }), 0.36, 0.1, 0, 0.4, r.child('b'))
        },
        reverb: { mix: 0.22, room: 0.75, damp: 0.45, preDelay: 0.015, lowCut: 300 },
    },
    {
        id: 'seasonReview', category: 'moment', length: 5.2, target: -17, duck: 0.25,
        render: (o, r) => {
            hit(o, boom({ pitch: 80, end: 42, decay: 0.6, noise: 0.35, lp: 600 }), 0, 0.2, 0, 0.6, r.child('b'))
            chord(o, softPad, 0, 1.6, 'B2 F#3 A3 D4', 0.6, r, 0.7)
            chord(o, softPad, 1.5, 2, 'G2 D3 F#3 B3', 0.6, r, 0.7)
            const ep = epiano({ decay: 2.8, bright: 0.85 })
            seq(o, ep, 0.1, 0.38, 0.5, 'D5 C#5 B4', 0.6, r, [-0.2, 0, 0.2])
            hit(o, ep, 1.55, 1.8, mtof(midi('A4')), 0.6, r.child('a'))
            chord(o, ep, 1.55, 1.8, 'D4 F#4', 0.4, r, 0.3)
            hit(o, chime, 1.6, 0.3, mtof(midi('F#6')), 0.4, r.child('c'))
            hit(o, crash({ reverse: true, length: 1.4, decay: 1.2 }), 0.1, 0.2, 0, 0.35, r.child('rev'))
        },
        reverb: { mix: 0.34, room: 0.88, damp: 0.5, preDelay: 0.025, lowCut: 200 },
    },
    {
        id: 'award', category: 'moment', length: 3.4, target: -16, duck: 0.25,
        render: (o, r) => {
            const hits: [number, number, string][] = [[0, 0.22, 'A3 D4 F#4 A4'], [0.3, 0.22, 'B3 D4 G4 B4'], [0.6, 1.4, 'A3 D4 F#4 A4 D5']]
            hits.forEach(([at, d, v], i) => {
                chord(o, stabBrass, at, d, v, 0.9, r, 0.45)
                hit(o, bigKick, at, 0.2, 0, 0.6, r.child(`k${i}`))
            })
            hit(o, crash({ decay: 1.8 }), 0.6, 0.2, 0, 0.6, r.child('c'))
            seq(o, chime, 0.62, 0.09, 0.3, 'D6 F#6 A6', 0.55, r, [-0.3, 0, 0.3])
            chord(o, strings, 0.6, 1.5, 'D4 F#4 A4', 0.4, r, 0.7)
        },
        reverb: { mix: 0.28, room: 0.84, damp: 0.4, preDelay: 0.02, lowCut: 250 },
    },
    {
        id: 'welcome', category: 'moment', length: 4.6, target: -17, duck: 0.3,
        render: (o, r) => {
            chord(o, softPad, 0, 2.6, 'D3 A3 E4 F#4', 0.7, r, 0.7)
            const ep = epiano({ decay: 2.6, bright: 0.9 })
            seq(o, ep, 0.15, 0.3, 0.5, 'A4 D5 E5', 0.6, r, [-0.2, 0, 0.2])
            hit(o, ep, 1.05, 1.6, mtof(midi('F#5')), 0.65, r.child('top'))
            chord(o, ep, 1.05, 1.6, 'D4 A4', 0.4, r, 0.3)
            hit(o, glass, 1.06, 0.3, mtof(midi('A6')), 0.3, r.child('g'))
            air(o, 0, 2.2, 0.5, 0.015, r, 5000)
        },
        reverb: { mix: 0.34, room: 0.88, damp: 0.5, preDelay: 0.025, lowCut: 200 },
    },
    {
        id: 'achievement', category: 'moment', length: 2.4, target: -17, duck: 0.4,
        render: (o, r) => {
            hit(o, boom({ pitch: 110, end: 55, decay: 0.2, noise: 0.2 }), 0, 0.1, 0, 0.45, r.child('b'))
            seq(o, glass, 0, 0.055, 0.3, 'D6 F#6 A6 D7', 0.7, r, [-0.4, -0.15, 0.15, 0.4])
            chord(o, softPad, 0.05, 0.6, 'D4 F#4 A4 D5', 0.4, r, 0.7)
            air(o, 0, 0.8, 0.2, 0.025, r, 7000)
        },
        reverb: { mix: 0.26, room: 0.8, damp: 0.4, preDelay: 0.015, lowCut: 300 },
    },
    {
        id: 'tournamentAdvance', category: 'moment', length: 2.4, target: -17, duck: 0.35,
        render: (o, r) => {
            hit(o, whoosh({ from: 500, to: 5000, q: 1, peakAt: 0.9, panFrom: -0.4, panTo: 0.3 }), 0, 0.24, 0, 0.4, r.child('w'))
            const steps: [number, string][] = [[0.24, 'D4 A4 D5'], [0.42, 'E4 B4 E5'], [0.6, 'F#4 C#5 F#5']]
            steps.forEach(([at, v], i) => {
                chord(o, stabBrass, at, i === 2 ? 0.8 : 0.14, v, 0.85, r, 0.4)
                hit(o, bigKick, at, 0.2, 0, i === 2 ? 0.8 : 0.5, r.child(`k${i}`))
            })
            hit(o, crash({ decay: 1.5 }), 0.6, 0.2, 0, 0.45, r.child('c'))
        },
        reverb: { mix: 0.24, room: 0.78, damp: 0.45, preDelay: 0.015, lowCut: 250 },
    },
    {
        id: 'facilityUpgrade', category: 'moment', length: 2.6, target: -17, duck: 0.4,
        render: (o, r) => {
            const thunk = tom({ decay: 0.09, bend: 0.9 })
            const metal = hat({ decay: 0.06, tone: 1.1, metal: 1 })
            for (const [at, f] of [[0, 180], [0.17, 240]] as const) {
                hit(o, thunk, at, 0.05, f, 0.75, r.child(`t${at}`))
                hit(o, metal, at, 0.05, 0, 0.45, r.child(`m${at}`))
            }
            seq(o, chime, 0.36, 0.09, 0.3, 'G5 B5 D6 G6', 0.55, r, [-0.3, -0.1, 0.1, 0.3])
            chord(o, softPad, 0.36, 0.8, 'G4 B4 D5', 0.35, r, 0.6)
            air(o, 0.3, 0.8, 0.2, 0.02, r)
        },
        reverb: { mix: 0.24, room: 0.75, damp: 0.45, preDelay: 0.015, lowCut: 300 },
    },
]

/** Render one effect (before loudness normalisation). */
export function renderSfx(def: SfxDef): Stereo {
    const rng = new Rng(`sfx:${def.id}`)
    const out = createStereo(sec(def.length))
    def.render(out, rng)
    if (def.reverb) {
        const { mix, ...opts } = def.reverb
        mixInto(out, reverb(out, opts), 0, mix)
    }
    return out
}

export const sfxById = (id: string) => SFX.find(s => s.id === id)
