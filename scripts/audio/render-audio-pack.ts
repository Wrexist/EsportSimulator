/**
 * Renders the project-made audio pack: every SFX, stinger and music loop is
 * synthesised offline from code in scripts/audio (layered oscillators, FM,
 * filtered noise, ADSR, Freeverb, saturation). No third-party samples.
 *
 *   npx tsx scripts/audio/render-audio-pack.ts [--only=click,menu] [--wav] [--sfx-only] [--music-only]
 *
 * Output: public/audio/sfx/*.ogg, public/audio/music/*.ogg, public/audio/manifest.json
 * Encoder: ffmpeg (libopus, bit-exact). FFMPEG_PATH overrides the location;
 * without ffmpeg the pack falls back to 16-bit WAV.
 * Stats (peak/RMS/LUFS per file) go to tmp/phase5/audio/stats.json.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { SFX, renderSfx, type SfxDef } from './sfx'
import { MUSIC, renderMusicFile, type MusicId } from './music'
import { SR, Rng, loudness, truePeakDb, peak, rmsDb, gainToDb, dbToGain, scale, limit, trimTail, fadeEdges, eq, sec, type Stereo } from './dsp'

export const ROOT = path.resolve(__dirname, '../..')
export const OUT_DIR = path.join(ROOT, 'public/audio')
export const STATS_DIR = path.join(ROOT, 'tmp/phase5/audio')

/** SoundType ids that reuse another rendered file. */
export const SOUND_ALIASES: Record<string, string> = { start: 'countdown', matchStart: 'countdown' }
/** Runtime balance trims written to the manifest (files themselves are loudness-normalised). */
const MUSIC_GAIN: Record<MusicId, number> = { menu: 1, career: 0.9, match: 0.8, celebration: 1 }
const MUSIC_BITRATE = '112k'
const SFX_BITRATE = '96k'
const PEAK_CEILING_DB = -1

export interface ManifestSound { file: string; category: 'ui' | 'match' | 'moment'; gain: number; duration: number; variation?: number; duck?: number; alias?: string }
export interface ManifestMusic { file: string; category: 'music'; gain: number; duration: number; loopStart: number; loopEnd: number; bpm: number }
export interface AudioManifest { version: 1; generator: string; format: 'ogg-opus' | 'wav'; sampleRate: number; sounds: Record<string, ManifestSound>; music: Record<string, ManifestMusic> }

// ── finishing ───────────────────────────────────────────────────────────────

/** Trim, fade, normalise an effect to its momentary-loudness target and limit peaks. */
export function finalizeSfx(def: SfxDef, raw: Stereo, ceilingDb = -1.6): Stereo {
    let buf = eq(raw, [{ kind: 'highpass', freq: 34, q: 0.7 }, { kind: 'highpass', freq: 34, q: 0.7 }])
    buf = trimTail(buf, -78, 0.02)
    fadeEdges(buf, 12, Math.min(sec(0.02), Math.floor(buf.l.length / 4)))
    for (let pass = 0; pass < 3; pass++) {
        const m = loudness(buf).maxMomentary
        scale(buf, dbToGain(def.target - m))
        limit(buf, ceilingDb, 0.0015, 0.06)
    }
    return buf
}

export function pcmHash(buf: Stereo): string {
    const h = crypto.createHash('sha256')
    h.update(Buffer.from(buf.l.buffer, buf.l.byteOffset, buf.l.byteLength))
    h.update(Buffer.from(buf.r.buffer, buf.r.byteOffset, buf.r.byteLength))
    return h.digest('hex')
}

export function renderSfxFinal(id: string): Stereo {
    const def = SFX.find(s => s.id === id)
    if (!def) throw new Error(`Unknown sfx ${id}`)
    return finalizeSfx(def, renderSfx(def))
}

// ── encoding ────────────────────────────────────────────────────────────────

function ffmpegPath(): string | null {
    const candidates = [process.env.FFMPEG_PATH, 'C:\\Program Files\\ShareX\\ffmpeg.exe', 'ffmpeg'].filter(Boolean) as string[]
    for (const c of candidates) {
        const probe = spawnSync(c, ['-hide_banner', '-version'], { encoding: 'utf8' })
        if (probe.status === 0) return c
    }
    return null
}

