#!/usr/bin/env node
/**
 * One-shot: extract per-map layout data from lib/map-radar-data.ts into
 * data/map-layouts/<map>.json so the map builder has authored data to
 * start from. Run with `node scripts/extract-map-layouts.mjs`.
 *
 * Once the JSONs exist they are the source of truth — this script is for
 * the initial bootstrap only.
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")
const outDir = join(repoRoot, "data", "map-layouts")
mkdirSync(outDir, { recursive: true })

function stagger(center, spread, count) {
    const angles = [0, 72, 144, 216, 288]
    const points = []
    for (let i = 0; i < count; i++) {
        const rad = (angles[i % 5] * Math.PI) / 180
        points.push({
            x: round(center.x + Math.cos(rad) * spread),
            y: round(center.y + Math.sin(rad) * spread),
        })
    }
    return points
}

function round(n) {
    return Math.round(n * 100) / 100
}

const maps = [
    {
        mapId: "Sandstone",
        displayName: "Dust II",
        radarImage: { upper: "de_dust2_radar_psd" },
        tSpawn: stagger({ x: 38, y: 88 }, 3, 5),
        ctSpawn: stagger({ x: 50, y: 8 }, 3, 5),
        ctHolds: [
            { x: 15, y: 20 },
            { x: 25, y: 30 },
            { x: 48, y: 22 },
            { x: 72, y: 20 },
            { x: 82, y: 15 },
        ],
        aSite: { x: 10, y: 8 },
        bSite: { x: 82, y: 12 },
        tToA: [
            { x: 38, y: 88 },
            { x: 30, y: 75 },
            { x: 22, y: 60 },
            { x: 18, y: 42 },
            { x: 14, y: 25 },
            { x: 10, y: 10 },
        ],
        tToB: [
            { x: 38, y: 88 },
            { x: 48, y: 78 },
            { x: 55, y: 65 },
            { x: 62, y: 48 },
            { x: 72, y: 30 },
            { x: 82, y: 14 },
        ],
        ctRotateA: [{ x: 30, y: 22 }, { x: 20, y: 15 }, { x: 12, y: 10 }],
        ctRotateB: [{ x: 60, y: 20 }, { x: 72, y: 16 }, { x: 80, y: 13 }],
        engageA: { x: 20, y: 30 },
        engageB: { x: 68, y: 32 },
        mid: { x: 42, y: 40 },
    },
    {
        mapId: "Mirage",
        displayName: "Mirage",
        radarImage: { upper: "de_mirage_radar_psd" },
        tSpawn: stagger({ x: 30, y: 72 }, 3, 5),
        ctSpawn: stagger({ x: 78, y: 50 }, 3, 5),
        ctHolds: [
            { x: 22, y: 22 },
            { x: 30, y: 30 },
            { x: 50, y: 35 },
            { x: 45, y: 55 },
            { x: 42, y: 65 },
        ],
        aSite: { x: 17, y: 26 },
        bSite: { x: 40, y: 60 },
        tToA: [
            { x: 30, y: 72 },
            { x: 28, y: 60 },
            { x: 25, y: 48 },
            { x: 22, y: 38 },
            { x: 19, y: 30 },
            { x: 17, y: 26 },
        ],
        tToB: [
            { x: 30, y: 72 },
            { x: 35, y: 65 },
            { x: 38, y: 58 },
            { x: 42, y: 55 },
            { x: 40, y: 60 },
        ],
        ctRotateA: [{ x: 35, y: 30 }, { x: 25, y: 28 }, { x: 18, y: 26 }],
        ctRotateB: [{ x: 45, y: 50 }, { x: 42, y: 58 }, { x: 40, y: 62 }],
        engageA: { x: 25, y: 35 },
        engageB: { x: 42, y: 55 },
        mid: { x: 48, y: 40 },
    },
    {
        mapId: "Inferno",
        displayName: "Inferno",
        radarImage: { upper: "de_inferno_radar_psd" },
        tSpawn: stagger({ x: 4, y: 52 }, 3, 5),
        ctSpawn: stagger({ x: 90, y: 25 }, 3, 5),
        ctHolds: [
            { x: 35, y: 15 },
            { x: 28, y: 25 },
            { x: 48, y: 35 },
            { x: 65, y: 40 },
            { x: 72, y: 52 },
        ],
        aSite: { x: 33, y: 17 },
        bSite: { x: 72, y: 55 },
        tToA: [
            { x: 4, y: 52 },
            { x: 15, y: 48 },
            { x: 25, y: 42 },
            { x: 30, y: 32 },
            { x: 33, y: 22 },
            { x: 33, y: 17 },
        ],
        tToB: [
            { x: 4, y: 52 },
            { x: 18, y: 55 },
            { x: 32, y: 60 },
            { x: 48, y: 62 },
            { x: 60, y: 58 },
            { x: 72, y: 55 },
        ],
        ctRotateA: [{ x: 40, y: 25 }, { x: 35, y: 20 }, { x: 33, y: 17 }],
        ctRotateB: [{ x: 55, y: 45 }, { x: 65, y: 50 }, { x: 72, y: 55 }],
        engageA: { x: 28, y: 30 },
        engageB: { x: 55, y: 58 },
        mid: { x: 40, y: 40 },
    },
    {
        mapId: "Anubis",
        displayName: "Anubis",
        radarImage: { upper: "de_anubis_radar_psd" },
        tSpawn: stagger({ x: 40, y: 85 }, 3, 5),
        ctSpawn: stagger({ x: 50, y: 12 }, 3, 5),
        ctHolds: [
            { x: 28, y: 42 },
            { x: 22, y: 50 },
            { x: 48, y: 45 },
            { x: 68, y: 30 },
            { x: 76, y: 24 },
        ],
        aSite: { x: 25, y: 46 },
        bSite: { x: 76, y: 22 },
        tToA: [
            { x: 40, y: 85 },
            { x: 35, y: 75 },
            { x: 30, y: 65 },
            { x: 28, y: 55 },
            { x: 26, y: 48 },
            { x: 25, y: 46 },
        ],
        tToB: [
            { x: 40, y: 85 },
            { x: 48, y: 72 },
            { x: 55, y: 58 },
            { x: 62, y: 42 },
            { x: 70, y: 30 },
            { x: 76, y: 22 },
        ],
        ctRotateA: [{ x: 35, y: 40 }, { x: 28, y: 44 }, { x: 25, y: 46 }],
        ctRotateB: [{ x: 60, y: 30 }, { x: 70, y: 25 }, { x: 76, y: 22 }],
        engageA: { x: 30, y: 55 },
        engageB: { x: 65, y: 35 },
        mid: { x: 48, y: 50 },
    },
    {
        mapId: "Ancient",
        displayName: "Ancient",
        radarImage: { upper: "de_ancient_radar_psd" },
        tSpawn: stagger({ x: 46, y: 83 }, 3, 5),
        ctSpawn: stagger({ x: 46, y: 10 }, 3, 5),
        ctHolds: [
            { x: 20, y: 28 },
            { x: 30, y: 35 },
            { x: 44, y: 20 },
            { x: 60, y: 30 },
            { x: 72, y: 38 },
        ],
        aSite: { x: 18, y: 26 },
        bSite: { x: 72, y: 38 },
        tToA: [
            { x: 46, y: 83 },
            { x: 40, y: 70 },
            { x: 35, y: 55 },
            { x: 28, y: 42 },
            { x: 22, y: 32 },
            { x: 18, y: 26 },
        ],
        tToB: [
            { x: 46, y: 83 },
            { x: 52, y: 70 },
            { x: 58, y: 58 },
            { x: 62, y: 48 },
            { x: 68, y: 42 },
            { x: 72, y: 38 },
        ],
        ctRotateA: [{ x: 35, y: 25 }, { x: 25, y: 27 }, { x: 18, y: 26 }],
        ctRotateB: [{ x: 55, y: 32 }, { x: 65, y: 36 }, { x: 72, y: 38 }],
        engageA: { x: 30, y: 40 },
        engageB: { x: 62, y: 45 },
        mid: { x: 44, y: 45 },
    },
    {
        mapId: "Overpass",
        displayName: "Overpass",
        radarImage: { upper: "de_overpass_radar_psd" },
        tSpawn: stagger({ x: 25, y: 75 }, 3, 5),
        ctSpawn: stagger({ x: 70, y: 10 }, 3, 5),
        ctHolds: [
            { x: 30, y: 18 },
            { x: 22, y: 30 },
            { x: 45, y: 25 },
            { x: 55, y: 28 },
            { x: 56, y: 35 },
        ],
        aSite: { x: 32, y: 14 },
        bSite: { x: 56, y: 30 },
        tToA: [
            { x: 25, y: 75 },
            { x: 22, y: 62 },
            { x: 20, y: 48 },
            { x: 22, y: 35 },
            { x: 28, y: 22 },
            { x: 32, y: 14 },
        ],
        tToB: [
            { x: 25, y: 75 },
            { x: 30, y: 65 },
            { x: 38, y: 55 },
            { x: 45, y: 45 },
            { x: 52, y: 38 },
            { x: 56, y: 30 },
        ],
        ctRotateA: [{ x: 35, y: 22 }, { x: 30, y: 18 }, { x: 32, y: 14 }],
        ctRotateB: [{ x: 50, y: 30 }, { x: 54, y: 32 }, { x: 56, y: 30 }],
        engageA: { x: 24, y: 38 },
        engageB: { x: 45, y: 42 },
        mid: { x: 38, y: 40 },
    },
    {
        mapId: "Nuke",
        displayName: "Nuke",
        radarImage: { upper: "de_nuke_radar_psd_1", lower: "de_nuke_lower_radar_psd_2" },
        bSiteLevel: "lower",
        tSpawn: stagger({ x: 20, y: 48 }, 3, 5),
        ctSpawn: stagger({ x: 90, y: 48 }, 3, 5),
        ctHolds: [
            { x: 55, y: 42 },
            { x: 48, y: 35 },
            { x: 62, y: 48 },
            { x: 75, y: 45 },
            { x: 80, y: 50 },
        ],
        aSite: { x: 52, y: 44 },
        bSite: { x: 52, y: 52 },
        tToA: [
            { x: 20, y: 48 },
            { x: 28, y: 45 },
            { x: 35, y: 40 },
            { x: 42, y: 38 },
            { x: 48, y: 42 },
            { x: 52, y: 44 },
        ],
        tToB: [
            { x: 20, y: 48 },
            { x: 28, y: 50 },
            { x: 35, y: 52 },
            { x: 42, y: 54 },
            { x: 48, y: 53 },
            { x: 52, y: 52 },
        ],
        ctRotateA: [{ x: 60, y: 45 }, { x: 55, y: 43 }, { x: 52, y: 44 }],
        ctRotateB: [{ x: 65, y: 50 }, { x: 58, y: 52 }, { x: 52, y: 52 }],
        engageA: { x: 42, y: 40 },
        engageB: { x: 42, y: 52 },
        mid: { x: 40, y: 48 },
    },
    {
        mapId: "Vertigo",
        displayName: "Vertigo",
        radarImage: { upper: "de_vertigo_radar_psd_1", lower: "de_vertigo_lower_radar_psd_2" },
        bSiteLevel: "lower",
        tSpawn: stagger({ x: 35, y: 82 }, 3, 5),
        ctSpawn: stagger({ x: 50, y: 12 }, 3, 5),
        ctHolds: [
            { x: 18, y: 22 },
            { x: 25, y: 30 },
            { x: 42, y: 28 },
            { x: 60, y: 40 },
            { x: 72, y: 55 },
        ],
        aSite: { x: 17, y: 20 },
        bSite: { x: 72, y: 55 },
        tToA: [
            { x: 35, y: 82 },
            { x: 30, y: 68 },
            { x: 25, y: 55 },
            { x: 22, y: 42 },
            { x: 18, y: 30 },
            { x: 17, y: 20 },
        ],
        tToB: [
            { x: 35, y: 82 },
            { x: 42, y: 72 },
            { x: 50, y: 62 },
            { x: 58, y: 55 },
            { x: 65, y: 52 },
            { x: 72, y: 55 },
        ],
        ctRotateA: [{ x: 30, y: 25 }, { x: 22, y: 22 }, { x: 17, y: 20 }],
        ctRotateB: [{ x: 55, y: 48 }, { x: 65, y: 52 }, { x: 72, y: 55 }],
        engageA: { x: 25, y: 38 },
        engageB: { x: 58, y: 55 },
        mid: { x: 40, y: 42 },
    },
]

for (const map of maps) {
    const json = {
        schemaVersion: 1,
        ...map,
    }
    const filename = map.displayName.toLowerCase().replace(/\s+/g, "_") + ".json"
    const outPath = join(outDir, filename)
    writeFileSync(outPath, JSON.stringify(json, null, 2) + "\n", "utf8")
    console.log(`wrote ${outPath}`)
}

console.log(`\n${maps.length} layouts written.`)
