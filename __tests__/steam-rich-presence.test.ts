/**
 * Steam only shows Rich Presence when `steam_display` names a token from
 * the localization files uploaded to Steamworks. These tests keep the
 * tokens in steamworks/rich-presence/*.vdf and the keys the game sets in
 * sync, so the friends list never shows a blank status.
 */

import fs from "fs"
import path from "path"
import { buildRichPresence, RICH_PRESENCE_TOKENS } from "@/engine/steam-service"

const dir = path.join(__dirname, "..", "steamworks", "rich-presence")

function readTokens(file: string): Record<string, string> {
    const text = fs.readFileSync(path.join(dir, file), "utf8")
    const tokens: Record<string, string> = {}
    for (const match of text.matchAll(/"(#[A-Za-z0-9_]+)"\s+"([^"]*)"/g)) tokens[match[1]] = match[2]
    return tokens
}

describe("Steam Rich Presence", () => {
    test("shows season and week rather than the absolute career week", () => {
        expect(buildRichPresence({ teamName: "WyLD", week: 60, ranking: 86 })).toEqual({
            team: "WyLD",
            season: "2",
            week: "8",
            rank: "86",
            status: "Managing WyLD | Season 2, Week 8 | World #86",
            steam_display: "#Status_Ranked",
        })
    })

    test("falls back to the unranked token without a world ranking", () => {
        const presence = buildRichPresence({ teamName: "  ", week: 1 })
        expect(presence.steam_display).toBe("#Status_Managing")
        expect(presence.rank).toBeUndefined()
        expect(presence.team).toBe("a club")
    })

    test("sets steam_display last", () => {
        const keys = Object.keys(buildRichPresence({ teamName: "WyLD", week: 3, ranking: 5 }))
        expect(keys[keys.length - 1]).toBe("steam_display")
    })

    const files = fs.readdirSync(dir).filter(file => file.endsWith(".vdf"))

    test("an English localization file exists", () => {
        expect(files).toContain("english.vdf")
    })

    test.each(files)("%s defines every token with only keys the game sets", file => {
        const tokens = readTokens(file)
        expect(Object.keys(tokens).sort()).toEqual([...RICH_PRESENCE_TOKENS].sort())
        const ranked = buildRichPresence({ teamName: "WyLD", week: 3, ranking: 5 })
        const unranked = buildRichPresence({ teamName: "WyLD", week: 3 })
        for (const [token, text] of Object.entries(tokens)) {
            const keys = Object.keys(token === "#Status_Ranked" ? ranked : unranked)
            for (const [, key] of text.matchAll(/%([a-z_]+)%/g)) expect(keys).toContain(key)
        }
    })
})
