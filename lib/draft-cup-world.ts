/**
 * G7: the world a Draft Cup is drafted against. The draft screen builds it
 * once, offers its pool from it, and hands the same world to
 * initializeNewGame, so the drafted players and the opponents are exactly
 * the ones shown.
 */

import { snapshotLoader } from "@/data"
import { reconcileAllRoles } from "@/engine"
import type { GameSave } from "@/engine/save-types"

export async function buildDraftCupWorld(): Promise<GameSave> {
    if (!snapshotLoader.getSnapshot()) await snapshotLoader.loadSnapshot()
    const snapshot = snapshotLoader.getSnapshot()
    if (!snapshot?.teams.length) throw new Error("Game data unavailable")
    // Any club works as the placeholder: the drafted team replaces it as the managed side.
    const placeholder = [...snapshot.teams].sort((a, b) => (a.reputation ?? 0) - (b.reputation ?? 0) || a.id.localeCompare(b.id))[0]
    const world = snapshotLoader.createCareerFromSnapshot("Draft Cup", placeholder.id, 1)
    if (!world) throw new Error("Could not build the world")
    reconcileAllRoles(world.teams, world.players)
    return world
}
