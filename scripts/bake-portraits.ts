#!/usr/bin/env tsx
/**
 * Bake Pixar-style PNG portraits for the top-20 teams via Replicate (Flux
 * Kontext img2img). All other ~1,268 players reuse one of the 100 baked
 * images, picked deterministically by id-hash.
 *
 * Inputs:
 *   - raw-data/snapshot/teams.json    (real team metadata + tier/reputation)
 *   - raw-data/snapshot/players.json  (real .webp portrait paths)
 *   - public/data/snapshot/players.json (sanitized players to patch)
 *
 * Outputs:
 *   - public/assets/teams/<sanitized-team>/players/<sanitized-nick>.png  (top-20 only)
 *   - public/data/snapshot/players.json  (portraitPath rewritten to .png)
 *
 * Usage:
 *   $env:REPLICATE_API_TOKEN="r8_xxx"; npm run bake:portraits
 *
 * Flags (env vars):
 *   REPLICATE_API_TOKEN     required
 *   PORTRAIT_MODEL          replicate model slug, default flux-kontext-pro
 *   PORTRAIT_LIMIT          cap how many top-20 portraits to bake (for testing)
 *   PORTRAIT_CONCURRENCY    parallel requests, default 4
 *   PORTRAIT_FORCE          re-bake even if PNG already exists
 */

import fs from "node:fs"
import path from "node:path"

// IMPORTANT: must run before any TLS-using imports (Replicate SDK) so the
// setting takes effect. PORTRAIT_INSECURE_TLS=1 in .env.local lets users
// bypass corporate-AV/proxy TLS interception without touching their shell each
// time. Equivalent to setting NODE_TLS_REJECT_UNAUTHORIZED=0 in the env, but
// scoped to this script run only.
function maybeDisableTlsVerification() {
    const envFlag = process.env.PORTRAIT_INSECURE_TLS === "1"
    // Also peek at .env.local since the regular loader runs later.
    let fileFlag = false
    try {
        const envPath = path.join(process.cwd(), ".env.local")
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, "utf8")
            fileFlag = /^\s*PORTRAIT_INSECURE_TLS\s*=\s*1\s*$/m.test(content)
        }
    } catch { /* swallow */ }
    if (envFlag || fileFlag) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
    }
}
maybeDisableTlsVerification()

import Replicate from "replicate"
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal-node"
import { PNG } from "pngjs"

import { safeSlug, safeNickSlug, safeTeamName } from "@/lib/safe-branding/name-transform"
import { derivePortraitFeatures, fnv1aHash } from "@/lib/safe-branding/portrait-features"
import { buildKontextPrompt } from "@/lib/safe-branding/portrait-prompt"

// ============================================================
// CONFIG
// ============================================================

const REPO_ROOT = process.cwd()
const RAW_DIR = path.join(REPO_ROOT, "raw-data", "snapshot")
const SANITIZED_DIR = path.join(REPO_ROOT, "public", "data", "snapshot")
const ASSETS_DIR = path.join(REPO_ROOT, "public", "assets", "teams")

const MODEL = (process.env.PORTRAIT_MODEL || "black-forest-labs/flux-kontext-pro") as `${string}/${string}`
const LIMIT = process.env.PORTRAIT_LIMIT ? parseInt(process.env.PORTRAIT_LIMIT, 10) : Infinity
// When account credit is below $5, Replicate throttles to 6 req/min with a
// burst of 1 — concurrency >1 is then almost always a net loss because every
// extra request triggers a 429 and queues for several seconds. Default to 1
// to be safe; user can bump it back up once they have $5+ in credit.
const CONCURRENCY = parseInt(process.env.PORTRAIT_CONCURRENCY || "1", 10)
const FORCE = !!process.env.PORTRAIT_FORCE
const TRANSPARENT_BG = process.env.PORTRAIT_TRANSPARENT_BG !== "0"  // default ON
// REBG_ONLY is declared near the top of the file (before the token check).

// @imgly model knob. The node bundle only ships 'small' and 'medium' even
// though the schema advertises 'large'. We use medium + heavy post-processing.
const BG_QUALITY = (process.env.PORTRAIT_BG_QUALITY || "medium") as "small" | "medium"

// Alpha cleanup thresholds. Below LO → fully transparent (kills white halo).
// Above HI → fully opaque (sharp edge). In between → linearly stretched so the
// anti-aliased edge stays smooth but tighter.
const ALPHA_LO = parseInt(process.env.PORTRAIT_ALPHA_LO || "100", 10)
const ALPHA_HI = parseInt(process.env.PORTRAIT_ALPHA_HI || "180", 10)
// 1-pixel morphological erosion of the alpha mask before clamping eliminates
// the last bit of fuzzy white-fringe pixels at the silhouette. Set to 0 for no
// erosion, 1 for tight cut (default), 2 for very aggressive (may cut hair).
const ALPHA_ERODE = parseInt(process.env.PORTRAIT_ALPHA_ERODE || "1", 10)
// Chroma decontamination thresholds. Algorithm:
//   For each edge-zone pixel, compute luma and saturation. If luma > MIN_LUMA
//   AND saturation < MAX_SAT, it's a near-neutral light color → background bleed.
//
//   Examples:
//     pure white (255,255,255): luma=255, sat=0    → bg ✓
//     pale blue   (210,215,220): luma=215, sat=0.05 → bg ✓
//     warm peach  (255,210,180): luma=224, sat=0.29 → fg ✓ (saturation saves it)
//     dark skin   (180,140,110): luma=148, sat=0.39 → fg ✓ (low luma)
//     teeth/eye   (245,245,245): luma=245, sat=0    → bg ✗ (false positive risk)
//
// The teeth-eye false positive is mitigated by erosion + alpha clamp not
// touching pixels with alpha == 255 (deep foreground).
const BG_MIN_LUMA = parseInt(process.env.PORTRAIT_BG_MIN_LUMA || "190", 10)
const BG_MAX_SAT = parseFloat(process.env.PORTRAIT_BG_MAX_SAT || "0.18")
// Corner sample size — pixels per corner used to learn this image's actual
// background color. Larger = more robust to JPEG-style noise but slower.
const BG_SAMPLE_RADIUS = parseInt(process.env.PORTRAIT_BG_SAMPLE_RADIUS || "8", 10)
// Pixel is bg-color if its RGB is within this Euclidean distance of the
// corner-sampled bg color. Adapts to "not-quite-white" bg from Flux.
const BG_COLOR_DISTANCE = parseInt(process.env.PORTRAIT_BG_COLOR_DIST || "35", 10)

