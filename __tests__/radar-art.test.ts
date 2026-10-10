/**
 * Project radar art (public/radar-art/<Map>-<floor>.webp, manifest data/radar-art.json),
 * generated from the navigation meshes by `npx tsx scripts/bake-radar-art.ts --review`.
 *
 * Checks the manifest covers every MapId and radar floor, the files exist, are 1024²
 * WebP images within the size budget, and that the baked round-map spawns and plant
 * spots land on drawn (opaque) map area of their floor — i.e. the art shares the live
 * radar's percent frame.
 */
import { readFileSync, statSync } from "fs"
import sharp from "sharp"
import { MapId } from "@/types/enums"
import type { Floor, RoundMap } from "@/engine/match/round-script-types"
import manifest from "@/data/radar-art.json"

const MAP_IDS = Object.values(MapId) as string[]
const TWO_FLOORS = new Set(["Nuke", "Vertigo"])
const MAX_BYTES = 250 * 1024
const MIN_BYTES = 8 * 1024

type Manifest = Record<string, { upper: string; lower?: string }>
const art = manifest as Manifest

/** Canvas size from a WebP header (VP8X, VP8L or VP8 bitstreams). */
function webpSize(buf: Buffer): { width: number; height: number } {
    if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw Error("not a WebP file")
    const chunk = buf.toString("ascii", 12, 16)
    if (chunk === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
    if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) } }
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    throw Error(`unknown WebP chunk ${chunk}`)
}

const fileOf = (url: string) => `public${url}`

describe("radar art manifest", () => {
    it("has exactly one entry per MapId with the radar's floors", () => {
        expect(Object.keys(art).sort()).toEqual([...MAP_IDS].sort())
        for (const id of MAP_IDS) {
            expect(Object.keys(art[id]).sort()).toEqual(TWO_FLOORS.has(id) ? ["lower", "upper"] : ["upper"])
            for (const [floor, url] of Object.entries(art[id])) expect(url).toBe(`/radar-art/${id}-${floor}.webp`)
        }
    })
})

describe.each(MAP_IDS)("%s radar art", id => {
    const floors = Object.keys(art[id] ?? {}) as Floor[]

    it.each(floors)("%s floor is a 1024² WebP within the size budget", floor => {
        const file = fileOf(art[id][floor]!)
        const bytes = statSync(file).size
        expect(bytes).toBeGreaterThan(MIN_BYTES)
        expect(bytes).toBeLessThanOrEqual(MAX_BYTES)
        expect(webpSize(readFileSync(file))).toEqual({ width: 1024, height: 1024 })
    })

    it("draws walkable ground under the round map's spawns and plant spots", async () => {
        const map = JSON.parse(readFileSync(`data/round-maps/${id}.json`, "utf8")) as RoundMap
        const alpha: Partial<Record<Floor, Buffer>> = {}
        for (const floor of floors) alpha[floor] = await sharp(fileOf(art[id][floor]!)).ensureAlpha().extractChannel(3).raw().toBuffer()
        const points = [...map.spawns.T, ...map.spawns.CT, ...map.sites.A.plantSpots, ...map.sites.B.plantSpots]
        const missing = points.filter(p => {
            const a = alpha[p.floor]!
            const x = Math.min(1023, Math.floor(p.x * 10.24)), y = Math.min(1023, Math.floor(p.y * 10.24))
            return a[y * 1024 + x] < 200
        })
        expect(missing).toEqual([])
    })
})
