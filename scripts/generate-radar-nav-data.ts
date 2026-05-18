import fs from "fs/promises"
import path from "path"
import sharp from "sharp"
import { MapId } from "@/types"

type RadarLevel = "upper" | "lower"

interface RadarLevelSource {
    upper: string
    lower?: string
}

interface RadarNavLevelData {
    gridSize: number
    walkableBitset: string
    nearestX: number[]
    nearestY: number[]
}

interface RadarNavDataFile {
    version: number
    maps: Record<string, { upper: RadarNavLevelData; lower?: RadarNavLevelData }>
}

const ROOT = process.cwd()
const OUT_PATH = path.join(ROOT, "data", "radar-nav-data.json")
const GRID_SIZE = 128

const MAP_SOURCES: Record<MapId, RadarLevelSource> = {
    [MapId.SANDSTONE]: { upper: "de_sandstone_radar_psd.png" },
    [MapId.MIRAGE]: { upper: "de_mirage_radar_psd.png" },
    [MapId.INFERNO]: { upper: "de_inferno_radar_psd.png" },
    [MapId.NUKE]: { upper: "de_nuke_radar_psd_1.png", lower: "de_nuke_lower_radar_psd_2.png" },
    [MapId.OVERPASS]: { upper: "de_overpass_radar_psd.png" },
    [MapId.VERTIGO]: { upper: "de_vertigo_radar_psd_1.png", lower: "de_vertigo_lower_radar_psd_2.png" },
    [MapId.ANCIENT]: { upper: "de_ancient_radar_psd.png" },
    [MapId.ANUBIS]: { upper: "de_anubis_radar_psd.png" },
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function getLuma(r: number, g: number, b: number): number {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function isWalkablePixel(r: number, g: number, b: number, a: number): boolean {
    // Transparent or very dark pixels are usually outside the actual map geometry.
    const luma = getLuma(r, g, b)
    return (a > 28 && luma > 12) || luma > 26
}

function toBitsetBase64(mask: Uint8Array): string {
    const byteLength = Math.ceil(mask.length / 8)
    const bytes = new Uint8Array(byteLength)
    for (let idx = 0; idx < mask.length; idx++) {
        if (mask[idx] !== 0) {
            bytes[idx >> 3] |= (1 << (idx & 7))
        }
    }

    return Buffer.from(bytes).toString("base64")
}

function buildNearestLookup(mask: Uint8Array, gridSize: number): { nearestX: Uint8Array; nearestY: Uint8Array } {
    const total = gridSize * gridSize
    const nearestX = new Uint8Array(total)
    const nearestY = new Uint8Array(total)
    const visited = new Uint8Array(total)

    const queueX = new Uint16Array(total)
    const queueY = new Uint16Array(total)
    let head = 0
    let tail = 0

    for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
            const idx = y * gridSize + x
            if (mask[idx] !== 0) {
                visited[idx] = 1
                nearestX[idx] = x
                nearestY[idx] = y
                queueX[tail] = x
                queueY[tail] = y
                tail++
            }
        }
    }

    if (tail === 0) {
        const center = Math.floor(gridSize / 2)
        for (let i = 0; i < total; i++) {
            nearestX[i] = center
            nearestY[i] = center
        }
        return { nearestX, nearestY }
    }

    const neighbors = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
        [-1, -1], [1, -1], [-1, 1], [1, 1],
    ]

    while (head < tail) {
        const cx = queueX[head]
        const cy = queueY[head]
        head++

        const currentIdx = cy * gridSize + cx
        const seedX = nearestX[currentIdx]
        const seedY = nearestY[currentIdx]

        for (const [dx, dy] of neighbors) {
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue
            const nIdx = ny * gridSize + nx
            if (visited[nIdx] !== 0) continue

            visited[nIdx] = 1
            nearestX[nIdx] = seedX
            nearestY[nIdx] = seedY
            queueX[tail] = nx
            queueY[tail] = ny
            tail++
        }
    }

    return { nearestX, nearestY }
}

async function buildLevelData(mapFile: string): Promise<RadarNavLevelData> {
    const imagePath = path.join(ROOT, "public", "maps", mapFile)
    const { data, info } = await sharp(imagePath)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

    const width = info.width
    const height = info.height
    const total = GRID_SIZE * GRID_SIZE
    const mask = new Uint8Array(total)

    for (let gy = 0; gy < GRID_SIZE; gy++) {
        const y = clamp(Math.round((gy / (GRID_SIZE - 1)) * (height - 1)), 0, height - 1)
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const x = clamp(Math.round((gx / (GRID_SIZE - 1)) * (width - 1)), 0, width - 1)
            const idx = (y * width + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const b = data[idx + 2]
            const a = data[idx + 3]
            if (isWalkablePixel(r, g, b, a)) {
                mask[gy * GRID_SIZE + gx] = 1
            }
        }
    }

    const { nearestX, nearestY } = buildNearestLookup(mask, GRID_SIZE)
    return {
        gridSize: GRID_SIZE,
        walkableBitset: toBitsetBase64(mask),
        nearestX: Array.from(nearestX),
        nearestY: Array.from(nearestY),
    }
}

async function main() {
    const output: RadarNavDataFile = {
        version: 1,
        maps: {},
    }

    for (const mapId of Object.values(MapId)) {
        const source = MAP_SOURCES[mapId]
        if (!source) continue

        const upper = await buildLevelData(source.upper)
        const lower = source.lower ? await buildLevelData(source.lower) : undefined
        output.maps[mapId] = lower ? { upper, lower } : { upper }
    }

    await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8")
    // eslint-disable-next-line no-console
    console.log(`Wrote radar nav data to ${OUT_PATH}`)
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to generate radar nav data", error)
    process.exit(1)
})