// How many top-ranked teams to consider for baking. Default 20 covers all
// ELITE + top 10 PRO. Set higher to extend down the rank list (21+ are PRO
// teams ranked by reputation).
const MAX_TEAMS = parseInt(process.env.PORTRAIT_MAX_TEAMS || "20", 10)

// Soft budget cap in USD. When set, the script tracks running Flux cost and
// stops issuing new Flux calls when the next one would exceed this budget.
// Local bg-removal is free and continues regardless.
const BUDGET_USD = parseFloat(process.env.PORTRAIT_BUDGET_USD || "0")  // 0 = no cap
// Estimated $ per Flux Kontext Pro call. Used for budget math only.
const PRICE_PER_IMAGE_USD = parseFloat(process.env.PORTRAIT_PRICE_PER_IMAGE_USD || "0.04")
// Spatial halo killer radius. Any pixel with bg-like RGB AND a transparent
// pixel within this many pixels (Chebyshev distance) gets force-killed,
// REGARDLESS of its alpha value. This catches halo pixels that @imgly thinks
// are deep foreground (alpha 240+) because they're geometrically obvious —
// sitting right next to the background.
const HALO_KILL_RADIUS = parseInt(process.env.PORTRAIT_HALO_RADIUS || "4", 10)
// More permissive bg-color distance specifically for the spatial killer.
// Spatial proximity already constrains us to silhouette edges, so we can
// afford to be generous about color similarity.
const HALO_COLOR_DISTANCE = parseInt(process.env.PORTRAIT_HALO_COLOR_DIST || "60", 10)

// Paste-safe token loading: prefer process env, but fall back to a single-line
// `.env.local` so the user never has to put the token on the command line.
function loadTokenFromEnvFile(): string | undefined {
    const envPath = path.join(REPO_ROOT, ".env.local")
    if (!fs.existsSync(envPath)) return undefined
    const content = fs.readFileSync(envPath, "utf8")
    for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*REPLICATE_API_TOKEN\s*=\s*(.+?)\s*$/)
        if (m) return m[1].replace(/^["']|["']$/g, "")
    }
    return undefined
}

const tokenFromEnv = process.env.REPLICATE_API_TOKEN
const tokenFromFile = loadTokenFromEnvFile()
const TOKEN = tokenFromEnv || tokenFromFile

// REBG_ONLY mode does no Replicate calls at all (background removal is local
// via @imgly), so the token requirement is conditional.
const REBG_ONLY = !!process.env.PORTRAIT_REBG  // declared early so we can gate the token check

if (!REBG_ONLY && !TOKEN) {
    console.error("❌ REPLICATE_API_TOKEN is not set (required for the Flux step).")
    console.error("")
    console.error("   Safer setup (recommended): create a file `.env.local` at the repo root with:")
    console.error("       REPLICATE_API_TOKEN=r8_your_token_here")
    console.error("   Then run: npm run bake:portraits")
    console.error("")
    console.error("   .env.local is gitignored, and you never have to paste the token in the terminal.")
    console.error("   Get a token at https://replicate.com/account/api-tokens")
    console.error("")
    console.error("   Tip: just want to make existing PNGs transparent without spending credit?")
    console.error("        Run with PORTRAIT_REBG=1 — does local bg-removal only, no token needed.")
    process.exit(1)
}

const replicate = TOKEN ? new Replicate({ auth: TOKEN }) : null

// Token preview for the banner. Shows source + first/last 4 chars so you can
// see at a glance whether the script is using the token you think it is.
function tokenPreview(): string {
    if (!TOKEN) return "(none — REBG_ONLY)"
    const head = TOKEN.slice(0, 4)
    const tail = TOKEN.slice(-4)
    const source = tokenFromEnv ? "process.env" : "(.env.local)"
    return `${head}…${tail}  ${source}`
}

// ============================================================
// TYPES
// ============================================================

interface RawTeam {
    id: string
    name: string
    tier: string
    reputation: number
    fanbase?: number
    rosterIds: string[]
}

interface RawPlayer {
    id: string
    nickname: string
    name?: string
    portraitPath?: string  // e.g. "/assets/teams/vitality/players/zywoo.webp"
}

interface SanitizedPlayer {
    id: string
    nickname: string
    portraitPath: string
    [k: string]: any
}