function wavFloat(buf: Stereo): Buffer {
    const n = buf.l.length
    const data = Buffer.alloc(n * 8)
    for (let i = 0; i < n; i++) { data.writeFloatLE(buf.l[i], i * 8); data.writeFloatLE(buf.r[i], i * 8 + 4) }
    return Buffer.concat([wavHeader(3, 32, data.length), data])
}

function wav16(buf: Stereo, seed: string): Buffer {
    const n = buf.l.length
    const rng = new Rng(seed)
    const data = Buffer.alloc(n * 4)
    const q = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767 + (rng.next() - rng.next()))))
    for (let i = 0; i < n; i++) { data.writeInt16LE(q(buf.l[i]), i * 4); data.writeInt16LE(q(buf.r[i]), i * 4 + 2) }
    return Buffer.concat([wavHeader(1, 16, data.length), data])
}

function wavHeader(format: 1 | 3, bits: number, dataBytes: number): Buffer {
    const h = Buffer.alloc(44)
    h.write('RIFF', 0); h.writeUInt32LE(36 + dataBytes, 4); h.write('WAVE', 8)
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(format, 20); h.writeUInt16LE(2, 22)
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2 * bits / 8, 28); h.writeUInt16LE(2 * bits / 8, 32); h.writeUInt16LE(bits, 34)
    h.write('data', 36); h.writeUInt32LE(dataBytes, 40)
    return h
}

function encodeOpus(ffmpeg: string, buf: Stereo, out: string, bitrate: string) {
    const tmp = path.join(os.tmpdir(), `esm-audio-${process.pid}-${path.basename(out)}.wav`)
    fs.writeFileSync(tmp, wavFloat(buf))
    const res = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on',
        '-compression_level', '10', '-application', 'audio', '-frame_duration', '20', '-map_metadata', '-1',
        '-fflags', '+bitexact', '-flags:a', '+bitexact', out], { encoding: 'utf8' })
    fs.rmSync(tmp, { force: true })
    if (res.status !== 0) throw new Error(`ffmpeg failed for ${out}: ${res.stderr}`)
}

export function decodeFile(ffmpeg: string, file: string): Stereo {
    const res = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 })
    if (res.status !== 0) throw new Error(`decode failed for ${file}: ${res.stderr}`)
    const raw = res.stdout as Buffer
    const f = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4))
    const n = f.length / 2
    const l = new Float32Array(n), r = new Float32Array(n)
    for (let i = 0; i < n; i++) { l[i] = f[2 * i]; r[i] = f[2 * i + 1] }
    return { l, r }
}

export interface FileStats { id: string; file: string; kind: 'sfx' | 'music'; bytes: number; duration: number; peakDb: number; truePeakDb: number; rmsDb: number; lufsI: number; lufsMaxM: number; seamDb?: number; pcmSha256: string }

/** Encode, decode back, and pull the level down if the codec pushed peaks over the ceiling. */
function writeAudio(ffmpeg: string | null, buf: Stereo, relNoExt: string, bitrate: string): { rel: string; decoded: Stereo } {
    if (!ffmpeg) {
        const rel = `${relNoExt}.wav`
        fs.writeFileSync(path.join(OUT_DIR, rel), wav16(buf, rel))
        return { rel, decoded: buf }
    }
    const rel = `${relNoExt}.ogg`
    const out = path.join(OUT_DIR, rel)
    let work = buf
    for (let attempt = 0; attempt < 4; attempt++) {
        encodeOpus(ffmpeg, work, out, bitrate)
        const decoded = decodeFile(ffmpeg, out)
        const p = gainToDb(peak(decoded))
        if (p <= PEAK_CEILING_DB) return { rel, decoded }
        work = { l: work.l.slice(), r: work.r.slice() }
        scale(work, dbToGain(PEAK_CEILING_DB - p - 0.15))
    }
    throw new Error(`Could not keep ${rel} under ${PEAK_CEILING_DB} dBFS`)
}

