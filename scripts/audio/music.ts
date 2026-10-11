/**
 * Loop renderer and the four music cues. A song renders one loop plus its
 * tails, folds the tails back onto the start, and runs every stateful effect
 * with wrap-around padding, so the loop repeats without a seam.
 */
import {
    SR, TAU, Rng, createStereo, sec, mtof, midi, notes, fold, concat, slice, scale, mixInto, chorus, reverb, pingPong,
    compress, limit, saturate, eq, loudness, dbToGain, width, type Stereo, type ReverbOptions, type BiquadKind,
} from './dsp'
import { supersaw, pluck, epiano, bass, lead, bell, brass, softSine, kick, snare, clap, hat, shaker, rim, tom, crash, riser, crowd, type Instrument } from './instruments'

export interface NoteSpec { t: number; d: number; m: number; v?: number; pan?: number }
export interface TrackSpec {
    name: string
    inst: Instrument
    notes: NoteSpec[]
    gain: number
    reverb?: number
    delay?: number
    sidechain?: number
    drum?: boolean
    humanize?: number
    post?: (loop: Stereo, loopSamples: number) => Stereo
    eq?: EqBand[]
}
type EqBand = { kind: BiquadKind; freq: number; q?: number; gain?: number }
export interface SongSpec {
    id: string
    bpm: number
    bars: number
    swing?: number
    tracks: TrackSpec[]
    /** beats of the kick pattern that drive sidechain ducking */
    kicks: number[]
    sidechainRelease?: number
    delayBeats: number
    delayFeedback?: number
    reverb: ReverbOptions
    eq?: EqBand[]
    targetLufs: number
    width?: number
}
export interface RenderedLoop { loop: Stereo; loopSamples: number; bpm: number; bars: number }

const PAD = sec(1)
const TAIL = sec(10)

/** Run a stateful process on a loop with wrap-around padding on both sides. */
export function processWrapped(loop: Stereo, fn: (b: Stereo) => Stereo, padSec = 2): Stereo {
    const n = loop.l.length
    const p = Math.min(sec(padSec), n)
    const out = fn(concat(slice(loop, n - p, n), loop, slice(loop, 0, p)))
    return slice(out, p, p + n)
}

function autopan(buf: Stereo, cycles: number, depth: number): Stereo {
    const n = buf.l.length
    for (let i = 0; i < n; i++) {
        const s = Math.sin(TAU * cycles * i / n) * depth
        buf.l[i] *= 1 + s; buf.r[i] *= 1 - s
    }
    return buf
}

export function renderSong(spec: SongSpec): RenderedLoop {
    const beat = 60 / spec.bpm
    const L = Math.round(spec.bars * 4 * beat * SR)
    const at = (b: number) => Math.round(b * beat * SR)
    // sidechain envelope (periodic)
    const sc = new Float32Array(L)
    const rel = beat * (spec.sidechainRelease ?? 0.45)
    for (const k of spec.kicks) {
        const s0 = at(k)
        for (let i = 0; i < sec(rel); i++) {
            const t = i / SR
            const d = t < 0.004 ? t / 0.004 : 0.5 * (1 + Math.cos(Math.PI * (t - 0.004) / (rel - 0.004)))
            const j = (s0 + i) % L
            if (d > sc[j]) sc[j] = d
        }
    }
    const mix = createStereo(L), drums = createStereo(L), revSend = createStereo(L), dlySend = createStereo(L)
    for (const tr of spec.tracks) {
        const buf = createStereo(PAD + L + TAIL)
        tr.notes.forEach((n, idx) => {
            let tb = n.t
            const sixteenth = Math.round(n.t * 4 * 1000) / 1000
            if (spec.swing && Number.isInteger(sixteenth) && sixteenth % 2 === 1) tb += spec.swing * 0.25
            const rng = new Rng(`${spec.id}:${tr.name}:${idx}`)
            const jitter = tr.humanize ? Math.round(rng.bi() * tr.humanize * SR / 1000) : 0
            tr.inst(buf, { start: PAD + at(tb) + jitter, length: Math.max(1, at(n.d)), freq: mtof(n.m), vel: n.v ?? 0.8, pan: n.pan, rng })
        })
        // fold: buffer index i ↔ loop position (i - PAD) mod L
        const shifted = createStereo(buf.l.length)
        shifted.l.set(buf.l.subarray(PAD)); shifted.r.set(buf.r.subarray(PAD))
        let loop = fold(shifted, L)
        for (let i = 0; i < PAD; i++) { const j = L - PAD + i; loop.l[j] += buf.l[i]; loop.r[j] += buf.r[i] }
        if (tr.post) loop = tr.post(loop, L)
        if (tr.eq) { const bands = tr.eq; loop = processWrapped(loop, b => eq(b, bands), 0.2) }
        if (tr.sidechain) for (let i = 0; i < L; i++) { const g = 1 - tr.sidechain * sc[i]; loop.l[i] *= g; loop.r[i] *= g }
        mixInto(tr.drum ? drums : mix, loop, 0, tr.gain)
        if (tr.reverb) mixInto(revSend, loop, 0, tr.gain * tr.reverb)
        if (tr.delay) mixInto(dlySend, loop, 0, tr.gain * tr.delay)
    }
    const drumBus = processWrapped(drums, b => saturate(compress(b, { threshold: -14, ratio: 3, attack: 0.006, release: 0.12, makeup: 2 }), 1.4, 0.35), 1)
    mixInto(mix, drumBus)
    const dly = processWrapped(dlySend, b => pingPong(b, spec.delayBeats * beat, spec.delayFeedback ?? 0.38), 12)
    mixInto(mix, dly)
    mixInto(revSend, dly, 0, 0.35)
    mixInto(mix, processWrapped(revSend, b => reverb(b, spec.reverb), 10))
    return { loop: masterLoop(mix, spec), loopSamples: L, bpm: spec.bpm, bars: spec.bars }
}

function masterLoop(mix: Stereo, spec: SongSpec): Stereo {
    let loop = processWrapped(mix, b => eq(b, [{ kind: 'highpass', freq: 28, q: 0.7 }, ...(spec.eq ?? [])]), 1)
    if (spec.width) loop = width(loop, spec.width)
    const pre = loudness(loop).integrated
    scale(loop, dbToGain(-20 - pre))
    loop = processWrapped(loop, b => compress(b, { threshold: -21, ratio: 2, attack: 0.012, release: 0.18, knee: 8 }), 2)
    for (let pass = 0; pass < 3; pass++) {
        const now = loudness(loop).integrated
        scale(loop, dbToGain(spec.targetLufs - now))
        loop = processWrapped(loop, b => limit(b, -1.6, 0.004, 0.15), 1)
    }
    return loop
}