interface BakeJob {
    rawPlayer: RawPlayer
    sanitizedId: string
    sourceWebpAbs: string
    targetPngAbs: string
    targetPngWebPath: string  // e.g. "/assets/teams/vitalis/players/syvoo.png"
}

// ============================================================
// HELPERS
// ============================================================

function loadJson<T>(p: string): T {
    return JSON.parse(fs.readFileSync(p, "utf8"))
}

function ensureDir(p: string) {
    fs.mkdirSync(p, { recursive: true })
}

/**
 * Mirror the team-pass logic in sanitize-snapshot.ts so we know which
 * sanitized team folder a given raw team id maps to.
 */
function deriveSanitizedTeamDir(raw: RawTeam): string {
    const idParts = (raw.id || "").split("_")
    const oldSlug = idParts[2] || ""
    const newName = safeTeamName(raw.name || "")
    const newSlug = safeSlug(newName)
    return newSlug || oldSlug
}

/**
 * Mirror the player-pass logic to build the sanitized id and asset path.
 */
function derivePlayerSanitized(raw: RawPlayer, sanitizedTeamDir: string) {
    const oldNick = raw.nickname || raw.name || ""
    const idParts = (raw.id || "").split("_")
    const rank = idParts[1] || "0"
    const newId = `player_${rank}_${sanitizedTeamDir}_${safeNickSlug(oldNick)}`
    const fileSlug = safeNickSlug(oldNick)
    return { newId, fileSlug }
}

function pickTopTeams(teams: RawTeam[], n: number): RawTeam[] {
    // ELITE first (by reputation desc), then PRO until we hit n.
    const tierRank = (t: string) => (t === "ELITE" ? 0 : t === "PRO" ? 1 : t === "SEMI_PRO" ? 2 : 3)
    return [...teams]
        .filter(t => Array.isArray(t.rosterIds) && t.rosterIds.length > 0)
        .sort((a, b) => {
            const tr = tierRank(a.tier) - tierRank(b.tier)
            if (tr !== 0) return tr
            return (b.reputation || 0) - (a.reputation || 0)
        })
        .slice(0, n)
}

async function fileToDataUrl(absPath: string): Promise<string> {
    const buf = await fs.promises.readFile(absPath)
    const ext = path.extname(absPath).toLowerCase().slice(1)
    const mime = ext === "webp" ? "image/webp" : ext === "png" ? "image/png" : "image/jpeg"
    return `data:${mime};base64,${buf.toString("base64")}`
}

