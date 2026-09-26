/**
 * Cuts the Steam trailer from recorded clips using an edit list (edl.json).
 *
 * Every segment length is given in beats so cuts land on the music. Text
 * overlays are burned in (Steam autoplays muted, so the story must read
 * without sound). Without MUSIC, a synthesized placeholder beat is used so
 * pacing can be judged — replace it with a licensed track for release.
 *
 * Run:  node scripts/trailer/cut-trailer.cjs [edl.json]
 * Env:  FFMPEG, MUSIC (path to licensed track), MUSIC_OFFSET (seconds into track)
 * Out:  tmp/trailer/esports-manager-trailer.mp4 (+ -steam.mp4 upload master)
 */
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")
const overlays = require("./overlays.cjs")

const ROOT = path.join(process.cwd(), "tmp", "trailer")
const CLIPS = path.join(ROOT, "clips")
const WORK = path.join(ROOT, "work")
const EDL = process.argv[2] || path.join(__dirname, "edl.json")
const FFMPEG = process.env.FFMPEG || ["C:\\Program Files\\ShareX\\ffmpeg.exe"].find(p => fs.existsSync(p)) || "ffmpeg"
const BRAND_FONT = path.join(process.cwd(), "marketing", "esports-manager-steam-assets-4326170", "brand-v2", "BarlowCondensed-ExtraBold.ttf")
const FONT = (process.env.TRAILER_FONT || (fs.existsSync(BRAND_FONT) ? BRAND_FONT : "C:/Windows/Fonts/bahnschrift.ttf")).replace(/\\/g, "/").replace(":", "\\:")
const FPS = Number(process.env.TRAILER_FPS || 60)

const edl = JSON.parse(fs.readFileSync(EDL, "utf8"))
const BEAT = 60 / edl.bpm

