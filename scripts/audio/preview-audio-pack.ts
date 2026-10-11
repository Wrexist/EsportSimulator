/**
 * Self-check for the audio pack (nobody on the build side can listen):
 * writes tmp/phase5/audio/preview.html listing and playing every sound, plus
 * waveform and log-frequency spectrogram PNGs (via sharp) with the -1 dBFS
 * ceiling and loop points marked.
 *
 *   npx tsx scripts/audio/preview-audio-pack.ts [--all-images]
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { SR, gainToDb, type Stereo } from './dsp'
import { OUT_DIR, STATS_DIR, decodeFile, type AudioManifest, type FileStats } from './render-audio-pack'

const KEY_CUES = ['menu', 'career', 'match', 'celebration', 'victory', 'defeat', 'titleWin', 'titleWinMajor', 'matchIntro', 'countdown', 'click', 'weekAdvance', 'notification', 'bombExplode']

function fft(re: Float64Array, im: Float64Array) {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const ang = -2 * Math.PI / len
        const wr = Math.cos(ang), wi = Math.sin(ang)
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0
            for (let k = 0; k < len / 2; k++) {
                const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
                const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
                re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai
                re[i + k] += ar; im[i + k] += ai
                const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t
            }
        }
    }
}

/** Perceptual-ish colour ramp (dark blue → teal → yellow → white). */
function color(x: number): [number, number, number] {
    const stops: [number, number, number, number][] = [[0, 8, 10, 30], [0.35, 30, 70, 140], [0.6, 30, 170, 150], [0.82, 240, 210, 60], [1, 255, 255, 240]]
    x = Math.max(0, Math.min(1, x))
    for (let i = 1; i < stops.length; i++) {
        if (x <= stops[i][0]) {
            const [p0, r0, g0, b0] = stops[i - 1], [p1, r1, g1, b1] = stops[i]
            const f = (x - p0) / (p1 - p0)
            return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f]
        }
    }
    return [255, 255, 240]
}

async function waveform(buf: Stereo, file: string, loop?: [number, number]) {
    const W = 1200, H = 180
    const px = Buffer.alloc(W * H * 4)
    const set = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255 }
    for (let i = 0; i < W * H; i++) { px[i * 4] = 16; px[i * 4 + 1] = 18; px[i * 4 + 2] = 24; px[i * 4 + 3] = 255 }
    const n = buf.l.length
    const ceil = Math.pow(10, -1 / 20)
    const yOf = (v: number) => Math.round(H / 2 - v * (H / 2 - 4))
    for (let x = 0; x < W; x++) {
        const a = Math.floor(x * n / W), b = Math.max(a + 1, Math.floor((x + 1) * n / W))
        let lo = 0, hi = 0, sq = 0
        for (let i = a; i < b; i++) { const v = (buf.l[i] + buf.r[i]) / 2; if (v < lo) lo = v; if (v > hi) hi = v; sq += v * v }
        const rms = Math.sqrt(sq / (b - a))
        for (let y = yOf(hi); y <= yOf(lo); y++) set(x, y, 90, 170, 230)
        for (let y = yOf(rms); y <= yOf(-rms); y++) set(x, y, 170, 220, 255)
        const clip = Math.max(Math.abs(lo), Math.abs(hi)) > ceil
        if (clip) for (let y = 0; y < 6; y++) set(x, y, 255, 40, 40)
    }
    for (let x = 0; x < W; x += 2) { set(x, yOf(ceil), 220, 60, 60); set(x, yOf(-ceil), 220, 60, 60); set(x, H / 2, 60, 64, 80) }
    if (loop) for (const t of loop) { const x = Math.round(t * SR / n * W); for (let y = 0; y < H; y++) set(x, y, 250, 200, 60) }
    await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file)
}

async function spectrogram(buf: Stereo, file: string) {
    const W = 1200, H = 260, N = 4096
    const n = buf.l.length
    const fMin = 30, fMax = 20000
    const px = Buffer.alloc(W * H * 4)
    const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)))
    const re = new Float64Array(N), im = new Float64Array(N)
    const cols: Float64Array[] = []
    let top = 1e-12
    for (let x = 0; x < W; x++) {
        const center = Math.floor((x + 0.5) * n / W)
        for (let i = 0; i < N; i++) {
            const j = center - N / 2 + i
            re[i] = j >= 0 && j < n ? (buf.l[j] + buf.r[j]) * 0.5 * win[i] : 0
            im[i] = 0
        }
        fft(re, im)
        const col = new Float64Array(H)
        for (let y = 0; y < H; y++) {
            const f0 = fMin * Math.pow(fMax / fMin, (H - 1 - y) / H), f1 = fMin * Math.pow(fMax / fMin, (H - y) / H)
            const k0 = Math.max(1, Math.floor(f0 * N / SR)), k1 = Math.max(k0 + 1, Math.ceil(f1 * N / SR))
            let mag = 0
            for (let k = k0; k < k1 && k < N / 2; k++) mag = Math.max(mag, Math.hypot(re[k], im[k]))
            col[y] = mag
            if (mag > top) top = mag
        }
        cols.push(col)
    }
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
        const db = gainToDb(cols[x][y] / top)
        const [r, g, b] = color((db + 90) / 90)
        const i = (y * W + x) * 4
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255
    }
    // octave guide lines at 100 Hz, 1 kHz, 10 kHz
    for (const f of [100, 1000, 10000]) {
        const y = Math.round(H - 1 - H * Math.log(f / fMin) / Math.log(fMax / fMin))
        for (let x = 0; x < W; x += 4) { const i = (y * W + x) * 4; px[i] = 200; px[i + 1] = 200; px[i + 2] = 200 }
    }
    await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file)
}