function stats(id: string, rel: string, kind: 'sfx' | 'music', decoded: Stereo, pcm: Stereo): FileStats {
    const ld = loudness(decoded)
    return {
        id, file: rel, kind, bytes: fs.statSync(path.join(OUT_DIR, rel)).size, duration: decoded.l.length / SR,
        peakDb: round(gainToDb(peak(decoded)), 2), truePeakDb: round(truePeakDb(decoded), 2), rmsDb: round(rmsDb(decoded), 2),
        lufsI: round(ld.integrated, 2), lufsMaxM: round(ld.maxMomentary, 2), pcmSha256: pcmHash(pcm),
    }
}

const round = (x: number, d = 3) => Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x

/**
 * Loop circularity of the rendered PCM: largest difference between the
 * regions around loopStart and loopEnd (dB re full scale; -240 = identical).
 * The codec cannot be judged this way (Opus is not waveform-exact), so the
 * decoded file is checked for length instead.
 */
function seamError(pcm: Stereo, loopStart: number, loopEnd: number): number {
    const a = Math.round(loopStart * SR), b = Math.round(loopEnd * SR)
    let worst = 0
    for (let k = -sec(0.2); k < sec(0.2); k++) {
        if (a + k < 0 || b + k >= pcm.l.length) continue
        worst = Math.max(worst, Math.abs(pcm.l[a + k] - pcm.l[b + k]), Math.abs(pcm.r[a + k] - pcm.r[b + k]))
    }
    return round(gainToDb(worst), 1)
}

// ── main ────────────────────────────────────────────────────────────────────

function readManifest(): AudioManifest | null {
    const p = path.join(OUT_DIR, 'manifest.json')
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) as AudioManifest : null
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
    return Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]))
}

// ── release inventory ───────────────────────────────────────────────────────

const INVENTORY = path.join(ROOT, 'docs/launch-readiness/evidence/L08-content-inventory.json')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AUDIO_PACK_SOURCE } = require('../launch/content-provenance.cjs') as { AUDIO_PACK_SOURCE: string }

interface InventoryRow { path: string; sha256: string; bytes: number; [key: string]: unknown }

/** Inventory rows for every file under public/audio (the release gate binds exact bytes). */
export function audioInventoryRows(): InventoryRow[] {
    const walk = (rel: string): string[] => {
        const abs = path.join(ROOT, rel)
        return fs.statSync(abs).isDirectory() ? fs.readdirSync(abs).sort().flatMap(n => walk(`${rel}/${n}`)) : [rel]
    }
    return walk('public/audio').map(rel => {
        const bytes = fs.readFileSync(path.join(ROOT, rel))
        return {
            path: rel, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, kind: 'sound',
            source: AUDIO_PACK_SOURCE, evidence: 'scripts/audio/render-audio-pack.ts', license: 'Project original',
            permission: 'Owner-original content generated in-repo', attribution: null,
            allowedUse: 'Include in the game and Steam release.', releaseDisposition: 'include', reviewBasis: 'project-generated',
        }
    })
}

/** Replace this pack's rows in the L08 inventory; every other row is left exactly as it was. */
export function syncInventory(): { rows: number; changed: boolean } {
    const raw = fs.readFileSync(INVENTORY, 'utf8')
    const doc = JSON.parse(raw) as { files: InventoryRow[] }
    const rows = audioInventoryRows()
    const others = doc.files.filter(r => !r.path.startsWith('public/audio/'))
    let at = others.findIndex(r => r.path.startsWith('public/') && r.path > 'public/audio/')
    if (at === -1) at = others.length
    doc.files = [...others.slice(0, at), ...rows, ...others.slice(at)]
    const next = JSON.stringify(doc, null, 2) + '\n'
    if (next !== raw) fs.writeFileSync(INVENTORY, next)
    return { rows: rows.length, changed: next !== raw }
}

