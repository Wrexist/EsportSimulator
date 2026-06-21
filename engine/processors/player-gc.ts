import type { GameSave } from "../save-types"

/**
 * Garbage-collect retired AI players that nothing references anymore.
 *
 * `save.players` only ever grew: AI retirement flips `isRetired` but never
 * splices, and youth intake pushes new players every season — so a long career
 * climbs toward the 32 MiB unloadable save ceiling and slows every per-tick
 * full-pool scan. This removes the dead weight while preserving every player
 * still reachable from anywhere the UI/engine resolves a name by id:
 *
 *   - active rosters + contracts (also auto-repaired on load, but we never touch
 *     a rostered/contracted player here anyway)
 *   - legends (isLegendary, legendaryPlayers, signed/active legend ids, pending pick)
 *   - Hall of Fame entries
 *   - scouting (scoutedPlayers + the active mission target)
 *   - transfer history + season-MVP references in careerStats
 *   - recent completed matches (playerStats is keyed by id, mvpPlayerId) — capped
 *     at 2000, so this keeps match-result names resolvable for the retained window
 *
 * Only players that are retired, non-legendary, AND unreferenced by all of the
 * above are dropped. Deterministic (pure set membership — safe for replay).
 * Runs once at season end (retirements/legend snapshots/careerStats are done by
 * then). Returns the number removed.
 */
export function garbageCollectRetiredPlayers(save: GameSave): number {
    const players = save.players
    if (!players || players.length === 0) return 0

    const keep = new Set<string>()
    const add = (id?: string | null) => { if (id) keep.add(id) }

    for (const t of save.teams || []) {
        for (const id of t.rosterIds || []) add(id)
    }
    for (const c of save.contracts || []) add(c.playerId)
    for (const sp of save.scoutedPlayers || []) add(sp.playerId)
    add(save.activeScoutingMission?.playerId)
    for (const lp of save.legendaryPlayers || []) add(lp.id)
    for (const h of save.hallOfFame || []) add(h.id)
    for (const id of save.signedLegendIds || []) add(id)
    for (const id of save.activelyPlayingLegendIds || []) add(id)
    for (const id of save.pendingLegendPick?.candidates || []) add(id)
    for (const th of save.transferHistory || []) add(th.playerId)
    for (const s of save.careerStats?.seasons || []) add(s.mvpPlayerId)
    for (const m of save.completedMatches || []) {
        const r = m.result
        if (!r) continue
        add(r.mvpPlayerId)
        if (r.playerStats) {
            for (const pid of Object.keys(r.playerStats)) add(pid)
        }
    }

    const before = players.length
    save.players = players.filter(p => {
        if (!p.isRetired) return true        // active players + signable free agents
        if (p.isLegendary) return true        // legends are kept regardless
        return keep.has(p.id)                 // retired-but-still-referenced
    })
    return before - save.players.length
}
