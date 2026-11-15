/**
 * Audit 2026-11-15 (MODES-12): no player or club name in the game reads as a
 * slur or an obscenity. The look-alike names (data/identity-refresh.json)
 * bend real handles, and one bend ("cuntrolez") went wrong. This checks every
 * stock name, every look-alike, and a large sample of generated prospects,
 * with common letter-for-digit swaps undone ("sh1t" reads as "shit").
 *
 * The list holds only words that are never innocent inside a gamer handle.
 * Short or common fragments ("jew", "kys", "semen" in "BESEMENT BOYS") give
 * false hits on real names and are left out on purpose.
 */
import players from "@/public/data/snapshot/players.json"
import teams from "@/public/data/snapshot/teams.json"
import identities from "@/data/identity-refresh.json"
import { generateProspect } from "@/engine/prospect-generator"
import { SeededRNG } from "@/engine/rng"
import { refreshStockIdentities } from "@/lib/identity-refresh"
import type { GameSave } from "@/engine/save-types"

const BLOCKED = [
    "cunt", "fuck", "fuk", "shit", "nigg", "nigr", "fag", "whore", "slut", "pussy", "retard", "kike", "chink",
    "twat", "wank", "bitch", "porn", "jizz", "dildo", "tranny", "hitler", "nazi", "rape", "penis", "vagina", "cuck",
]

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" }
const readAs = (name: string) => [...name.toLowerCase()].map(c => LEET[c] ?? c).join("").replace(/[^a-z]/g, "")

function offending(names: Iterable<string>): string[] {
    const out = new Set<string>()
    for (const name of names) if (BLOCKED.some(word => readAs(name).includes(word))) out.add(name)
    return [...out].sort()
}

test("the reader undoes digit swaps", () => {
    expect(offending(["sh1t", "Cuntrolez", "kantrolez", "BESEMENT BOYS"])).toEqual(["Cuntrolez", "sh1t"])
})

test("no stock player handle or name is blocked", () => {
    const list = players as unknown as Array<{ name?: string; nickname?: string }>
    expect(offending(list.flatMap(p => [p.name ?? "", p.nickname ?? ""]))).toEqual([])
})

test("no stock club name or tag is blocked", () => {
    const list = teams as unknown as Array<{ name?: string; shortName?: string }>
    expect(offending(list.flatMap(t => [t.name ?? "", t.shortName ?? ""]))).toEqual([])
})

test("no look-alike name is blocked, and the renamed handle is migrated in older saves", () => {
    const all = [...Object.values(identities.players), ...Object.values(identities.teams)].map(i => i.name)
    expect(offending(all)).toEqual([])
    const renamed = (identities.players as Record<string, { before: string[]; name: string }>).player_67_tha_kontrolez
    expect(renamed.name).toBe("kantrolez")
    expect(renamed.before).toContain("cuntrolez")
    // An older save is renamed when it loads (store loadGame runs the refresh).
    const save = { players: [{ id: "player_67_tha_kontrolez", name: "cuntrolez", nickname: "cuntrolez" }], teams: [] } as unknown as GameSave
    refreshStockIdentities(save)
    expect(save.players[0]).toMatchObject({ name: "kantrolez", nickname: "kantrolez" })
})

test("generated prospects (5,000 drawn) get no blocked handle", () => {
    const rng = new SeededRNG(20261115)
    const names: string[] = []
    for (let i = 0; i < 5000; i++) {
        const p = generateProspect("LOCAL", undefined, rng)
        names.push(p.nickname, p.firstName, p.lastName)
    }
    expect(offending(names)).toEqual([])
})