// ── Pattern helpers ─────────────────────────────────────────────────────────

/** Beat position of a 1-based bar. */
const B = (bar: number, beat = 0) => (bar - 1) * 4 + beat
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const VEL: Record<string, number> = { X: 1, x: 0.78, o: 0.56, '-': 0.36 }

/** 16-step pattern per bar ('X' accent, 'x' normal, 'o' soft, '-' ghost, '.' rest). */
function steps(pattern: string, bars: number[], m = 60, d = 0.2, velScale = 1, pan?: (i: number) => number): NoteSpec[] {
    const out: NoteSpec[] = []
    const p = pattern.replace(/\s/g, '')
    for (const bar of bars) for (let i = 0; i < p.length; i++) {
        const v = VEL[p[i]]
        if (v) out.push({ t: B(bar, i * 4 / p.length), d, m, v: v * velScale, pan: pan?.(i) })
    }
    return out
}

/** Chord blocks: [bar, beat, beats, voicing, vel]. */
function blocks(list: [number, number, number, string, number?][], transpose = 0): NoteSpec[] {
    return list.flatMap(([bar, beat, d, voicing, v]) => notes(voicing).map(m => ({ t: B(bar, beat), d, m: m + transpose, v: v ?? 0.7 })))
}

/** Melody: per bar, a list of [beat, beats, note] (note '' = rest). */
function melody(bars: Record<number, [number, number, string][]>, vel = 0.8, transpose = 0): NoteSpec[] {
    const out: NoteSpec[] = []
    for (const [bar, line] of Object.entries(bars)) for (const [beat, d, n] of line) {
        if (n) out.push({ t: B(Number(bar), beat), d, m: midi(n) + transpose, v: vel * (beat % 1 === 0 ? 1 : 0.88) })
    }
    return out
}

/** Arpeggio from a per-bar note set. */
function arp(bars: number[], chordOf: (bar: number) => number[], order: number[], step = 0.25, d = 0.22, accents: number[] = [], vel = 0.6, velOf?: (bar: number) => number): NoteSpec[] {
    const out: NoteSpec[] = []
    const perBar = Math.round(4 / step)
    for (const bar of bars) {
        const set = chordOf(bar)
        for (let i = 0; i < perBar; i++) {
            const m = set[order[i % order.length] % set.length]
            out.push({ t: B(bar, i * step), d, m, v: (accents.includes(i) ? 1 : vel) * (velOf?.(bar) ?? 1) })
        }
    }
    return out
}

function bassLine(bars: number[], rootOf: (bar: number) => string, pattern: string, d = 0.22, octaveSteps: number[] = [], vel = 0.85): NoteSpec[] {
    const out: NoteSpec[] = []
    const p = pattern.replace(/\s/g, '')
    for (const bar of bars) {
        const root = midi(rootOf(bar))
        for (let i = 0; i < p.length; i++) {
            const v = VEL[p[i]]
            if (v) out.push({ t: B(bar, i * 4 / p.length), d, m: root + (octaveSteps.includes(i) ? 12 : 0), v: v * vel })
        }
    }
    return out
}

const chorusPost = (rate: number, depth: number, mix: number) => (b: Stereo, L: number) => processWrapped(b, x => chorus(x, rate, depth, 12, mix, L), 0.2)

// ── MENU: confident, warm synths, light drums (D major, 100 BPM) ────────────