function main() {
    const args = process.argv.slice(2)
    const only = args.find(a => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean)
    const forceWav = args.includes('--wav')
    const ffmpeg = forceWav ? null : ffmpegPath()
    if (!ffmpeg && !forceWav) console.warn('ffmpeg not found (set FFMPEG_PATH); writing WAV instead of Ogg Opus.')
    fs.mkdirSync(path.join(OUT_DIR, 'sfx'), { recursive: true })
    fs.mkdirSync(path.join(OUT_DIR, 'music'), { recursive: true })
    fs.mkdirSync(STATS_DIR, { recursive: true })

    const previous = readManifest()
    const format = ffmpeg ? 'ogg-opus' : 'wav'
    const partial = !!only || args.includes('--music-only') || args.includes('--sfx-only')
    const manifest: AudioManifest = previous && previous.format === format && partial
        ? previous
        : { version: 1, generator: 'scripts/audio/render-audio-pack.ts', format, sampleRate: SR, sounds: {}, music: {} }
    const statsPath = path.join(STATS_DIR, 'stats.json')
    const allStats: Record<string, FileStats> = partial && fs.existsSync(statsPath) ? JSON.parse(fs.readFileSync(statsPath, 'utf8')) : {}
    const wanted = (id: string) => !only || only.includes(id)
    const started = Date.now()

    if (!args.includes('--music-only')) for (const def of SFX) {
        if (!wanted(def.id)) continue
        const t0 = Date.now()
        const pcm = finalizeSfx(def, renderSfx(def))
        const { rel, decoded } = writeAudio(ffmpeg, pcm, `sfx/${def.id}`, SFX_BITRATE)
        manifest.sounds[def.id] = {
            file: rel, category: def.category, gain: 1, duration: round(decoded.l.length / SR),
            ...(def.variation ? { variation: def.variation } : {}), ...(def.duck !== undefined ? { duck: def.duck } : {}),
        }
        allStats[def.id] = stats(def.id, rel, 'sfx', decoded, pcm)
        console.log(`sfx   ${def.id.padEnd(18)} ${(Date.now() - t0).toString().padStart(5)} ms`)
    }
    for (const [alias, target] of Object.entries(SOUND_ALIASES)) {
        if (manifest.sounds[target]) manifest.sounds[alias] = { ...manifest.sounds[target], alias: target }
    }

    if (!args.includes('--sfx-only')) for (const id of Object.keys(MUSIC) as MusicId[]) {
        if (!wanted(id)) continue
        const t0 = Date.now()
        const { audio, loopStart, loopEnd, bpm } = renderMusicFile(id)
        const { rel, decoded } = writeAudio(ffmpeg, audio, `music/${id}`, MUSIC_BITRATE)
        manifest.music[id] = { file: rel, category: 'music', gain: MUSIC_GAIN[id], duration: round(decoded.l.length / SR), loopStart: round(loopStart, 9), loopEnd: round(loopEnd, 9), bpm }
        const s = stats(id, rel, 'music', decoded, audio)
        s.seamDb = seamError(audio, loopStart, loopEnd)
        if (decoded.l.length !== audio.l.length) throw new Error(`${rel}: decoded length ${decoded.l.length} != rendered ${audio.l.length}; loop points would drift`)
        allStats[id] = s
        console.log(`music ${id.padEnd(18)} ${(Date.now() - t0).toString().padStart(5)} ms`)
    }

    manifest.sounds = sortKeys(manifest.sounds)
    manifest.music = sortKeys(manifest.music)
    fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    fs.writeFileSync(statsPath, JSON.stringify(sortKeys(allStats), null, 2) + '\n')

    const rows = Object.values(sortKeys(allStats))
    console.log('\nid                  dur(s)   peak   TP     RMS    LUFS-I  LUFS-Mmax  KB')
    for (const s of rows) {
        console.log(`${s.id.padEnd(18)} ${s.duration.toFixed(2).padStart(7)} ${s.peakDb.toFixed(1).padStart(6)} ${s.truePeakDb.toFixed(1).padStart(6)} ${s.rmsDb.toFixed(1).padStart(6)} ${String(s.lufsI.toFixed?.(1) ?? s.lufsI).padStart(7)} ${s.lufsMaxM.toFixed(1).padStart(9)} ${(s.bytes / 1024).toFixed(0).padStart(5)}${s.seamDb !== undefined ? `  seam ${s.seamDb} dB` : ''}`)
    }
    const total = rows.reduce((n, s) => n + s.bytes, 0)
    console.log(`\n${rows.length} files, ${(total / 1024 / 1024).toFixed(2)} MB, ${((Date.now() - started) / 1000).toFixed(1)} s`)
    if (!args.includes('--no-inventory')) {
        const inv = syncInventory()
        console.log(`L08 inventory: ${inv.rows} public/audio rows ${inv.changed ? 'updated' : 'unchanged'}`)
    }
}

if (require.main === module) main()