async function main() {
    const all = process.argv.includes('--all-images')
    const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'manifest.json'), 'utf8')) as AudioManifest
    const stats = JSON.parse(fs.readFileSync(path.join(STATS_DIR, 'stats.json'), 'utf8')) as Record<string, FileStats>
    const ffmpeg = process.env.FFMPEG_PATH ?? 'C:\\Program Files\\ShareX\\ffmpeg.exe'
    fs.mkdirSync(path.join(STATS_DIR, 'img'), { recursive: true })
    const rel = (f: string) => path.relative(STATS_DIR, path.join(OUT_DIR, f)).replace(/\\/g, '/')
    const rows: string[] = []
    const entries: [string, { file: string; category: string; loopStart?: number; loopEnd?: number; alias?: string }][] = [
        ...Object.entries(manifest.music), ...Object.entries(manifest.sounds),
    ]
    for (const [id, e] of entries) {
        const s = stats[e.alias ?? id]
        let images = ''
        if (!e.alias && (all || KEY_CUES.includes(id))) {
            const decoded = manifest.format === 'wav' ? null : decodeFile(ffmpeg, path.join(OUT_DIR, e.file))
            if (decoded) {
                await waveform(decoded, path.join(STATS_DIR, 'img', `${id}-wave.png`), e.loopStart !== undefined ? [e.loopStart, e.loopEnd!] : undefined)
                await spectrogram(decoded, path.join(STATS_DIR, 'img', `${id}-spec.png`))
                images = `<div class="img"><img src="img/${id}-wave.png" alt="${id} waveform"><img src="img/${id}-spec.png" alt="${id} spectrogram"></div>`
            }
        }
        const level = s ? `peak ${s.peakDb} dBFS · TP ${s.truePeakDb} · RMS ${s.rmsDb} dB · LUFS-I ${s.lufsI} · M-max ${s.lufsMaxM} · ${(s.bytes / 1024).toFixed(0)} KB${s.seamDb !== undefined ? ` · loop seam ${s.seamDb} dB` : ''}` : ''
        const loopNote = e.loopStart !== undefined ? ` · loop ${e.loopStart.toFixed(3)}–${e.loopEnd!.toFixed(3)} s` : ''
        rows.push(`<section><h3>${id} <small>${e.category}${e.alias ? ` · alias of ${e.alias}` : ''}${loopNote}</small></h3>
<audio controls preload="none" src="${rel(e.file)}"></audio>${e.loopStart !== undefined ? ` <button data-loop="${rel(e.file)}" data-start="${e.loopStart}" data-end="${e.loopEnd}">Loop test (jump to 4 s before seam)</button>` : ''}
<p>${level}</p>${images}</section>`)
    }
    const total = Object.values(stats).reduce((n, s) => n + s.bytes, 0)
    const html = `<!doctype html><meta charset="utf-8"><title>Audio pack preview</title>
<style>body{font:14px system-ui;background:#0f1117;color:#e7e9ee;max-width:1260px;margin:24px auto}section{border-top:1px solid #2a2e3a;padding:10px 0}small{color:#8a90a0;font-weight:400}p{color:#aab0c0;margin:6px 0}.img img{display:block;margin:4px 0;max-width:100%}button{background:#2a3350;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer}</style>
<h1>Audio pack preview</h1><p>${entries.length} ids · ${Object.keys(stats).length} files · ${(total / 1024 / 1024).toFixed(2)} MB. Waveform: red dashes = −1 dBFS, yellow = loop points. Spectrogram: log frequency 30 Hz–20 kHz, guides at 100 Hz / 1 kHz / 10 kHz.</p>
<p>Loop test uses Web Audio with the manifest loop points; open this page through a local server (file:// blocks fetch) — e.g. <code>npx serve .</code> from the repo root.</p>
${rows.join('\n')}
<script>
let ctx, src
document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-loop]'); if (!b) return
  ctx ??= new AudioContext(); src?.stop()
  const buf = await ctx.decodeAudioData(await (await fetch(b.dataset.loop)).arrayBuffer())
  src = ctx.createBufferSource(); src.buffer = buf; src.loop = true
  src.loopStart = +b.dataset.start; src.loopEnd = +b.dataset.end
  src.connect(ctx.destination); src.start(0, Math.max(+b.dataset.start, +b.dataset.end - 4))
})
</script>`
    fs.writeFileSync(path.join(STATS_DIR, 'preview.html'), html)
    console.log(`Wrote ${path.join(STATS_DIR, 'preview.html')}`)
}

main().catch(err => { console.error(err); process.exitCode = 1 })