export function menuSong(): SongSpec {
    const pad: Record<number, string> = {
        1: 'D3 A3 C#4 F#4', 2: 'B2 F#3 A3 D4', 3: 'D3 G3 B3 F#4', 4: 'E3 A3 D4 E4', 5: 'D3 A3 C#4 F#4', 6: 'B2 F#3 A3 D4', 7: 'E3 G3 B3 D4', 8: 'G3 B3 D4 E4',
        9: 'D3 G3 B3 F#4', 10: 'E3 A3 C#4 F#4', 11: 'C#3 F#3 A3 E4', 12: 'B2 F#3 A3 D4', 13: 'D3 G3 B3 F#4', 14: 'E3 A3 C#4 E4', 15: 'B2 F#3 A3 D4', 16: 'C#3 E3 A3 E4',
        17: 'D3 F#3 A3 C#4', 18: 'F#3 A3 B3 D4', 19: 'F#3 A3 D4 E4', 20: 'E3 G3 B3 D4', 21: 'D3 F#3 A3 C#4', 22: 'F#3 A3 B3 D4', 23: 'G3 B3 D4 F#4', 24: 'G3 A3 D4 E4',
        25: 'F#3 A3 C#4 E4', 26: 'E3 A3 C#4 E4', 27: 'F#3 A3 B3 D4', 28: 'F#3 G3 B3 D4', 29: 'F#3 A3 C#4 E4', 30: 'E3 A3 C#4 E4', 31: 'F#3 G3 B3 D4', 32: 'E3 A3 D4 E4',
    }
    const root: Record<number, string> = {
        1: 'D2', 2: 'B1', 3: 'G1', 4: 'A1', 5: 'D2', 6: 'B1', 7: 'E2', 8: 'A1', 9: 'G1', 10: 'A1', 11: 'F#1', 12: 'B1', 13: 'G1', 14: 'A1', 15: 'B1', 16: 'C#2',
        17: 'B1', 18: 'G1', 19: 'F#1', 20: 'E2', 21: 'B1', 22: 'G1', 23: 'E2', 24: 'A1', 25: 'D2', 26: 'C#2', 27: 'B1', 28: 'G1', 29: 'D2', 30: 'C#2', 31: 'G1', 32: 'A1',
    }
    // two-chord bars
    const padList: [number, number, number, string, number?][] = []
    for (const bar of range(1, 32)) {
        if (bar === 4 || bar === 32) { padList.push([bar, 0, 2, 'E3 A3 D4 E4', 0.62], [bar, 2, 2, 'E3 A3 C#4 E4', 0.62]) }
        else if (bar === 20) { padList.push([bar, 0, 2, 'E3 G3 B3 D4', 0.62], [bar, 2, 2, 'E3 A3 C#4 E4', 0.62]) }
        else padList.push([bar, 0, 4, pad[bar], bar <= 4 ? 0.45 : bar <= 8 ? 0.52 : bar <= 16 ? 0.6 : bar <= 20 ? 0.4 : bar <= 24 ? 0.5 : 0.66])
    }
    const chordSet = (bar: number) => {
        const v = notes(pad[bar]).map(n => n + 12)
        return [...v, v[1] + 12]
    }
    const arpOrder = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 2, 4, 3, 2]
    const arpNotes = [
        ...arp(range(1, 8), chordSet, arpOrder, 0.25, 0.2, [0, 3, 6, 10], 0.5, b => 0.42 + 0.06 * (b - 1)),
        ...arp(range(9, 16), chordSet, arpOrder, 0.5, 0.3, [0, 3, 5], 0.5, () => 0.6),
        ...arp(range(21, 24), chordSet, arpOrder, 0.25, 0.2, [0, 3, 6, 10], 0.45, b => 0.5 + 0.12 * (b - 21)),
        ...arp(range(25, 32), chordSet, arpOrder, 0.25, 0.2, [0, 3, 6, 10], 0.5, () => 0.85),
    ]
    const leadB: Record<number, [number, number, string][]> = {
        9: [[0, 1.5, 'F#5'], [1.5, 0.5, 'E5'], [2, 1, 'D5'], [3, 1, 'B4']],
        10: [[0, 1.5, 'C#5'], [1.5, 0.5, 'D5'], [2, 2, 'E5']],
        11: [[0, 1, 'A5'], [1, 1, 'F#5'], [2, 1, 'E5'], [3, 1, 'C#5']],
        12: [[0, 3, 'D5']],
        13: [[0, 1.5, 'F#5'], [1.5, 0.5, 'E5'], [2, 1, 'D5'], [3, 0.5, 'B4'], [3.5, 0.5, 'D5']],
        14: [[0, 1.5, 'E5'], [1.5, 0.5, 'F#5'], [2, 2, 'A5']],
        15: [[0, 1, 'B5'], [1, 0.5, 'A5'], [1.5, 0.5, 'F#5'], [2, 1, 'E5'], [3, 1, 'D5']],
        16: [[0, 3.5, 'E5']],
    }
    const leadD: Record<number, [number, number, string][]> = {
        25: [[0, 1, 'A5'], [1, 0.5, 'F#5'], [1.5, 0.5, 'A5'], [2, 1, 'B5'], [3, 1, 'A5']],
        26: [[0, 1.5, 'E5'], [1.5, 0.5, 'F#5'], [2, 1, 'E5'], [3, 1, 'C#5']],
        27: [[0, 1, 'D5'], [1, 0.5, 'F#5'], [1.5, 1.5, 'B5'], [3, 1, 'A5']],
        28: [[0, 3, 'F#5'], [3, 1, 'E5']],
        29: [[0, 1, 'A5'], [1, 0.5, 'F#5'], [1.5, 0.5, 'A5'], [2, 1, 'D6'], [3, 0.5, 'C#6'], [3.5, 0.5, 'B5']],
        30: [[0, 2, 'A5'], [2, 1, 'E5'], [3, 1, 'F#5']],
        31: [[0, 1, 'G5'], [1, 1, 'F#5'], [2, 1, 'E5'], [3, 1, 'D5']],
        32: [[0, 2, 'E5'], [2, 1.75, 'C#5']],
    }
    const counter: Record<number, [number, number, string][]> = {
        17: [[0, 1, 'D5'], [1, 1, 'C#5'], [2, 2, 'B4']], 18: [[0, 1, 'D5'], [1, 1, 'E5'], [2, 2, 'F#5']],
        19: [[0, 3, 'A5']], 20: [[0, 1, 'G5'], [1, 1, 'F#5'], [2, 2, 'E5']],
        21: [[0, 1, 'D5'], [1, 1, 'C#5'], [2, 2, 'B4']], 22: [[0, 1, 'D5'], [1, 1, 'E5'], [2, 2, 'F#5']],
        23: [[0, 1, 'G5'], [1, 1, 'F#5'], [2, 1, 'E5'], [3, 1, 'D5']], 24: [[0, 4, 'E5']],
    }
    const bassNotes = [
        ...range(1, 8).flatMap(bar => [{ t: B(bar, 0), d: 1.8, m: midi(root[bar]), v: bar <= 4 ? 0.6 : 0.75 }, { t: B(bar, 2), d: 1.3, m: midi(root[bar]), v: bar <= 4 ? 0.5 : 0.65 }, { t: B(bar, 3.5), d: 0.4, m: midi(root[bar]) + 12, v: 0.45 }]),
        ...bassLine(range(9, 16), b => root[b], 'X..x..x.X..x.x..', 0.2, [6, 13]),
        ...bassLine(range(21, 24), b => root[b], 'x.x.x.x.x.x.x.x.', 0.22, [], 0.6),
        ...bassLine(range(25, 32), b => root[b], 'X..x..x.X..x.x..', 0.2, [6, 13]),
    ]
    const kickNotes = [
        ...steps('X.......X.......', range(1, 4), 60, 0.2, 0.7),
        ...steps('X.......X.......', range(5, 8), 60, 0.2, 0.85),
        ...steps('X.....x.X.......', range(9, 16)),
        ...steps('X.......X.......', range(21, 23)),
        ...steps('X...X...X...X...', [24]),
        ...steps('X.....x.X.......', range(25, 31)),
        ...steps('X.....x.X.......', [32]),
    ]
    const kickBeats = kickNotes.map(n => n.t)
    const tracks: TrackSpec[] = [
        { name: 'pad', inst: supersaw({ voices: 7, detune: 15, cutoff: 3000, cutoffEnv: 0.45, filterAttack: 0.6, filterDecay: 1.5, a: 0.5, d: 1.4, s: 0.78, r: 1.3, gain: 0.95 }), notes: blocks(padList), gain: 0.3, reverb: 0.55, sidechain: 0.32, post: chorusPost(0.45, 2.5, 0.45), eq: [{ kind: 'highpass', freq: 190 }] },
        { name: 'arp', inst: pluck({ cutoff: 1300, envAmt: 5200, decay: 0.11, ampDecay: 0.24, q: 1.3, detune: 9 }), notes: arpNotes.map((n, i) => ({ ...n, pan: Math.sin(i * 0.7) * 0.45 })), gain: 0.28, reverb: 0.35, delay: 0.32, sidechain: 0.4, eq: [{ kind: 'highpass', freq: 280 }] },
        { name: 'bass', inst: bass({ cutoff: 420, envAmt: 1200, decay: 0.12, drive: 1.8, sub: 0.6, saw: 0.65, release: 0.07 }), notes: bassNotes, gain: 0.56, sidechain: 0.45 },
        { name: 'lead', inst: lead({ cutoff: 2600, envAmt: 1.1, a: 0.012, d: 0.4, s: 0.72, r: 0.3, vibrato: 13, detune: 8, octave: 0.25 }), notes: [...melody(leadB, 0.78), ...melody(leadD, 0.85)], gain: 0.32, reverb: 0.4, delay: 0.26, eq: [{ kind: 'highpass', freq: 250 }] },
        { name: 'lead-oct', inst: bell({ ratio: 3.5, index: 1.4, decay: 0.9 }), notes: melody(leadD, 0.55, 12), gain: 0.12, reverb: 0.5, delay: 0.3 },
        { name: 'counter', inst: bell({ ratio: 3.5, index: 1.7, decay: 1.4 }), notes: melody(counter, 0.7), gain: 0.28, reverb: 0.6, delay: 0.35 },
        { name: 'kick', inst: kick({ pitch: 140, end: 48, decay: 0.24, click: 0.4, drive: 1.6 }), notes: kickNotes, gain: 0.72, drum: true },
        { name: 'clap', inst: clap({ tail: 0.11 }), notes: [...steps('....o.......o...', range(5, 8)), ...steps('....x.......x...', range(9, 16)), ...steps('....x.......x...', range(25, 32))], gain: 0.5, reverb: 0.35, drum: true, humanize: 4 },
        { name: 'snare', inst: snare({ snap: 0.14, tone: 0.7 }), notes: [...steps('............o...', range(17, 22), 60, 0.2, 0.7), ...steps('o.o.o.o.x.x.xxxx', [24], 60, 0.2, 0.75), ...steps('........x.x.xxXX', [32], 60, 0.2, 0.7)], gain: 0.34, reverb: 0.3, drum: true },
        { name: 'hat', inst: hat({ decay: 0.03 }), notes: [...steps('..o...o...o...o.', range(5, 8), 60, 0.1, 0.8, i => (i % 8 < 4 ? -0.3 : 0.3)), ...steps('-.x--.x--.x--.x-', range(9, 16), 60, 0.1, 0.8, i => (i % 2 ? 0.3 : -0.2)), ...steps('-.x--.x--.x--.x-', range(25, 32), 60, 0.1, 0.85, i => (i % 2 ? 0.3 : -0.2))], gain: 0.55, drum: true, humanize: 3 },
        { name: 'ohat', inst: hat({ decay: 0.22 }), notes: steps('..............o.', [12, 16, 26, 28, 30], 60, 0.1, 0.8, () => 0.35), gain: 0.4, drum: true },
        { name: 'shaker', inst: shaker({ decay: 0.05 }), notes: [...steps('o-x-o-x-o-x-o-x-', range(1, 8), 60, 0.1, 0.6), ...steps('o-x-o-x-o-x-o-x-', range(17, 24), 60, 0.1, 0.65)], gain: 0.4, drum: true, humanize: 5, post: b => width(b, 1.2) },
        { name: 'tom', inst: tom({ decay: 0.28 }), notes: [{ t: B(32, 2), d: 0.2, m: midi('A2'), v: 0.8, pan: -0.4 }, { t: B(32, 2.5), d: 0.2, m: midi('F#2'), v: 0.8, pan: 0 }, { t: B(32, 3), d: 0.2, m: midi('D2'), v: 0.9, pan: 0.4 }], gain: 0.45, reverb: 0.3, drum: true },
        { name: 'crash', inst: crash({ decay: 1.8 }), notes: [{ t: B(1), d: 1, m: 60, v: 0.55 }, { t: B(9), d: 1, m: 60, v: 0.65 }, { t: B(25), d: 1, m: 60, v: 0.8 }, { t: B(29), d: 1, m: 60, v: 0.55 }], gain: 0.45, reverb: 0.3, drum: true },
        { name: 'rev', inst: crash({ reverse: true, length: 2.4, decay: 1.6 }), notes: [{ t: B(32, 4) - 2.4 / (60 / 100), d: 1, m: 60, v: 0.7 }, { t: B(25) - 2.4 / (60 / 100), d: 1, m: 60, v: 0.6 }], gain: 0.2, reverb: 0.4 },
        { name: 'riser', inst: riser({ from: 300, to: 7000, q: 2.4 }), notes: [{ t: B(23), d: 8, m: 48, v: 0.6 }], gain: 0.16, reverb: 0.5 },
    ]
    return { id: 'menu', bpm: 100, bars: 32, swing: 0.06, tracks, kicks: kickBeats, delayBeats: 0.75, delayFeedback: 0.35, reverb: { room: 0.82, damp: 0.4, width: 1, preDelay: 0.025, lowCut: 220, highCut: 11000 }, eq: [{ kind: 'lowshelf', freq: 90, gain: -2 }, { kind: 'highshelf', freq: 6000, gain: 4 }], targetLufs: -16, width: 1.05 }
}

