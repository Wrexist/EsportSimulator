#!/usr/bin/env tsx
/** Build an unpublished, separate identity overlay from retained local originals.
 * Local possession and a community label do not establish redistribution rights.
 * Never writes to public/, careers, or the source assets. Existing output is retained.
 */
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import sharp from "sharp"
import { mapOriginalIdentities } from "./mod-identity"
import { validateModContent, validateModReferences } from "../electron/mod-content"
import { containedPath } from "../electron/local-files"

const ROOT = process.cwd()
const arg = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3)
const name = arg("name") || "real-teams-2026"
if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(name)) throw new Error("Mod name must be a plain slug")
const dry = process.argv.includes("--dry-run")
const out = path.join(ROOT, "dist-mod", name)
const hash = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex")
const read = (file: string) => JSON.parse(fs.readFileSync(containedPath(ROOT, file), "utf8"))


async function main() {
    const rawPlayers: any[] = read("raw-data/snapshot/players.json")
    const rawTeams: any[] = read("raw-data/snapshot/teams.json")
    const basePlayers: any[] = read("public/data/snapshot/players.json")
    const baseTeams: any[] = read("public/data/snapshot/teams.json")
    const { mappings, teamMappings, byBaseId } = mapOriginalIdentities(rawPlayers, rawTeams, basePlayers, baseTeams)
    // Refuse to overwrite any existing package. Pass a new --name for subsequent builds.
    if (!dry) {
        if (fs.existsSync(out)) throw new Error(`Output already exists; retained. Choose a new --name: ${out}`)
        containedPath(ROOT, `dist-mod/${name}`, true)
        fs.mkdirSync(out, { recursive: true })
    }
    const inventory: any[] = []
    const missing: any[] = []
    const copied = new Map<string, string>()
    function write(file: string, content: string | Buffer, source?: string) {
        inventory.push({ path: file, bytes: Buffer.byteLength(content), sha256: hash(content), ...(source ? { source, clearance: "unverified" } : {}) })
        if (!dry) {
            const target = containedPath(out, file, true)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.writeFileSync(target, content, { flag: "wx" })
        }
    }
    const json = (file: string, value: unknown) => write(file, JSON.stringify(value, null, 2) + "\n")
    async function image(sourceUrl: string, id: string, kind: string) {
        const relative = String(sourceUrl).replace(/^\/assets\//, "")
        if (!relative.startsWith("teams/")) { missing.push({ id, kind, source: sourceUrl, reason: "No original image path" }); return "" }
        const parsed = path.posix.parse(relative)
        let source: string
        try {
            const dir = containedPath(ROOT, `raw-data/${parsed.dir}`)
            const files = fs.readdirSync(dir).filter(f => path.parse(f).name.toLowerCase() === parsed.name.toLowerCase() && /\.(png|webp|jpe?g)$/i.test(f))
            if (!files.length) throw new Error("Original image not found")
            // Prefer the referenced extension; alternatives retain the exact original stem (including dots).
            const file = files.find(f => f.toLowerCase() === parsed.base.toLowerCase()) || files.sort()[0]
            source = `raw-data/${parsed.dir}/${file}`
            const absolute = containedPath(ROOT, source)
            if (fs.statSync(absolute).size > 8 * 1024 * 1024) throw new Error("Image exceeds 8 MiB")
            if (copied.has(source)) return copied.get(source)!
            const bytes = fs.readFileSync(absolute)
            const metadata = await sharp(bytes, { limitInputPixels: 16777216 }).metadata()
            if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages || 1) !== 1) throw new Error("Unsupported image dimensions or animation")
            const ext = metadata.format === "jpeg" ? "jpg" : metadata.format
            if (!["png", "webp", "jpg"].includes(ext || "")) throw new Error("Image bytes are not PNG, WebP or JPEG")
            // Canonical extension reflects actual bytes, without modifying the portrait.
            const dest = `assets/${parsed.dir}/${parsed.name}.${ext}`
            write(dest, bytes, source)
            copied.set(source, dest)
            return dest
        } catch (error) {
            missing.push({ id, kind, source: sourceUrl, reason: error instanceof Error ? error.message : String(error) })
            return ""
        }
    }
    const players = []
    for (const p of basePlayers) {
        const r = byBaseId.get(p.id)
        players.push({ ...p, name: r.name, nickname: r.nickname, portraitPath: await image(r.portraitPath, p.id, "portrait") })
    }
    const teams = []
    for (const [index, t] of baseTeams.entries()) {
        const r = teamMappings[index].original
        teams.push({ ...t, name: r.name, shortName: r.shortName, logoPath: await image(r.logoPath, t.id, "logo") })
    }
    const payload = { schema: 1, players, teams }
    const valid = validateModContent(payload)
    if (!valid.ok) throw new Error(valid.error)
    const refs = validateModReferences(players, teams, [])
    if (refs) throw new Error(refs)
    const baseline = Object.fromEntries(["players", "teams"].map(s => [s, hash(fs.readFileSync(containedPath(ROOT, `public/data/snapshot/${s}.json`)))]))
    const summary = { teams: teams.length, players: players.length, logos: teams.filter(t => t.logoPath).length, portraits: players.filter(p => p.portraitPath).length, missing, rawTeamsNotInBase: rawTeams.filter(t => !teamMappings.some(m => m.originalId === t.id)).map(t => ({ id: t.id, name: t.name })) }
    const manifest = { name, title: "Real Teams & Players", author: arg("author") || "Game project author (local draft)", game: "Esports Manager", schema: 1, version: "1.0.0-draft.1", appId: 4326170, teams: teams.length, players: players.length, baseline, publication: { status: "unpublished", redistribution: "unverified", intendedTiming: "After game release and clearance review", workshopItemId: null }, note: "Separate project-authored identity overlay from a retained local snapshot. Not a live roster feed, not independently community-authored, and not affiliated with the represented organizations or players." }
    json("players.json", players); json("teams.json", teams)
    json("database.json", { ...payload, manifest })
    json("identity-map.json", { method: "Unique source team number + nationality + 20 retained stats; team roster references verified", players: mappings.map(({ baseId, originalId }) => ({ baseId, originalId })), teams: teamMappings.map(({ baseId, originalId }) => ({ baseId, originalId })) })
    json("asset-review.json", summary)
    json("source-records.json", { note: "Historical source metadata retained for review, not proof of a media license or present-day roster accuracy", sources: read("raw-data/snapshot/sources.json") })
    write("README.md", `# Real Teams & Players ? unpublished local draft\n\n${summary.teams} teams; ${summary.players} players; ${summary.logos} original logos; ${summary.portraits} original portraits. Missing assets use the game's fallback and are listed in asset-review.json. Stats and roster IDs remain those of the base game.\n\nThis is a separate project-authored optional mod, not an independently made community upload. It is not distributed with the game. The originals are a retained local snapshot, not a current roster service.\n\n## Local installation (desktop, new careers only)\nBack up the current community mod folder shown in Settings ? Community Database. Close the game. Copy this package's database.json and assets folder into that community folder. Reopen the game and select Use imported database. Start a new career. Do not overwrite an existing career to test. Use base game disables the overlay for subsequent new careers. Existing careers keep their names/stats, but mod art currently requires the active package; asset pinning is still a release requirement.\n\n## Release checklist ? not cleared\nVerify every source/logo/portrait redistribution permission, attribution and applicable identity rights. A community label does not establish clearance. Verify Workshop partner configuration and agreement; test install/update/unsubscribe/offline and per-career image retention in a packaged Windows build. Create a cleared preview. Review source-records.json, identity-map.json and inventory.json. No upload or item creation occurred during this build. No release publication has been scheduled.\n`)
    if (!dry) {
        fs.writeFileSync(containedPath(out, "manifest.json", true), JSON.stringify(manifest, null, 2))
        fs.writeFileSync(containedPath(out, "inventory.json", true), JSON.stringify({ schema: 1, files: inventory }, null, 2))
        fs.writeFileSync(containedPath(out, "release-review.json", true), JSON.stringify({ status: "blocked", inventorySha256: hash(fs.readFileSync(path.join(out, "inventory.json"))), rightsEvidence: [], packagedWorkshopEvidence: [], gameReleased: false }, null, 2))
    }
    console.log(JSON.stringify({ output: out, dryRun: dry, ...summary, files: inventory.length, bytes: inventory.reduce((n, f) => n + f.bytes, 0), baseline }, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
