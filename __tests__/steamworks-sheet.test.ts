/**
 * docs/steam/STEAMWORKS_CONFIG.md is what gets typed into Steamworks.
 * It is generated from the code, so a renamed achievement or a new stat
 * must regenerate it (npx tsx scripts/steam/steamworks-sheet.ts).
 */

import fs from "fs"
import { ACHIEVEMENTS } from "@/engine/steam-service"
import { renderSteamworksSheet, SHEET_PATH, steamAllowlists } from "../scripts/steam/steamworks-sheet"

describe("Steamworks configuration sheet", () => {
    test("is up to date with the code", () => {
        expect(fs.readFileSync(SHEET_PATH, "utf8")).toBe(renderSteamworksSheet())
    })

    test("the desktop allowlist accepts exactly the achievements the game defines", () => {
        expect([...steamAllowlists().achievements].sort()).toEqual(Object.keys(ACHIEVEMENTS).sort())
    })

    test("no player-facing achievement text names a third-party game", () => {
        for (const a of Object.values(ACHIEVEMENTS)) {
            expect(`${a.name} ${a.description}`).not.toMatch(/\bCS2?\b|Counter-?Strike/i)
        }
    })
})
