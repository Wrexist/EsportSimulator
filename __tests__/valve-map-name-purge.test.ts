/**
 * Steam compliance regression: the Valve-recognisable identifier 'dust2' must
 * not appear as a whole word in shipped data/code (the A15 VALVE_MAP_NAME
 * check in scripts/steam-ready-audit.ts scans engine/lib/types/data). The
 * in-game brand for this map is "Sandstone"; asset keys, filenames and local
 * variable names were rebranded away from 'dust2'.
 *
 * The persisted MapId enum value (MapId.SANDSTONE === "Sandstone") and the
 * map-layout `mapId` lookup key are intentionally unchanged for save
 * compatibility — this test asserts they still resolve correctly.
 */

import fs from "fs"
import path from "path"

import { MapId } from "@/types/enums"
import { MAP_ASSET_FILENAMES, getMapAssetName } from "@/data/map-pool"
import { MAPS } from "@/lib/asset-constants"
import { MAP_LAYOUT_JSONS, getMapLayoutJson } from "@/data/map-layouts"

const REPO_ROOT = process.cwd()

// Same whole-word detection the A15 audit uses: 'dust2' bounded by non
// [A-Za-z0-9_] characters (case-insensitive).
const DUST2_WHOLE_WORD = /(^|[^A-Za-z0-9_])dust2([^A-Za-z0-9_]|$)/i

describe("Valve map-name purge (A15 VALVE_MAP_NAME)", () => {
    it("resolves the Sandstone asset filename without 'dust2'", () => {
        expect(MAP_ASSET_FILENAMES[MapId.SANDSTONE]).toBe("sandstone")
        expect(getMapAssetName(MapId.SANDSTONE)).toBe("sandstone")
        // Undefined fallback must also be neutral.
        expect(getMapAssetName(undefined)).toBe("sandstone")
        expect(getMapAssetName(null)).not.toMatch(DUST2_WHOLE_WORD)
    })

    it("points the Sandstone wallpaper at a neutral, existing file", () => {
        expect(MAPS.sandstone).toBe("/maps/sandstone.png")
        expect(MAPS.sandstone).not.toMatch(DUST2_WHOLE_WORD)
        const wallpaper = path.join(REPO_ROOT, "public", MAPS.sandstone.replace(/^\//, ""))
        expect(fs.existsSync(wallpaper)).toBe(true)
    })

    it("keeps the persisted layout lookup key ('Sandstone') intact", () => {
        // Save-compat: layouts are keyed by the enum value, not the asset name.
        expect(MAP_LAYOUT_JSONS[MapId.SANDSTONE]).toBeDefined()
        expect(getMapLayoutJson(MapId.SANDSTONE)?.mapId).toBe("Sandstone")
    })

    it.each([
        "data/map-pool.ts",
        "lib/asset-constants.ts",
        "data/map-layouts/index.ts",
    ])("has no whole-word 'dust2' remaining in %s", (rel) => {
        const contents = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8")
        expect(contents).not.toMatch(DUST2_WHOLE_WORD)
    })
})