function ff(args) { execFileSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error", ...args], { stdio: "inherit" }) }
const esc = p => p.replace(/\\/g, "/").replace(":", "\\:")

/** Fade-in/out alpha expression for a text shown between a and b seconds. */
function alpha(a, b, f = 0.18) {
    return `if(lt(t,${a}),0,if(lt(t,${a + f}),(t-${a})/${f},if(lt(t,${b - f}),1,if(lt(t,${b}),(${b}-t)/${f},0))))`
}

/** drawtext filters for one text block. style: "hero" (centre), "lower" (bottom band), "tag" (small kicker). */
function textFilters(t, segDur, idx, k) {
    const a = (t.at ?? 0) * BEAT, b = t.until != null ? t.until * BEAT : segDur
    const lines = String(t.text).split("\n")
    const size = t.size || (t.style === "hero" ? 104 : t.style === "tag" ? 34 : 64)
    const gap = Math.round(size * 1.18)
    const baseY = t.y != null ? t.y : t.style === "lower" ? 1080 - 150 - gap * (lines.length - 1)
        : t.style === "tag" ? 1080 / 2 - 110 - gap * (lines.length - 1)
            : 1080 / 2 - (gap * lines.length) / 2
    return lines.map((line, i) => {
        const file = path.join(WORK, `t_${idx}_${k}_${i}.txt`)
        fs.writeFileSync(file, line)
        const color = t.color || (t.style === "tag" ? "0xFF7A2E" : "white")
        const box = t.style === "lower" || t.box ? ":box=1:boxcolor=black@0.62:boxborderw=26" : ""
        return `drawtext=fontfile='${FONT}':textfile='${esc(file)}':fontsize=${size}:fontcolor=${color}` +
            // slides up ~40 px into place as it fades in
            `:x=(w-text_w)/2:y='${Math.round(baseY + i * gap)}+40*pow(max(0\,1-(t-${a})/0.22)\,2)':shadowcolor=black@0.7:shadowx=0:shadowy=4${box}` +
            `:alpha='${alpha(a, b)}'`
    })
}

const THREE_D = path.join(ROOT, "3d")
const GRID_TILES = ["27_15", "973_15", "27_548", "973_548"]

/**
 * One segment = a base layer (clip, card, or 2×2 grid), camera move, 3D/logo
 * overlays, then text and fades on top. Sources:
 *   clip + in | card (+ bg clip, blurred) | grid: [{clip, in}, ×4]
 * Camera: zoom [z0, z1] + focus [x, y]; punch: 0.1 adds a quick zoom-in that lands on the cut.
 * overlays: [{seq, at (beats), x, y, h, crop: "w:h:x:y", loop}] — 3D alpha frame sequences.
 */
function buildSegment(seg, idx) {
    const dur = seg.beats * BEAT
    const out = path.join(WORK, `seg_${String(idx).padStart(2, "0")}.mp4`)
    const inputs = []
    const addInput = args => { inputs.push(...args); return inputs.filter(a => a === "-i").length - 1 }
    const graph = []
    const clipIn = (clip, from) => addInput(["-ss", String(from || 0), "-t", String(dur + 0.1), "-i", path.join(CLIPS, clip + ".mp4")])

    // Base layer
    if (seg.grid) {
        const tiles = seg.grid.map((g, i) => {
            const n = clipIn(g.clip, g.in)
            graph.push(`[${n}:v]fps=${FPS},scale=920:518:flags=lanczos,setsar=1[g${i}]`)
            return `[g${i}]`
        })
        graph.push(`${tiles.join("")}xstack=inputs=${tiles.length}:layout=${GRID_TILES.slice(0, tiles.length).join("|")}:fill=0x07090d,format=yuv420p[base0]`)
    } else if (seg.card && !seg.bg) {
        const n = addInput(["-f", "lavfi", "-t", String(dur), "-i", `color=c=0x07090d:s=1920x1080:r=${FPS}`])
        graph.push(`[${n}:v]null[base0]`)
    } else {
        const n = clipIn(seg.card ? seg.bg : seg.clip, seg.in)
        const grade = seg.card ? ",gblur=sigma=24,eq=brightness=-0.12:saturation=0.8" : ""
        graph.push(`[${n}:v]fps=${FPS}${grade}[base0]`)
    }

    // Camera: slow push plus an optional punch that settles within ~0.25 s.
    let cur = "base0"
    if (seg.zoom || seg.punch) {
        const [z0, z1] = seg.zoom || [1, 1.04], [fx, fy] = seg.focus || [0.5, 0.5]
        const n = Math.round(dur * FPS), pn = Math.round(0.25 * FPS), P = seg.punch || 0
        const z = `(${z0}+(${z1}-${z0})*min(on/${n}\,1))*(1+${P}*pow(max(0\,1-on/${pn})\,2))`
        graph.push(`[${cur}]scale=3840:2160:flags=lanczos,zoompan=z='${z}':x='(iw-iw/zoom)*${fx}':y='(ih-ih/zoom)*${fy}':d=1:s=1920x1080:fps=${FPS}[cam]`)
        cur = "cam"
    }

    // Logo and 3D overlays
    const chips = (seg.text || []).filter(t => t.style === "chip" || t.style === "statement").map(t => ({ chip: t }))
    const overlays = [...(seg.logo ? [{ logo: seg.logo }] : []), ...(seg.overlays || []), ...chips]
    overlays.forEach((o, i) => {
        let n, prep, at, x, y
        if (o.chip) {
            // Glass caption chip: fades in and slides from the left, bottom-left like the game's toasts.
            n = addInput(["-loop", "1", "-t", String(dur), "-i", o.chip.png])
            at = (o.chip.at || 0) * BEAT
            prep = `format=rgba,fade=t=in:st=${at}:d=0.18:alpha=1`
            if (o.chip.style === "statement") {
                // Centred claim: fades in and eases up a few pixels.
                x = "(W-w)/2"; y = `'(H-h)/2+30*pow(max(0\,1-(t-${at})/0.3)\,3)'`
            } else {
                x = `'40-50*pow(max(0\,1-(t-${at})/0.26)\,3)'`; y = "H-h-30"
            }
        } else if (o.logo) {
            n = addInput(["-loop", "1", "-t", String(dur), "-i", path.resolve(o.logo.file)])
            at = (o.logo.at || 0) * BEAT
            prep = `scale=${o.logo.width || 1100}:-1,format=rgba,fade=t=in:st=${at}:d=0.4:alpha=1`
            x = "(W-w)/2"; y = String(o.logo.y ?? 300)
        } else {
            at = (o.at || 0) * BEAT
            n = addInput([...(o.loop ? ["-stream_loop", "-1"] : []), "-framerate", "30", "-i", path.join(THREE_D, o.seq, "frames", "%03d.webp")])
            prep = `${o.crop ? `crop=${o.crop},` : ""}scale=-1:${o.h || 600}:flags=lanczos,format=rgba,fps=${FPS},setpts=PTS+${at}/TB`
            x = String(o.x ?? "(W-w)/2"); y = String(o.y ?? "(H-h)/2")
        }
        graph.push(`[${n}:v]${prep}[o${i}]`, `[${cur}][o${i}]overlay=x=${x}:y=${y}:eval=frame:format=auto[ov${i}]`)
        cur = `ov${i}`
    })

    // Text and fades on top. Gameplay gets a light grade: the UI is dark and low-contrast,
    // and zoomed-in text needs a little sharpening.
    const grade = seg.card ? [] : ["eq=contrast=1.08:saturation=1.15:gamma=1.04", "unsharp=5:5:0.5"]
    const top = [`fps=${FPS}`, ...grade, "scale=out_range=tv", "format=yuv420p"]
    ;(seg.text || []).filter(t => t.style !== "chip" && t.style !== "statement").forEach((t, k) => top.push(...textFilters(t, dur, idx, k)))
    if (seg.fadeIn) top.push(`fade=t=in:st=0:d=${seg.fadeIn}`)
    if (seg.fadeOut) top.push(`fade=t=out:st=${dur - seg.fadeOut}:d=${seg.fadeOut}`)
    if (seg.flash) top.push(`fade=t=in:st=0:d=0.12:color=white`)
    graph.push(`[${cur}]${top.join(",")}[v]`)

    ff([...inputs, "-t", String(dur), "-filter_complex", graph.join(";"), "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(FPS), out])
    return out
}

const ARENA = path.join(process.cwd(), "public", "esport-ui-assets", "backgrounds", "match-command-arena.webp")

/**
 * End card in the game's UI language: the in-game arena backdrop with a slow push-in,
 * and the glass brand panel (logo, tagline, wishlist button) easing up into place.
 * seg: { endcard: true, beats, fadeOut }; seg.panel is the PNG from overlays.endPanel().
 */
function buildEndcard(seg, idx) {
    const dur = seg.beats * BEAT
    const out = path.join(WORK, `seg_${String(idx).padStart(2, "0")}.mp4`)
    const n = Math.round(dur * FPS)
    const rise = "(H-h)/2+36*pow(max(0\,1-(t-0.25)/0.6)\,3)"
    const graph = [
        `[0:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,` +
        `zoompan=z='1.0+0.06*on/${n}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)*0.45':d=1:s=1920x1080:fps=${FPS},` +
        `eq=brightness=-0.16:saturation=0.9,gblur=sigma=2[bg]`,
        `[1:v]format=rgba,fade=t=in:st=0.25:d=0.5:alpha=1[panel]`,
        `[bg][panel]overlay=x=(W-w)/2:y='${rise}':eval=frame:format=auto,vignette=angle=PI/5,` +
        `fps=${FPS},scale=out_range=tv,format=yuv420p${seg.fadeOut ? `,fade=t=out:st=${dur - seg.fadeOut}:d=${seg.fadeOut}` : ""}[v]`,
    ]
    ff(["-loop", "1", "-t", String(dur), "-i", ARENA, "-loop", "1", "-t", String(dur), "-i", seg.panel,
        "-t", String(dur), "-filter_complex", graph.join(";"), "-map", "[v]", "-an",
        "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv420p", "-color_range", "tv", "-r", String(FPS), out])
    return out
}

/** Placeholder 4-on-the-floor loop at the EDL tempo (kick, offbeat hat, sub pulse). */
function placeholderMusic(total, file) {
    const b = BEAT.toFixed(6), h = (BEAT / 2).toFixed(6)
    const kick = `sin(2*PI*(45+140*exp(-mod(t,${b})*28))*mod(t,${b}))*exp(-mod(t,${b})*7)`
    const hat = `(random(0)*2-1)*exp(-mod(t+${h},${b})*55)*0.22`
    const sub = `sin(2*PI*55*t)*0.18*(1-exp(-mod(t,${h})*30))*exp(-mod(t,${h})*3)`
    ff(["-f", "lavfi", "-t", String(total), "-i", `aevalsrc='0.55*(${kick})+${hat}+${sub}':s=48000:c=stereo`,
        "-af", "alimiter=limit=0.9", "-c:a", "pcm_s16le", file])
}

async function run() {
    fs.rmSync(WORK, { recursive: true, force: true })
    fs.mkdirSync(WORK, { recursive: true })
    // Captions and the end panel are HTML/CSS renders (see overlays.cjs).
    for (const seg of edl.segments) {
        for (const t of seg.text || []) {
            if (t.style === "chip") t.png = await overlays.caption({ title: t.text, kicker: t.kicker })
            if (t.style === "statement") t.png = await overlays.statement({ title: t.text, sub: t.sub, kicker: t.kicker })
        }
        if (seg.endcard) seg.panel = await overlays.endPanel()
    }
    await overlays.close()
    const segs = edl.segments.map((s, i) => {
        process.stdout.write(`seg ${i} ${s.endcard ? "endcard" : s.clip || s.bg || (s.grid ? "grid" : "card")}\n`)
        return s.endcard ? buildEndcard(s, i) : buildSegment(s, i)
    })
    const list = path.join(WORK, "concat.txt")
    fs.writeFileSync(list, segs.map(s => `file '${s.replace(/\\/g, "/")}'`).join("\n"))
    const silent = path.join(WORK, "video.mp4")
    ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent])
    const total = edl.segments.reduce((a, s) => a + s.beats * BEAT, 0)

    let music = process.env.MUSIC
    if (!music) { music = path.join(WORK, "placeholder.wav"); placeholderMusic(total, music) }
    const outName = path.join(ROOT, "esports-manager-trailer.mp4")
    ff(["-i", silent, "-ss", String(process.env.MUSIC_OFFSET || 0), "-i", music,
        "-filter_complex", `[1:a]atrim=0:${total},afade=t=in:d=0.3,afade=t=out:st=${total - 2.5}:d=2.5,loudnorm=I=-14:TP=-1:LRA=9[a]`,
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-shortest", outName])
    // Steam upload master: H.264 High, 1080p60, high bitrate, faststart.
    const steam = outName.replace(".mp4", "-steam.mp4")
    ff(["-i", outName, "-c:v", "libx264", "-profile:v", "high", "-level", "4.2", "-preset", "slow",
        "-b:v", "24M", "-maxrate", "30M", "-bufsize", "48M", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "copy", "-movflags", "+faststart", steam])
    console.log(`\n${path.relative(process.cwd(), steam)}  (${total.toFixed(1)}s @ ${edl.bpm} BPM)`)
}

run().catch(e => { console.error(e); process.exit(1) })