// ── CAREER: calm, low-energy ambient groove (C major, 88 BPM) ───────────────

export function careerSong(): SongSpec {
    const A: Record<number, string> = { 1: 'A3 C4 E4 G4', 2: 'G3 B3 D4 E4', 3: 'F3 A3 C4 E4', 4: 'E3 G3 B3 D4', 5: 'A3 C4 E4 G4', 6: 'G3 B3 D4 E4', 7: 'G3 B3 C4 E4', 8: 'F3 A3 C4 D4' }
    const Bv: Record<number, string> = { 1: 'F3 A3 C4 E4', 2: 'G3 B3 D4 E4', 3: 'F3 A3 C4 E4', 4: 'G3 B3 D4 E4', 5: 'G3 B3 C4 E4', 6: 'G3 B3 D4 E4', 7: 'A3 C4 E4 G4', 8: 'G3 C4 D4 F4' }
    const rootA: Record<number, string> = { 1: 'F2', 2: 'E2', 3: 'D2', 4: 'C2', 5: 'F2', 6: 'E2', 7: 'A1', 8: 'G1' }
    const rootB: Record<number, string> = { 1: 'D2', 2: 'E2', 3: 'F2', 4: 'G1', 5: 'A1', 6: 'E2', 7: 'F2', 8: 'G1' }
    const voicing = (bar: number) => { const i = ((bar - 1) % 8) + 1; return ((bar - 1) % 16) < 8 ? A[i] : Bv[i] }
    const rootOf = (bar: number) => { const i = ((bar - 1) % 8) + 1; return ((bar - 1) % 16) < 8 ? rootA[i] : rootB[i] }
    const comp: NoteSpec[] = []
    for (const bar of range(1, 32)) {
        const v = notes(voicing(bar))
        if (bar >= 17 && bar <= 24) {
            // broken-chord variation
            const order = [0, 2, 1, 3, 2, 1, 3, 2]
            order.forEach((k, i) => comp.push({ t: B(bar, i * 0.5), d: 0.9, m: v[k] + (i >= 4 && k === 3 ? 12 : 0), v: 0.42 + (i % 2 ? 0 : 0.12) }))
        } else {
            for (const [beat, d, vel] of [[0, 1.4, 0.66], [1.5, 0.9, 0.46], [2.75, 1.1, 0.56]] as [number, number, number][]) {
                v.forEach((m, k) => comp.push({ t: B(bar, beat) + k * 0.012, d, m, v: vel }))
            }
            if (bar === 16 || bar === 32) comp.push(...v.map(m => ({ t: B(bar, 2), d: 1.8, m: m + 12, v: 0.3 })))
        }
    }
    const padNotes: NoteSpec[] = range(1, 32).flatMap(bar => notes(voicing(bar)).map(m => ({ t: B(bar), d: 4, m: m + 12, v: bar >= 17 && bar <= 24 ? 0.5 : 0.36 })))
    const bassNotes: NoteSpec[] = range(1, 32).flatMap(bar => {
        const r = midi(rootOf(bar))
        if (bar <= 4) return [{ t: B(bar, 0), d: 3.6, m: r, v: 0.6 }]
        return [{ t: B(bar, 0), d: 1.6, m: r, v: 0.75 }, { t: B(bar, 2.5), d: 0.5, m: r, v: 0.55 }, { t: B(bar, 3), d: 0.8, m: r + (bar % 2 ? 7 : 12), v: 0.5 }]
    })
    const melodyB: Record<number, [number, number, string][]> = {
        25: [[0, 1.5, 'A5'], [1.5, 0.5, 'C6'], [2, 1, 'A5'], [3, 1, 'G5']],
        26: [[0, 2, 'E5'], [2, 1, 'G5'], [3, 1, 'B5']],
        27: [[0, 1.5, 'A5'], [1.5, 0.5, 'G5'], [2, 2, 'E5']],
        28: [[0, 3, 'D5']],
        29: [[0, 1.5, 'C6'], [1.5, 0.5, 'B5'], [2, 1, 'A5'], [3, 1, 'E5']],
        30: [[0, 1.5, 'G5'], [1.5, 0.5, 'A5'], [2, 2, 'B5']],
        31: [[0, 1, 'C6'], [1, 1, 'A5'], [2, 1, 'G5'], [3, 1, 'E5']],
        32: [[0, 2.5, 'D5']],
    }
    const sparkle: Record<number, [number, number, string][]> = {
        10: [[2.5, 1, 'B5']], 12: [[3, 1, 'D6']], 14: [[2.5, 1, 'G5']], 16: [[2, 1, 'F5'], [3, 1, 'D5']],
    }
    const kickNotes = [
        ...steps('X.........x.....', range(5, 8)),
        ...steps('X.........x..x..', range(9, 16)),
        ...steps('X.......o.......', range(17, 20)),
        ...steps('X.........x.....', range(21, 24)),
        ...steps('X.........x..x..', range(25, 32)),
    ]
    const tracks: TrackSpec[] = [
        { name: 'ep', inst: epiano({ decay: 2.6, bright: 1.05 }), notes: comp, gain: 0.55, reverb: 0.4, delay: 0.12, sidechain: 0.15, humanize: 6, post: (b, L) => processWrapped(autopan(b, 32 * 2, 0.22), x => chorus(x, 0.4, 2, 10, 0.3, L), 0.2), eq: [{ kind: 'highpass', freq: 140 }] },
        { name: 'pad', inst: supersaw({ voices: 5, detune: 10, cutoff: 2000, a: 1.2, d: 2, s: 0.8, r: 2, gain: 0.8, shape: 'tri' }), notes: padNotes, gain: 0.24, reverb: 0.7, sidechain: 0.2, post: chorusPost(0.3, 3, 0.5), eq: [{ kind: 'highpass', freq: 220 }] },
        { name: 'bass', inst: bass({ cutoff: 320, envAmt: 480, decay: 0.15, drive: 1.3, sub: 0.7, saw: 0.42, release: 0.12, attack: 0.008 }), notes: bassNotes, gain: 0.58, sidechain: 0.25 },
        { name: 'flute', inst: softSine({ a: 0.06, d: 0.4, s: 0.85, r: 0.35, tri: 0.35, vibrato: 10, breath: 0.08 }), notes: melody(melodyB, 0.7), gain: 0.3, reverb: 0.55, delay: 0.3 },
        { name: 'bell', inst: bell({ ratio: 4.0, index: 1.2, decay: 1.6 }), notes: melody(sparkle, 0.5), gain: 0.22, reverb: 0.7, delay: 0.4 },
        { name: 'kick', inst: kick({ pitch: 115, end: 48, decay: 0.26, click: 0.12, drive: 1.2 }), notes: kickNotes, gain: 0.7, drum: true },
        { name: 'snare', inst: snare({ snap: 0.12, tone: 0.55, noise: 0.6, color: 3200 }), notes: [...steps('....o.......o...', range(5, 8)), ...steps('....x.......x..-', range(9, 16)), ...steps('....o.......o...', range(21, 24)), ...steps('....x.......x..-', range(25, 32))], gain: 0.36, reverb: 0.45, drum: true, humanize: 6 },
        { name: 'rim', inst: rim({ pitch: 1500 }), notes: [...steps('............o...', range(1, 4)), ...steps('......-.....o...', range(17, 20))], gain: 0.34, reverb: 0.4, drum: true, humanize: 4 },
        { name: 'hat', inst: hat({ decay: 0.025, tone: 1.5 }), notes: [...steps('..o...o...o...o.', range(9, 16), 60, 0.1, 0.7, i => (i % 4 === 2 ? 0.25 : -0.15)), ...steps('..o...o...o...o.', range(21, 32), 60, 0.1, 0.7, i => (i % 4 === 2 ? 0.25 : -0.15))], gain: 0.38, drum: true, humanize: 5 },
        { name: 'shaker', inst: shaker({ decay: 0.06 }), notes: steps('o-x-o-x-o-x-o-x-', range(1, 32), 60, 0.1, 0.5), gain: 0.3, drum: true, humanize: 6, post: b => width(b, 1.3) },
    ]
    return { id: 'career', bpm: 88, bars: 32, swing: 0.16, tracks, kicks: kickNotes.map(n => n.t), sidechainRelease: 0.5, delayBeats: 0.75, delayFeedback: 0.3, reverb: { room: 0.86, damp: 0.5, width: 1, preDelay: 0.03, lowCut: 200, highCut: 9000 }, eq: [{ kind: 'highshelf', freq: 7000, gain: 3 }, { kind: 'lowshelf', freq: 90, gain: -1.5 }, { kind: 'peak', freq: 2500, q: 0.8, gain: 2 }], targetLufs: -16 }
}