async function downloadToFile(url: string, absPath: string): Promise<void> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download failed ${res.status} ${url}`)
    const buf = Buffer.from(await res.arrayBuffer())
    ensureDir(path.dirname(absPath))
    await fs.promises.writeFile(absPath, buf)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Walk the Error.cause chain (Node 16+ undici-style nested errors) and produce
 * one readable string. Without this, "fetch failed" hides the real cause
 * (DNS error, TLS handshake fail, ECONNREFUSED, payload-too-large, etc.).
 */
function formatError(err: unknown): string {
    const lines: string[] = []
    let current: any = err
    let depth = 0
    while (current && depth < 6) {
        const msg = String(current.message ?? current)
        const code = current.code ? ` [${current.code}]` : ""
        const name = current.name && current.name !== "Error" ? `${current.name}: ` : ""
        lines.push(`${depth === 0 ? "" : "  caused by: "}${name}${msg}${code}`)
        current = current.cause
        depth++
    }
    return lines.join("\n")
}

/**
 * One-call auth ping. Tries to read the Flux Kontext model's metadata via the
 * Replicate API. If the token is valid we get a 200, otherwise a clear error.
 * Catches auth/network problems before we waste any time on real bake jobs.
 */
async function verifyAuth(): Promise<void> {
    if (!replicate) return  // REBG_ONLY mode, no auth needed
    console.log(`Verifying Replicate auth...`)
    try {
        // The SDK exposes models.get(); pinging the Flux Kontext model is a
        // cheap, deterministic auth check. Times out fast on network issues.
        const [owner, name] = MODEL.split("/")
        await replicate.models.get(owner, name)
        console.log(`  ✓ auth OK`)
        console.log("")
    } catch (err) {
        const errStr = formatError(err)
        const isTlsError = /UNABLE_TO_VERIFY_LEAF_SIGNATURE|SELF_SIGNED_CERT|CERT_HAS_EXPIRED|UNABLE_TO_GET_ISSUER_CERT/i.test(errStr)

        console.error("  ✗ Replicate auth check FAILED")
        console.error("")
        console.error(errStr)
        console.error("")

        if (isTlsError) {
            console.error("  Diagnosed: TLS certificate cannot be verified.")
            console.error("")
            console.error("  This is NOT a token problem. Something on your machine (antivirus")
            console.error("  with HTTPS scanning, corporate VPN, or proxy) is intercepting the")
            console.error("  connection with a certificate Node doesn't trust.")
            console.error("")
            console.error("  Quick fix (safe for local image baking):")
            console.error("    $env:NODE_TLS_REJECT_UNAUTHORIZED=\"0\"")
            console.error("    npm run bake:portraits")
            console.error("")
            console.error("  Proper fix (find your AV/proxy's root cert, then):")
            console.error("    $env:NODE_EXTRA_CA_CERTS=\"C:\\path\\to\\corp-root.pem\"")
            console.error("")
            console.error("  Or run with PORTRAIT_INSECURE_TLS=1 baked into the script:")
            console.error("    $env:PORTRAIT_INSECURE_TLS=\"1\"; npm run bake:portraits")
        } else {
            console.error("  Common causes:")
            console.error("    - Token revoked or wrong: regenerate at https://replicate.com/account/api-tokens")
            console.error("    - .env.local has a typo: open it and check REPLICATE_API_TOKEN=r8_...")
            console.error("    - PowerShell still has the old token cached: close + reopen the window")
            console.error("    - Outbound HTTPS blocked: corporate firewall or VPN intercepting api.replicate.com")
            console.error("    - Replicate API outage: check https://status.replicate.com")
        }
        process.exit(1)
    }
}

/**
 * Wrap a Replicate call so 429 (rate limit) errors back off and retry. Uses
 * the `retry_after` value the API returns when available, otherwise grows
 * exponentially. Replicate throttles to 6 req/min when account credit < $5,
 * which is exactly when batched bake jobs hurt the most.
 */
async function withRateLimitRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 6,
): Promise<T> {
    let attempt = 0
    while (true) {
        try {
            return await fn()
        } catch (err: any) {
            const msg = String(err?.message || err)
            const is429 = msg.includes("429") || msg.includes("Too Many Requests")
            if (!is429 || attempt >= maxRetries) throw err
            // Try to extract retry_after from the error body Replicate returns.
            const m = msg.match(/"retry_after"\s*:\s*(\d+)/)
            const retryAfter = m ? parseInt(m[1], 10) : 0
            const backoffSec = Math.max(retryAfter + 1, Math.min(60, 2 ** attempt))
            console.log(`  ⏳ ${label}: rate-limited, waiting ${backoffSec}s (attempt ${attempt + 1}/${maxRetries})`)
            await sleep(backoffSec * 1000)
            attempt++
        }
    }
}

/**
 * Has this PNG already been through the *new* bg-removal pipeline?
 *
 * The new pipeline (sharp → png) always emits color type 6 (full RGBA). The
 * old pipeline (@imgly direct) emitted color type 3 + tRNS (paletted with
 * key transparency). So checking for color type 6 specifically is what tells
 * us "this file already has the cleanest alpha treatment available."
 *
 * Files with type 3 + tRNS are technically transparent but had the white-
 * fringe halo problem; we *do* want to re-process those to apply the alpha
 * cleanup pass.
 */
function pngHasCleanAlpha(absPath: string): boolean {
    try {
        const fd = fs.openSync(absPath, "r")
        const buf = Buffer.alloc(26)
        fs.readSync(fd, buf, 0, 26, 0)
        fs.closeSync(fd)
        if (buf.length < 26) return false
        return buf[25] === 6
    } catch {
        return false
    }
}

/**
 * Run an existing PNG file through the Replicate background-removal model
 * and overwrite it with the transparent (RGBA) version.
 */
// ============================================================
// BG-REMOVAL PIPELINE — pure JS, four stages
// ============================================================
//
//   1. Segmentation — @imgly medium (U2-Net distilled, ~120MB ONNX, ~1–2s/img).
//      Native binary: sharp is NOT used here, only WASM-based ORT, so this
//      part works on any platform.
//   2. Chroma decontamination — for any edge-zone pixel whose RGB is near-
//      white, force alpha to 0. Catches white-bleed pixels that @imgly
//      mis-classified as foreground (the visible halo).
//   3. Morphological erosion — shrink the alpha mask by N pixels to eat into
//      the residual soft-edge fringe.
//   4. Alpha curve clamp — < LO → 0, > HI → 255, in-between linearly
//      stretched. Sharpens edges without making them jagged.

async function imglyRemoveBackgroundBuf(inputBuf: Buffer): Promise<Buffer> {
    const inputBlob = new Blob([inputBuf], { type: "image/png" })
    const cutBlob = await imglyRemoveBackground(inputBlob, {
        model: BG_QUALITY,
        output: { format: "image/png", quality: 1 },
    })
    return Buffer.from(await cutBlob.arrayBuffer())
}

/**
 * Sample pixels from the corners to learn the actual background color.
 * Skips already-transparent pixels (which would happen on a re-run over a
 * bg-removed PNG). If no opaque corner pixel survives the filter, fall back
 * to near-white (the Flux prompt's intended bg).
 */
function learnBackgroundColor(originalPng: PNG, radius: number): [number, number, number] {
    const w = originalPng.width
    const h = originalPng.height
    const data = originalPng.data
    const samples: Array<[number, number, number]> = []
    const corners: Array<[number, number]> = [
        [0, 0], [w - radius, 0], [0, h - radius], [w - radius, h - radius],
    ]
    for (const [cx, cy] of corners) {
        let r = 0, g = 0, b = 0, n = 0
        for (let y = cy; y < cy + radius && y < h; y++) {
            for (let x = cx; x < cx + radius && x < w; x++) {
                const i = (y * w + x) * 4
                if (data[i + 3] < 240) continue  // skip transparent / soft-edge corner pixels
                r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
            }
        }
        if (n > 0) samples.push([r / n, g / n, b / n])
    }
    if (samples.length === 0) return [248, 248, 248]  // fallback: near-white from prompt
    samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))
    const mid = samples[Math.floor(samples.length / 2)]
    return [Math.round(mid[0]), Math.round(mid[1]), Math.round(mid[2])]
}

function colorDistance(r: number, g: number, b: number, bg: [number, number, number]): number {
    const dr = r - bg[0]
    const dg = g - bg[1]
    const db = b - bg[2]
    return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Stage 2 — chroma decontamination. Pixel is "bg-bleed" if EITHER:
 *   (a) RGB distance from the corner-learned bg color < BG_COLOR_DISTANCE, OR
 *   (b) luma > BG_MIN_LUMA AND saturation < BG_MAX_SAT (near-neutral light).
 *
 * Operates only on edge-zone pixels (alpha 0-240) so deep foreground (eyes,
 * teeth, white shirt details) is never touched.
 */
function decontaminateWhiteBleed(
    png: PNG,
    bgColor: [number, number, number],
): void {
    const data = png.data
    const minLuma = BG_MIN_LUMA
    const maxSat = BG_MAX_SAT
    const colorDist = BG_COLOR_DISTANCE
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a === 0 || a >= 240) continue  // skip transparent + deep foreground

        const r = data[i], g = data[i + 1], b = data[i + 2]
        let isBg = false

        // Test (a): perceptual distance from learned bg color
        if (colorDistance(r, g, b, bgColor) < colorDist) isBg = true

        // Test (b): generic "near-neutral light" using luma + saturation
        if (!isBg) {
            const luma = 0.299 * r + 0.587 * g + 0.114 * b
            if (luma >= minLuma) {
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const sat = max === 0 ? 0 : (max - min) / max
                if (sat < maxSat) isBg = true
            }
        }

        if (isBg) data[i + 3] = 0
    }
}

/**
 * Stage 2b — color spill suppression. For edge-zone pixels that *survived*
 * decontamination but are visibly tinted toward the bg color, pull their RGB
 * back toward neutral. This eliminates the "lit-up rim" effect where soft
 * edges look brighter than the underlying foreground because they have bg
 * color contamination mixed in.
 */
function suppressSpill(png: PNG, bgColor: [number, number, number]): void {
    const data = png.data
    const [bgR, bgG, bgB] = bgColor
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a === 0 || a >= 220) continue  // only act on softer edge zone

        // Compute "how much this pixel leans toward bg color".
        // If the pixel's RGB has all three channels closer to bgRGB than to
        // (R-spillage, G-spillage, B-spillage), pull back proportionally.
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const dToBg = colorDistance(r, g, b, bgColor)
        // The closer to bg color (within edge zone), the more we pull alpha down.
        if (dToBg < 80) {
            // pull alpha down by up to 50% based on closeness to bg color.
            const pull = 1 - dToBg / 80
            data[i + 3] = Math.round(a * (1 - 0.5 * pull))
        }
    }
}

/**
 * Stage 2c — SPATIAL halo killer. The decisive halo-fix.
 *
 * For each pixel, asks two independent questions:
 *   (1) Does your RGB look like the background color?
 *   (2) Are you within HALO_KILL_RADIUS pixels of an already-transparent area?
 * If both yes → force alpha=0, REGARDLESS of current alpha value.
 *
 * This is what catches the white halo pixels @imgly assigned alpha=240+ to
 * (i.e., "deep foreground" per the model). They're not deep foreground —
 * they're literally bg-color paint smeared along the silhouette. The spatial
 * proximity test ensures we only target pixels actually at the edge, so
 * face/beard/hoodie interior pixels that happen to look pale are never
 * touched (no transparent neighbor within R=4 pixels).
 *
 * Implementation uses a 1-pass distance-to-transparent expansion via dilation
 * of the transparent set. O(W*H*R) which is sub-second even at 1024×1024.
 */
function killHaloPixels(
    png: PNG,
    bgColor: [number, number, number],
    radius: number,
    colorDist: number,
): void {
    const w = png.width
    const h = png.height
    const data = png.data

    // Build a transparency mask: 1 if alpha < 32, 0 otherwise.
    let transparent = new Uint8Array(w * h)
    for (let i = 0, j = 3; i < transparent.length; i++, j += 4) {
        transparent[i] = data[j] < 32 ? 1 : 0
    }

    // Dilate the transparent region by `radius` pixels using 8-connected
    // expansion. After this pass, `nearTrans[i]` = 1 means pixel i is within
    // `radius` Chebyshev distance of an originally-transparent pixel.
    let nearTrans = transparent
    for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(nearTrans.length)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (nearTrans[y * w + x]) { next[y * w + x] = 1; continue }
                let any = 0
                if (y > 0 && nearTrans[(y - 1) * w + x]) any = 1
                else if (y < h - 1 && nearTrans[(y + 1) * w + x]) any = 1
                else if (x > 0 && nearTrans[y * w + (x - 1)]) any = 1
                else if (x < w - 1 && nearTrans[y * w + (x + 1)]) any = 1
                else if (y > 0 && x > 0 && nearTrans[(y - 1) * w + (x - 1)]) any = 1
                else if (y > 0 && x < w - 1 && nearTrans[(y - 1) * w + (x + 1)]) any = 1
                else if (y < h - 1 && x > 0 && nearTrans[(y + 1) * w + (x - 1)]) any = 1
                else if (y < h - 1 && x < w - 1 && nearTrans[(y + 1) * w + (x + 1)]) any = 1
                next[y * w + x] = any
            }
        }
        nearTrans = next
    }

    // For each pixel near transparent, kill if its RGB is bg-colored.
    const minLuma = BG_MIN_LUMA
    const maxSat = BG_MAX_SAT
    for (let i = 0; i < transparent.length; i++) {
        if (!nearTrans[i] || transparent[i]) continue
        const j = i * 4
        const r = data[j], g = data[j + 1], b = data[j + 2]

        // Test (a): close to learned bg color
        let isBg = colorDistance(r, g, b, bgColor) < colorDist
        // Test (b): generic neutral-light test (catches white-ish even when
        // learned bgColor is wrong from a re-run with transparent corners)
        if (!isBg) {
            const luma = 0.299 * r + 0.587 * g + 0.114 * b
            if (luma >= minLuma) {
                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const sat = max === 0 ? 0 : (max - min) / max
                if (sat < maxSat) isBg = true
            }
        }

        if (isBg) data[j + 3] = 0
    }
}

/**
 * Stage 3 — morphological erosion. Each pass shrinks the foreground inward
 * by 1 pixel by taking the minimum alpha of each pixel's 8-connected
 * neighborhood.
 */
function erodeAlpha(png: PNG, radius: number): void {
    if (radius <= 0) return
    const w = png.width
    const h = png.height
    const data = png.data
    let alpha = new Uint8Array(w * h)
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j]

    for (let r = 0; r < radius; r++) {
        const next = new Uint8Array(alpha.length)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let m = 255
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = y + dy
                    if (ny < 0 || ny >= h) { m = 0; break }
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx
                        if (nx < 0 || nx >= w) { m = 0; break }
                        const v = alpha[ny * w + nx]
                        if (v < m) m = v
                    }
                    if (m === 0) break
                }
                next[y * w + x] = m
            }
        }
        alpha = next
    }

    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) data[j] = alpha[i]
}

async function removeBackground(absPath: string, _label: string): Promise<void> {
    const inputBuf = await fs.promises.readFile(absPath)

    // Stage 0 — learn this image's actual bg color from the corners of the
    // ORIGINAL (pre-bg-removal) input. We have to do this BEFORE @imgly eats
    // the corners, otherwise we'd be sampling transparent pixels.
    const inputPng = PNG.sync.read(inputBuf)
    const bgColor = learnBackgroundColor(inputPng, BG_SAMPLE_RADIUS)

    // Stage 1 — semantic segmentation
    const cutBuf = await imglyRemoveBackgroundBuf(inputBuf)
    const png = PNG.sync.read(cutBuf)

    // Stage 2 — chroma decontamination on edge-zone pixels
    decontaminateWhiteBleed(png, bgColor)

    // Stage 2b — spill suppression for surviving edge pixels
    suppressSpill(png, bgColor)

    // Stage 2c — SPATIAL halo killer. The decisive pass: kills bg-colored
    // pixels next to transparent zones REGARDLESS of alpha. This is what
    // finally eliminates the persistent white halo around hair/headphones
    // that survives all the alpha-only passes above.
    killHaloPixels(png, bgColor, HALO_KILL_RADIUS, HALO_COLOR_DISTANCE)

    // Stage 3 — morphological erosion
    erodeAlpha(png, ALPHA_ERODE)

    // Stage 4 — alpha curve clamp
    const lo = ALPHA_LO
    const hi = ALPHA_HI
    const span = Math.max(1, hi - lo)
    const data = png.data
    for (let i = 3; i < data.length; i += 4) {
        const a = data[i]
        if (a <= lo) data[i] = 0
        else if (a >= hi) data[i] = 255
        else data[i] = Math.round(((a - lo) * 255) / span)
    }

    const out = PNG.sync.write(png, {
        colorType: 6,
        bitDepth: 8,
        deflateLevel: 9,
        deflateStrategy: 3,
    })
    await fs.promises.writeFile(absPath, out)
}

/** Sentinel: thrown to signal "skipped due to budget" — caught by the run loop and counted separately. */
class BudgetExhaustedError extends Error {
    constructor(public spent: number, public budget: number) {
        super(`budget exhausted ($${spent.toFixed(2)} spent of $${budget.toFixed(2)} budget)`)
        this.name = "BudgetExhaustedError"
    }
}

interface CostTracker {
    spent: number  // total USD spent on Flux so far
}

async function bakeOne(job: BakeJob, cost: CostTracker): Promise<void> {
    const features = derivePortraitFeatures(job.sanitizedId)

    // Step 1 — Flux Kontext img2img: generate the Pixar-style portrait. Skipped
    // entirely in REBG_ONLY mode (we just bg-remove the existing PNG below).
    const needFlux = !REBG_ONLY && (FORCE || !fs.existsSync(job.targetPngAbs))
    if (needFlux) {
        // Budget gate: if the next Flux call would push us past the cap, skip it.
        if (BUDGET_USD > 0 && cost.spent + PRICE_PER_IMAGE_USD > BUDGET_USD) {
            throw new BudgetExhaustedError(cost.spent, BUDGET_USD)
        }

        const prompt = buildKontextPrompt(features)
        const seed = features.seed % 0x7FFFFFFF  // fits in i32, Replicate-friendly
        const inputImage = await fileToDataUrl(job.sourceWebpAbs)

        if (!replicate) {
            throw new Error("Flux step requires REPLICATE_API_TOKEN — none was provided.")
        }
        const replicateClient = replicate
        const output: any = await withRateLimitRetry(
            () => replicateClient.run(MODEL, {
                input: {
                    prompt,
                    input_image: inputImage,
                    output_format: "png",
                    aspect_ratio: "1:1",
                    safety_tolerance: 2,
                    seed,
                },
            }),
            `flux ${job.rawPlayer.nickname}`,
        )

        let imageUrl: string | null = null
        if (typeof output === "string") imageUrl = output
        else if (Array.isArray(output) && typeof output[0] === "string") imageUrl = output[0]
        else if (output && typeof output.url === "function") imageUrl = String(output.url())
        else if (output && typeof output.url === "string") imageUrl = output.url

        if (!imageUrl) {
            throw new Error(`No image URL in Flux response for ${job.rawPlayer.nickname}`)
        }
        await downloadToFile(imageUrl, job.targetPngAbs)
        // Only charge for confirmed successes (rate-limit retries don't double-charge
        // because withRateLimitRetry already gives us the final response).
        cost.spent += PRICE_PER_IMAGE_USD
    }

    // Step 2 — background removal. Only runs if the file exists and doesn't
    // already have alpha. Cheap (~$0.0005/image) so we always check.
    if (TRANSPARENT_BG && fs.existsSync(job.targetPngAbs) && !pngHasCleanAlpha(job.targetPngAbs)) {
        await removeBackground(job.targetPngAbs, job.rawPlayer.nickname)
    }
}

async function runWithConcurrency<T>(
    items: T[],
    limit: number,
    fn: (item: T, i: number) => Promise<void>,
): Promise<{
    ok: T[]
    failed: Array<{ item: T; err: unknown }>
    budgetSkipped: T[]
}> {
    const ok: T[] = []
    const failed: Array<{ item: T; err: unknown }> = []
    const budgetSkipped: T[] = []
    let idx = 0
    let budgetExhausted = false
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (idx < items.length) {
            const i = idx++
            const item = items[i]
            // Once we've hit budget, fast-track remaining jobs as skipped
            // without invoking fn at all — saves wall-clock on big rosters.
            if (budgetExhausted) { budgetSkipped.push(item); continue }
            try {
                await fn(item, i)
                ok.push(item)
            } catch (err) {
                if (err instanceof BudgetExhaustedError) {
                    budgetExhausted = true
                    budgetSkipped.push(item)
                } else {
                    failed.push({ item, err })
                }
            }
        }
    })
    await Promise.all(workers)
    return { ok, failed, budgetSkipped }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log("============================================================")
    console.log("  Bake Pixar-style portraits (Replicate img2img + local bg-removal)")
    console.log("============================================================")
    console.log(`Token:        ${tokenPreview()}`)
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        console.log(`TLS check:    DISABLED (PORTRAIT_INSECURE_TLS=1) — bypass corp-AV interception`)
    }
    console.log(`Flux model:   ${MODEL}`)
    console.log(`BG removal:   @imgly '${BG_QUALITY}' + corner-bg + decontam(luma>${BG_MIN_LUMA},sat<${BG_MAX_SAT}) + spill-suppress + halo-kill(R=${HALO_KILL_RADIUS},dist=${HALO_COLOR_DISTANCE}) + erode=${ALPHA_ERODE} + clamp ${ALPHA_LO}-${ALPHA_HI}`)
    console.log(`Concurrency:  ${CONCURRENCY}`)
    console.log(`Force rebake: ${FORCE}`)
    if (LIMIT !== Infinity) console.log(`Limit:        ${LIMIT}`)
    console.log("")

    // Verify Replicate auth BEFORE doing any work. If the token is dead, fail
    // immediately with a real error instead of getting "fetch failed" on every
    // single bake job later.
    await verifyAuth()

    const rawTeams = loadJson<RawTeam[]>(path.join(RAW_DIR, "teams.json"))
    const rawPlayers = loadJson<RawPlayer[]>(path.join(RAW_DIR, "players.json"))
    const sanitizedPlayersPath = path.join(SANITIZED_DIR, "players.json")
    const sanitizedPlayers = loadJson<SanitizedPlayer[]>(sanitizedPlayersPath)

    const topTeams = pickTopTeams(rawTeams, MAX_TEAMS)
    console.log(`Top ${MAX_TEAMS} teams: ${topTeams.map(t => t.name).join(", ")}`)
    if (BUDGET_USD > 0) {
        const maxFlux = Math.floor(BUDGET_USD / PRICE_PER_IMAGE_USD)
        console.log(`Budget cap:   $${BUDGET_USD.toFixed(2)} (~${maxFlux} Flux calls at $${PRICE_PER_IMAGE_USD}/img)`)
    }
    console.log("")

    // Build the bake jobs.
    const topTeamRosterIds = new Set(topTeams.flatMap(t => t.rosterIds))
    const rawById = new Map(rawPlayers.map(p => [p.id, p]))
    const teamById = new Map(rawTeams.map(t => [t.id, t]))

    const allJobs: BakeJob[] = []
    for (const team of topTeams) {
        const sanitizedTeamDir = deriveSanitizedTeamDir(team)
        for (const rosterId of team.rosterIds) {
            const raw = rawById.get(rosterId)
            if (!raw) continue
            const { newId, fileSlug } = derivePlayerSanitized(raw, sanitizedTeamDir)

            const sourceWebp = raw.portraitPath?.startsWith("/")
                ? path.join(REPO_ROOT, "public", raw.portraitPath)
                : null
            if (!sourceWebp || !fs.existsSync(sourceWebp)) {
                console.warn(`  ⚠ skipping ${team.name}/${raw.nickname}: source photo not found at ${raw.portraitPath}`)
                continue
            }

            const targetPng = path.join(ASSETS_DIR, sanitizedTeamDir, "players", `${fileSlug}.png`)
            const targetWebPath = `/assets/teams/${sanitizedTeamDir}/players/${fileSlug}.png`

            allJobs.push({
                rawPlayer: raw,
                sanitizedId: newId,
                sourceWebpAbs: sourceWebp,
                targetPngAbs: targetPng,
                targetPngWebPath: targetWebPath,
            })
        }
    }

    // What to process this run:
    //   - FORCE=1: every job, re-bake Flux + re-bg-remove (re-pays for Flux!).
    //   - REBG_ONLY=1: every existing PNG, only run local bg-removal (free).
    //     Use this when the bg-removal pipeline has improved and you want
    //     to re-apply it to portraits baked under the old pipeline.
    //   - REBG_EXISTING=1: like default, but ALSO re-bg-remove existing PNGs.
    //   - Default: ONLY process missing PNGs (Flux + bg-remove). Existing
    //     ones are assumed correct and skipped entirely — fast, deterministic.
    const REBG_EXISTING = !!process.env.PORTRAIT_REBG_EXISTING
    const needsWork = (j: BakeJob): boolean => {
        if (FORCE) return true
        const exists = fs.existsSync(j.targetPngAbs)
        if (REBG_ONLY) return exists
        if (!exists) return true
        if (REBG_EXISTING) return TRANSPARENT_BG
        // Default: existing PNG, skip it. The user can opt into re-processing
        // via REBG_ONLY (free) or REBG_EXISTING (also processes new ones).
        return false
    }
    const jobs = allJobs.filter(needsWork).slice(0, LIMIT)
    const willFlux = jobs.filter(j => !REBG_ONLY && (FORCE || !fs.existsSync(j.targetPngAbs))).length
    const willBgOnly = jobs.length - willFlux
    console.log(`Jobs to run:  ${jobs.length}  (${willFlux} Flux+bg, ${willBgOnly} bg-only)  · skipping ${allJobs.length - jobs.length}`)
    if (REBG_ONLY) console.log(`Mode:         REBG_ONLY — skipping Flux on all jobs`)
    if (REBG_EXISTING) console.log(`Mode:         REBG_EXISTING — re-bg-remove existing PNGs in addition to baking new ones`)
    console.log("")

    const cost: CostTracker = { spent: 0 }
    if (jobs.length > 0) {
        let done = 0
        const t0 = Date.now()
        const { ok, failed, budgetSkipped } = await runWithConcurrency(jobs, CONCURRENCY, async (job) => {
            await bakeOne(job, cost)
            done++
            const costStr = cost.spent > 0 ? ` ($${cost.spent.toFixed(2)} so far)` : ""
            console.log(`  [${done}/${jobs.length}] ${job.rawPlayer.nickname} → ${path.relative(REPO_ROOT, job.targetPngAbs)}${costStr}`)
        })
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
        console.log("")
        console.log(`✓ Baked ${ok.length}/${jobs.length} in ${elapsed}s — spent ~$${cost.spent.toFixed(2)} on Flux`)
        if (budgetSkipped.length > 0) {
            console.log(`⏸ Budget halted ${budgetSkipped.length} jobs (saved ~$${(budgetSkipped.length * PRICE_PER_IMAGE_USD).toFixed(2)}):`)
            for (const item of budgetSkipped.slice(0, 12)) {
                const j = item as BakeJob
                console.log(`   ${j.rawPlayer.nickname} (${path.basename(path.dirname(path.dirname(j.targetPngAbs)))})`)
            }
            if (budgetSkipped.length > 12) console.log(`   ...and ${budgetSkipped.length - 12} more`)
            console.log(`  → Top up Replicate credit and re-run to finish these.`)
        }
        if (failed.length > 0) {
            console.log(`✗ Failed ${failed.length}:`)
            for (const f of failed) {
                const j = f.item as BakeJob
                console.log(`   ${j.rawPlayer.nickname}:`)
                for (const line of formatError(f.err).split("\n")) {
                    console.log(`     ${line}`)
                }
            }
        }
    }

    // Build the pool of all baked PNG web paths (for hash-mapping the rest).
    const pool = allJobs
        .filter(j => fs.existsSync(j.targetPngAbs))
        .map(j => ({ webPath: j.targetPngWebPath, sanitizedId: j.sanitizedId }))

    if (pool.length === 0) {
        console.log("")
        console.log("⚠ Pool is empty — no JSON rewrites will happen. Check baking errors above.")
        return
    }
    console.log("")
    console.log(`Pool size: ${pool.length} unique PNGs available for non-top-20 reuse`)

    // Patch sanitized players.json: top-20 → own png, rest → hash-mapped png.
    const topTeamSanitizedIds = new Set(pool.map(p => p.sanitizedId))
    const ownPngBySanitizedId = new Map(pool.map(p => [p.sanitizedId, p.webPath]))

    let patchedTopTeam = 0
    let patchedRest = 0
    for (const sp of sanitizedPlayers) {
        if (topTeamSanitizedIds.has(sp.id)) {
            sp.portraitPath = ownPngBySanitizedId.get(sp.id)!
            patchedTopTeam++
        } else {
            const idx = fnv1aHash(sp.id) % pool.length
            sp.portraitPath = pool[idx].webPath
            patchedRest++
        }
    }

    fs.writeFileSync(sanitizedPlayersPath, JSON.stringify(sanitizedPlayers, null, 2))
    console.log(`Patched players.json: ${patchedTopTeam} unique + ${patchedRest} pool-mapped`)
    console.log("")
    console.log("✓ Done. Restart your dev server to see the new portraits.")
}

main().catch(err => {
    console.error("FATAL:", err)
    process.exit(1)
})
