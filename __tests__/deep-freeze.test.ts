/**
 * ENGINE-03: the week tick freezes the committed save itself (deepFreezeState)
 * instead of leaving it to the next Immer producer. It must freeze exactly
 * what Immer's auto-freeze would, so a later producer has nothing left to walk
 * and still produces the same result.
 */
import { produce, enableMapSet } from "immer"
import { deepFreezeState } from "@/store/utils/deep-freeze"

enableMapSet()

function makeTree() {
    return {
        week: 3,
        teams: [{ id: "a", rosterIds: ["p1", "p2"], facilities: [{ type: "TRAINING", level: 2 }] }],
        players: [{ id: "p1", stats: { kills: 1 } }, { id: "p2", stats: null }],
        nested: Object.assign(Object.create(null), { deep: { deeper: [1, 2, { x: 1 }] } }),
        lookup: new Map([["k", { v: 1 }]]),
        tags: new Set(["t"]),
        empty: undefined as unknown,
    }
}

describe("deepFreezeState", () => {
    test("freezes every plain object and array in the tree", () => {
        const tree = deepFreezeState(makeTree())
        expect(Object.isFrozen(tree)).toBe(true)
        expect(Object.isFrozen(tree.teams)).toBe(true)
        expect(Object.isFrozen(tree.teams[0])).toBe(true)
        expect(Object.isFrozen(tree.teams[0].rosterIds)).toBe(true)
        expect(Object.isFrozen(tree.teams[0].facilities[0])).toBe(true)
        expect(Object.isFrozen(tree.players[0].stats)).toBe(true)
        expect(Object.isFrozen(tree.nested)).toBe(true)
        expect(Object.isFrozen(tree.nested.deep.deeper[2])).toBe(true)
        // Maps and Sets go through Immer's own freeze.
        expect(Object.isFrozen(tree.lookup)).toBe(true)
        expect(() => tree.lookup.set("k2", { v: 2 })).toThrow()
        // Immer does not walk into Map values either (Object.entries of a Map is empty).
        expect(Object.isFrozen(tree.lookup.get("k"))).toBe(false)
        expect(Object.isFrozen(tree.tags)).toBe(true)
        expect(() => { (tree.teams[0] as { id: string }).id = "b" }).toThrow()
    })

    test("leaves the same tree an Immer producer would (same frozen nodes, same result)", () => {
        // Reference: what Immer 10 auto-freeze makes of the tree in a no-op producer.
        const viaImmer = produce(makeTree(), () => {})
        const viaFast = deepFreezeState(makeTree())
        const frozenPaths = (value: unknown, path = "$", out: string[] = []): string[] => {
            if (value === null || typeof value !== "object") return out
            if (Object.isFrozen(value)) out.push(path)
            if (value instanceof Map) value.forEach((v, k) => frozenPaths(v, `${path}<${String(k)}>`, out))
            else for (const key of Object.keys(value)) frozenPaths((value as Record<string, unknown>)[key], `${path}.${key}`, out)
            return out
        }
        expect(frozenPaths(viaFast)).toEqual(frozenPaths(viaImmer))

        // A later producer on the frozen tree changes only what it writes.
        const next = produce(viaFast, draft => { draft.teams[0].rosterIds.push("p3") })
        expect(next.teams[0].rosterIds).toEqual(["p1", "p2", "p3"])
        expect(next.players).toBe(viaFast.players)
        expect(viaFast.teams[0].rosterIds).toEqual(["p1", "p2"])
    })

    test("returns primitives and already-frozen values unchanged", () => {
        expect(deepFreezeState(5)).toBe(5)
        expect(deepFreezeState(null)).toBeNull()
        const frozen = Object.freeze({ inner: { a: 1 } })
        expect(deepFreezeState(frozen)).toBe(frozen)
    })
})