// ── MATCH: tense low pulse (D minor, 120 BPM) ───────────────────────────────

export function matchSong(): SongSpec {
    // two-bar harmony per section
    const harmony: Record<string, [string, string][]> = {
        A: [['D2', 'D3 F3 A3'], ['D2', 'D3 F3 A3'], ['D2', 'D3 F3 A3'], ['D2', 'D3 F3 A3']],
        B: [['D2', 'D3 F3 A3'], ['Bb1', 'D3 F3 Bb3'], ['G1', 'D3 G3 Bb3'], ['A1', 'C#3 E3 A3']],
        C: [['D2', 'D3 F3 A3'], ['Bb1', 'D3 F3 Bb3'], ['D2', 'D3 F3 A3'], ['A1', 'C#3 E3 A3']],
        D: [['D2', 'D3 F3 A3'], ['Bb1', 'D3 F3 Bb3'], ['G1', 'D3 G3 Bb3'], ['A1', 'C#3 E3 A3']],
        E: [['D2', 'D3 F3 A3'], ['D2', 'Eb3 G3 Bb3'], ['D2', 'D3 F3 A3'], ['A1', 'C#3 E3 A3']],
    }
    const sections = ['A', 'B', 'C', 'D', 'E']
    const at = (bar: number) => { const s = sections[Math.floor((bar - 1) / 8)]; return harmony[s][Math.floor(((bar - 1) % 8) / 2)] }
    // pulse: 16ths, filter opening within each section (param through velocity on a separate brightness map)
    const pulse: NoteSpec[] = []
    for (const bar of range(1, 40)) {
        const sec8 = Math.floor((bar - 1) / 8), inSec = (bar - 1) % 8
        const r = midi(at(bar)[0]) + 12
        const isC = sec8 === 2
        const stepsPerBar = isC ? 8 : 16
        for (let i = 0; i < stepsPerBar; i++) {
            const accent = isC ? i % 4 === 0 : (i % 4 === 0 || i === 7 || i === 13)
            const up = !isC && (i === 6 || i === 14)
            const base = sec8 === 3 ? 0.85 : sec8 === 4 ? 0.7 - inSec * 0.03 : 0.55 + inSec * 0.04
            pulse.push({ t: B(bar, i * 4 / stepsPerBar), d: isC ? 0.4 : 0.18, m: r + (up ? 12 : 0), v: (accent ? 1 : 0.72) * base })
        }
    }
    const drone: NoteSpec[] = range(0, 19).flatMap(k => {
        const bar = 1 + k * 2
        return notes(at(bar)[1]).map(m => ({ t: B(bar), d: 8, m: m - 12, v: 0.55 }))
    })
    const tension: NoteSpec[] = [
        ...[17, 21].flatMap(bar => [{ t: B(bar), d: 8, m: midi('A4'), v: 0.5 }, { t: B(bar), d: 8, m: midi('Bb4'), v: 0.42 }, { t: B(bar + 2), d: 6, m: midi('D5'), v: 0.35 }]),
        ...[25, 29].flatMap(bar => [{ t: B(bar), d: 8, m: midi('F4'), v: 0.42 }, { t: B(bar), d: 8, m: midi('A4'), v: 0.42 }]),
    ]
    const stabs: NoteSpec[] = range(25, 32).flatMap(bar => notes(at(bar)[1]).flatMap(m => [0.75, 1.75, 2.75, 3.5].map(beat => ({ t: B(bar, beat), d: 0.18, m: m + 12, v: beat === 3.5 ? 0.55 : 0.7 }))))
    const kickNotes = [
        ...steps('X...............', range(1, 8), 60, 0.2, 0.65),
        ...steps('X.......X.....x.', range(9, 16)),
        ...steps('X..x............', range(17, 24), 60, 0.2, 0.75),
        ...steps('X...X...X...X...', range(25, 32)),
        ...steps('X.......X.......', range(33, 38), 60, 0.2, 0.8),
        ...steps('X...............', range(39, 40), 60, 0.2, 0.65),
    ]
    const tracks: TrackSpec[] = [
        { name: 'pulse', inst: bass({ cutoff: 650, envAmt: 2600, decay: 0.05, q: 1.6, drive: 2, sub: 0.15, saw: 0.8, square: 0.15, release: 0.03 }), notes: pulse, gain: 0.5, sidechain: 0.4, reverb: 0.08, delay: 0.06 },
        { name: 'sub', inst: softSine({ a: 0.3, d: 1, s: 0.9, r: 0.8 }), notes: range(0, 19).map(k => ({ t: B(1 + k * 2), d: 8, m: midi(at(1 + k * 2)[0]) - 12, v: 0.7 })), gain: 0.26, sidechain: 0.5 },
        { name: 'drone', inst: supersaw({ voices: 5, detune: 12, cutoff: 800, a: 1.5, d: 2, s: 0.85, r: 2, gain: 0.9 }), notes: drone, gain: 0.32, reverb: 0.5, sidechain: 0.3, post: chorusPost(0.25, 3, 0.4), eq: [{ kind: 'highpass', freq: 110 }] },
        { name: 'tension', inst: supersaw({ voices: 7, detune: 9, cutoff: 4200, a: 2.4, d: 2, s: 0.9, r: 2.5, gain: 0.7 }), notes: tension, gain: 0.2, reverb: 0.7, post: chorusPost(0.2, 4, 0.5) },
        { name: 'stab', inst: pluck({ cutoff: 700, envAmt: 2600, decay: 0.05, ampDecay: 0.14, q: 1.8, detune: 12, shape: 'square' }), notes: stabs, gain: 0.18, reverb: 0.4, delay: 0.3 },
        { name: 'kick', inst: kick({ pitch: 120, end: 46, decay: 0.28, click: 0.2, drive: 1.4 }), notes: kickNotes, gain: 0.5, drum: true, eq: [{ kind: 'lowpass', freq: 4000, q: 0.7 }] },
        { name: 'tick', inst: hat({ decay: 0.018, tone: 1.9, metal: 0.4 }), notes: [...steps('o-x-o-x-o-x-o-x-', range(1, 16), 60, 0.1, 0.55, i => (i % 2 ? 0.35 : -0.35)), ...steps('o-x-o-x-o-x-o-x-', range(25, 40), 60, 0.1, 0.6, i => (i % 2 ? 0.35 : -0.35))], gain: 0.34, drum: true },
        { name: 'clock', inst: rim({ pitch: 2100 }), notes: steps('x.o.x.o.x.o.x.o.', range(17, 24), 60, 0.1, 0.5, i => (i % 4 ? 0.4 : -0.4)), gain: 0.26, reverb: 0.3, drum: true },
        { name: 'snare', inst: snare({ snap: 0.2, tone: 0.5, noise: 0.85, color: 3000 }), notes: steps('........x.......', range(25, 32)), gain: 0.36, reverb: 0.55, drum: true },
        { name: 'tom', inst: tom({ decay: 0.4, bend: 0.4 }), notes: [
            ...[12, 16].flatMap(bar => [{ t: B(bar, 3.5), d: 0.2, m: midi('D2'), v: 0.7 }]),
            ...[28, 32].flatMap(bar => [{ t: B(bar, 2), d: 0.2, m: midi('A2'), v: 0.7, pan: -0.3 }, { t: B(bar, 2.75), d: 0.2, m: midi('F2'), v: 0.75 }, { t: B(bar, 3.5), d: 0.2, m: midi('D2'), v: 0.85, pan: 0.3 }]),
        ], gain: 0.5, reverb: 0.4, drum: true },
        { name: 'swell', inst: riser({ from: 200, to: 4000, q: 3, tonal: 0 }), notes: [{ t: B(23), d: 8, m: 50, v: 0.6 }, { t: B(39), d: 8, m: 50, v: 0.4 }], gain: 0.13, reverb: 0.6 },
    ]
    return { id: 'match', bpm: 120, bars: 40, tracks, kicks: kickNotes.map(n => n.t), sidechainRelease: 0.6, delayBeats: 0.75, delayFeedback: 0.32, reverb: { room: 0.84, damp: 0.5, width: 1, preDelay: 0.02, lowCut: 250, highCut: 9000 }, eq: [{ kind: 'lowshelf', freq: 100, gain: -3 }, { kind: 'highshelf', freq: 6000, gain: 3 }, { kind: 'peak', freq: 300, q: 0.8, gain: -1.5 }], targetLufs: -16 }
}

