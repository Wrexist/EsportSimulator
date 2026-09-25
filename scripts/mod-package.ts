import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import sharp from "sharp"
import { containedPath, readBounded } from "../electron/local-files"
import { parseModContent, validateModReferences, safeAssetPath } from "../electron/mod-content"

export const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex")

/** Local preflight only: never initializes Steam or performs a network request. */
export async function inspectModPackage(root: string) {
    const read = (file: string) => JSON.parse(readBounded(root, file, 16 * 1024 * 1024))
    const manifest = read("manifest.json")
    if (manifest.game !== "Esports Manager" || manifest.schema !== 1 || manifest.appId !== 4326170) throw new Error("Incompatible game, schema or App ID")
    const inventory = read("inventory.json")
    if (inventory.schema !== 1 || !Array.isArray(inventory.files) || inventory.files.length > 20000) throw new Error("Invalid inventory")
    const listed = new Set<string>()
    let bytes = 0
    for (const entry of inventory.files) {
        if (typeof entry.path !== "string" || listed.has(entry.path)) throw new Error("Invalid or duplicate inventory path")
        const file = containedPath(root, entry.path)
        const stat = fs.statSync(file)
        if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error(`Oversized/non-file entry: ${entry.path}`)
        bytes += stat.size
        if (bytes > 512 * 1024 * 1024) throw new Error("Package exceeds 512 MiB")
        const buffer = fs.readFileSync(file)
        if (stat.size !== entry.bytes || sha256(buffer) !== entry.sha256) throw new Error(`Integrity mismatch: ${entry.path}`)
        if (/\.(png|webp|jpe?g)$/i.test(entry.path)) {
            if (stat.size > 8 * 1024 * 1024) throw new Error("Image exceeds 8 MiB")
            const meta = await sharp(buffer, { limitInputPixels: 16777216 }).metadata()
            const ext = path.extname(entry.path).slice(1).toLowerCase().replace("jpg", "jpeg")
            if (meta.format !== ext || !meta.width || !meta.height || meta.width > 4096 || meta.height > 4096 || (meta.pages || 1) !== 1) throw new Error(`Invalid image: ${entry.path}`)
        } else if (!/\.(json|md)$/i.test(entry.path)) throw new Error(`Unsupported package file: ${entry.path}`)
        listed.add(entry.path)
    }
    const metadataFiles = new Set(["manifest.json", "inventory.json", "release-review.json"])
    let fileCount = 0
    function walk(relative = "", depth = 0) {
        if (depth > 12) throw new Error("Package directory depth exceeds 12")
        for (const name of fs.readdirSync(relative ? containedPath(root, relative) : root)) {
            if (++fileCount > 25000) throw new Error("Too many package entries")
            const rel = relative ? `${relative}/${name}` : name
            const full = containedPath(root, rel)
            if (fs.statSync(full).isDirectory()) walk(rel, depth + 1)
            else if (!listed.has(rel) && !metadataFiles.has(rel)) throw new Error(`Unlisted package file: ${rel}`)
        }
    }
    walk()
    const payload = parseModContent(readBounded(root, "database.json", 16 * 1024 * 1024))
    if (!payload.ok) throw new Error(payload.error)
    const { players = [], teams = [], tournaments = [] } = payload.value
    if (manifest.players !== players.length || manifest.teams !== teams.length) throw new Error("Manifest counts differ from database")
    if (JSON.stringify(read("players.json")) !== JSON.stringify(players) || JSON.stringify(read("teams.json")) !== JSON.stringify(teams)) throw new Error("Legacy files differ from atomic database")
    const references = validateModReferences(players, teams, tournaments)
    if (references) throw new Error(references)
    for (const entry of [...players, ...teams]) {
        const asset = entry.portraitPath ?? entry.logoPath
        if (asset && (!safeAssetPath(asset) || asset.startsWith("/") || !listed.has(asset))) throw new Error(`Missing or non-package asset: ${asset}`)
    }
    const review = read("release-review.json")
    const inventoryHash = sha256(fs.readFileSync(containedPath(root, "inventory.json")))
    const releaseReady = review.status === "cleared" && review.inventorySha256 === inventoryHash && review.gameReleased === true &&
        Array.isArray(review.rightsEvidence) && review.rightsEvidence.length > 0 && review.rightsEvidence.every((s: unknown) => typeof s === "string" && s.trim().length > 0) &&
        Array.isArray(review.packagedWorkshopEvidence) && review.packagedWorkshopEvidence.length > 0 && review.packagedWorkshopEvidence.every((s: unknown) => typeof s === "string" && s.trim().length > 0)
    return { manifest, files: listed.size, bytes, teams: teams.length, players: players.length, inventoryHash, releaseReady }
}
