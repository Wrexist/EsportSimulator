/**
 * Steam only shows Rich Presence when `steam_display` names a token from
 * the localization files uploaded to Steamworks. These tests keep the
 * tokens in steamworks/rich-presence/*.vdf and the keys the game sets in
 * sync, so the friends list never shows a blank status.
 */

import fs from "fs"
import path from "path"
import { buildMatchPresence, buildMenuPresence, buildRichPresence, RICH_PRESENCE_TOKENS } from "@/engine/steam-service"

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

    test("the desktop IPC policy accepts every key the game sets", () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { contracts } = require("../electron/ipc-policy")
        const check = contracts["steam-set-rich-presence"].check
        for (const presence of [buildRichPresence({ teamName: "WyLD", week: 60, ranking: 86 }), buildMenuPresence(), buildMatchPresence({ teamName: "WyLD", opponentName: "Natus Vincere" })]) {
            for (const [key, value] of Object.entries(presence)) expect([key, check([key, value])]).toEqual([key, true])
        }
    })

    const files = fs.readdirSync(dir).filter(file => file.endsWith(".vdf"))

    test("an English localization file exists", () => {
        expect(files).toContain("english.vdf")
    })

    test("every language the game ships has a localization file (CROSSCUT-12)", () => {
        for (const lang of ["english", "german", "spanish", "french", "polish", "brazilian", "russian"]) expect(files).toContain(`${lang}.vdf`)
        for (const file of files) expect(fs.readFileSync(path.join(dir, file), "utf8")).toContain(`"language"\t"${file.replace(".vdf", "")}"`)
    })

    test("menu and match presence: steam_display last, values bounded", () => {
        const menu = buildMenuPresence()
        expect(Object.keys(menu).pop()).toBe("steam_display")
        expect(menu).not.toHaveProperty("team")
        const match = buildMatchPresence({ teamName: "  ", opponentName: "x".repeat(200) })
        expect(Object.keys(match).pop()).toBe("steam_display")
        expect(match.team).toBe("a club")
        expect(match.opponent).toHaveLength(64)
    })

    test.each(files)("%s defines every token with only keys the game sets", file => {
        const tokens = readTokens(file)
        expect(Object.keys(tokens).sort()).toEqual([...RICH_PRESENCE_TOKENS].sort())
        const byToken: Record<string, Record<string, string>> = {
            "#Status_Ranked": buildRichPresence({ teamName: "WyLD", week: 3, ranking: 5 }),
            "#Status_Managing": buildRichPresence({ teamName: "WyLD", week: 3 }),
            "#Status_Menu": buildMenuPresence(),
            "#Status_Match": buildMatchPresence({ teamName: "WyLD", opponentName: "Natus Vincere" }),
        }
        for (const [token, text] of Object.entries(tokens)) {
            expect(byToken[token].steam_display).toBe(token)
            const keys = Object.keys(byToken[token])
            for (const [, key] of text.matchAll(/%([a-z_]+)%/g)) expect(keys).toContain(key)
        }
    })
})