// ── CELEBRATION: short triumphant loop (D major, 120 BPM) ───────────────────

export function celebrationSong(): SongSpec {
    const prog: Record<number, string> = {
        1: 'D4 F#4 A4', 2: 'C#4 E4 A4', 3: 'B3 D4 F#4', 4: 'B3 D4 G4', 5: 'A3 D4 F#4', 6: 'B3 D4 G4', 7: 'C#4 E4 A4', 8: 'C#4 E4 A4',
        9: 'B3 D4 G4', 10: 'C#4 E4 A4', 11: 'C#4 F#4 A4', 12: 'B3 D4 F#4', 13: 'B3 D4 G4', 14: 'C#4 E4 A4', 15: 'D4 F#4 A4', 16: 'D4 F#4 A4',
        17: 'B3 D4 F#4', 18: 'B3 D4 G4', 19: 'A3 D4 F#4', 20: 'A3 C#4 E4', 21: 'B3 D4 F#4', 22: 'B3 D4 G4', 23: 'A3 D4 F#4', 24: 'A3 C#4 E4',
        25: 'B3 D4 G4', 26: 'C#4 E4 A4', 27: 'C#4 F#4 A4', 28: 'B3 D4 F#4', 29: 'B3 D4 G4', 30: 'C#4 E4 A4', 31: 'D4 F#4 A4', 32: 'C#4 E4 G4',
    }
    const roots: Record<number, string> = {
        1: 'D2', 2: 'C#2', 3: 'B1', 4: 'G1', 5: 'F#1', 6: 'G1', 7: 'A1', 8: 'A1', 9: 'G1', 10: 'A1', 11: 'F#1', 12: 'B1', 13: 'G1', 14: 'A1', 15: 'D2', 16: 'D2',
        17: 'B1', 18: 'G1', 19: 'D2', 20: 'A1', 21: 'B1', 22: 'G1', 23: 'D2', 24: 'A1', 25: 'G1', 26: 'A1', 27: 'F#1', 28: 'B1', 29: 'G1', 30: 'A1', 31: 'D2', 32: 'A1',
    }
    const stabRhythm: [number, number, number][] = [[0, 0.45, 0.95], [0.75, 0.35, 0.7], [1.5, 0.45, 0.8], [2.5, 0.9, 0.9], [3.5, 0.35, 0.7]]
    const stabs: NoteSpec[] = [...range(1, 8), ...range(25, 32)].flatMap(bar => stabRhythm.flatMap(([beat, d, v]) => notes(prog[bar]).map(m => ({ t: B(bar, beat), d, m, v }))))
    const padNotes: NoteSpec[] = range(1, 32).flatMap(bar => notes(prog[bar]).map(m => ({ t: B(bar), d: 4, m: m - 12, v: bar >= 17 && bar <= 24 ? 0.7 : 0.5 })))
    const fanfare: Record<number, [number, number, string][]> = {
        9: [[0, 0.5, 'D5'], [0.5, 0.5, 'D5'], [1, 1.5, 'G5'], [2.5, 0.5, 'F#5'], [3, 1, 'G5']],
        10: [[0, 2, 'A5'], [2, 1, 'E5'], [3, 1, 'A5']],
        11: [[0, 1, 'A5'], [1, 0.5, 'F#5'], [1.5, 0.5, 'A5'], [2, 2, 'C#6']],
        12: [[0, 3, 'B5'], [3, 1, 'F#5']],
        13: [[0, 1, 'G5'], [1, 1, 'B5'], [2, 1.5, 'D6'], [3.5, 0.5, 'C#6']],
        14: [[0, 1, 'C#6'], [1, 0.5, 'B5'], [1.5, 0.5, 'A5'], [2, 2, 'E6']],
        15: [[0, 2, 'D6'], [2, 1, 'A5'], [3, 1, 'F#5']],
        16: [[0, 3.5, 'D6']],
    }
    const fanfareD: Record<number, [number, number, string][]> = {}
    for (const [bar, line] of Object.entries(fanfare)) fanfareD[Number(bar) + 16] = line
    fanfareD[32] = [[0, 2, 'D6'], [2, 1, 'C#6'], [3, 1, 'E6']]
    const bells: NoteSpec[] = arp(range(17, 24), bar => notes(prog[bar]).map(m => m + 24), [0, 1, 2, 1, 2, 0, 1, 2], 0.5, 0.4, [0], 0.5)
    const bassNotes = bassLine([...range(1, 16), ...range(25, 32)], b => roots[b], 'x.x.x.x.x.x.x.x.', 0.2, [2, 6, 10, 14], 0.85)
        .concat(range(17, 24).flatMap(bar => [{ t: B(bar, 0), d: 1.8, m: midi(roots[bar]), v: 0.85 }, { t: B(bar, 2), d: 1.8, m: midi(roots[bar]), v: 0.75 }]))
    const kickNotes = [...steps('X...X...X...X...', [...range(1, 16), ...range(25, 32)]), ...steps('X.......X.......', range(17, 23)), ...steps('X...X...X...X...', [24])]
    const tracks: TrackSpec[] = [
        { name: 'brass', inst: brass({ cutoff: 1300, envAmt: 2.6, a: 0.02, d: 0.25, s: 0.6, r: 0.18, voices: 3, detune: 10 }), notes: stabs, gain: 0.42, reverb: 0.35, sidechain: 0.3, eq: [{ kind: 'highpass', freq: 150 }] },
        { name: 'pad', inst: supersaw({ voices: 7, detune: 18, cutoff: 3600, a: 0.3, d: 1, s: 0.8, r: 0.9, gain: 0.9 }), notes: padNotes, gain: 0.26, reverb: 0.5, sidechain: 0.45, post: chorusPost(0.5, 2.5, 0.4), eq: [{ kind: 'highpass', freq: 200 }] },
        { name: 'lead', inst: brass({ cutoff: 1500, envAmt: 2, a: 0.03, d: 0.3, s: 0.8, r: 0.2, voices: 3, detune: 7 }), notes: [...melody(fanfare, 0.85), ...melody(fanfareD, 0.9)], gain: 0.4, reverb: 0.4, delay: 0.18 },
        { name: 'lead-low', inst: lead({ cutoff: 1400, a: 0.02, d: 0.3, s: 0.7, r: 0.2, vibrato: 10 }), notes: melody(fanfareD, 0.6, -12), gain: 0.25, reverb: 0.35 },
        { name: 'bell', inst: bell({ ratio: 3.5, index: 2, decay: 1.1 }), notes: [...melody(fanfare, 0.45, 12), ...bells], gain: 0.16, reverb: 0.55, delay: 0.3 },
        { name: 'bass', inst: bass({ cutoff: 480, envAmt: 1300, decay: 0.1, drive: 1.8, sub: 0.55, saw: 0.7 }), notes: bassNotes, gain: 0.55, sidechain: 0.5 },
        { name: 'kick', inst: kick({ pitch: 150, end: 50, decay: 0.24, click: 0.4, drive: 1.8 }), notes: kickNotes, gain: 0.7, drum: true },
        { name: 'clap', inst: clap({ tail: 0.14 }), notes: [...steps('....X.......X...', range(1, 32))], gain: 0.55, reverb: 0.4, drum: true, humanize: 3 },
        { name: 'snare', inst: snare({ snap: 0.15 }), notes: [...steps('....x.......x...', [...range(9, 16), ...range(25, 32)], 60, 0.2, 0.7), ...steps('x.x.x.x.xxxxXXXX', [24], 60, 0.2, 0.8), ...steps('........x.xxXXXX', [16, 32], 60, 0.2, 0.7)], gain: 0.32, reverb: 0.35, drum: true },
        { name: 'hat', inst: hat({ decay: 0.03 }), notes: steps('-.x--.x--.x--.x-', range(1, 32), 60, 0.1, 0.85, i => (i % 2 ? 0.3 : -0.25)), gain: 0.48, drum: true, humanize: 3 },
        { name: 'ohat', inst: hat({ decay: 0.2 }), notes: steps('..x...x...x...x.', [...range(1, 16), ...range(25, 32)], 60, 0.1, 0.75, () => 0.3), gain: 0.36, drum: true },
        { name: 'crash', inst: crash({ decay: 2 }), notes: [1, 9, 17, 25, 29].map(bar => ({ t: B(bar), d: 1, m: 60, v: 0.8 })), gain: 0.45, reverb: 0.35, drum: true },
        { name: 'crowd', inst: crowd({ claps: 90, attack: 3, release: 4 }), notes: [{ t: B(17), d: 14, m: 60, v: 0.5 }], gain: 0.22, reverb: 0.2 },
    ]
    return { id: 'celebration', bpm: 120, bars: 32, tracks, kicks: kickNotes.map(n => n.t), delayBeats: 0.75, delayFeedback: 0.3, reverb: { room: 0.8, damp: 0.4, width: 1, preDelay: 0.02, lowCut: 220, highCut: 11000 }, eq: [{ kind: 'lowshelf', freq: 90, gain: -2 }, { kind: 'highshelf', freq: 6500, gain: 3 }], targetLufs: -16, width: 1.05 }
}

export const MUSIC = {
    menu: menuSong,
    career: careerSong,
    match: matchSong,
    celebration: celebrationSong,
} as const
export type MusicId = keyof typeof MUSIC

/** Lay a loop out for a file: pre-roll + loop + post-roll, so codec edges never touch the seam. */
export function layoutLoop(song: RenderedLoop): { audio: Stereo; loopStart: number; loopEnd: number; bpm: number } {
    const L = song.loopSamples
    const pre = sec(0.25), post = sec(0.5)
    const audio = concat(slice(song.loop, L - pre, L), song.loop, slice(song.loop, 0, post))
    return { audio, loopStart: pre / SR, loopEnd: (pre + L) / SR, bpm: song.bpm }
}

export function renderMusicFile(id: MusicId) {
    return layoutLoop(renderSong(MUSIC[id]()))
}
