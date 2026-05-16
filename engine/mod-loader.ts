/**
 * Community-import (mod) data loader.
 *
 * Reads user-supplied fictional-data replacements from Electron's userData
 * directory (outside the shipped bundle) and returns them as a partial
 * snapshot to be merged over the shipped base snapshot.
 *
 * The shipped build never contains real names/logos; a user who wants real
 * names can paste or upload a community JSON file via the "Import community
 * database" screen, which writes into userData/mods/community/.
 *
 * Gracefully no-ops when running in a browser without Electron or when no
 * mod files are present.
 */

import { validateSnapshot } from "@/data/snapshot-types"
import type { SnapshotPlayer, SnapshotTeam, SnapshotTournament } from "@/data/snapshot-types"
import { safeParse } from "@/lib/json-safe"
import { logger } from "@/lib/logger"

// Window.electron is declared in types/electron-window.d.ts.

export interface ModSnapshot {
    players?: SnapshotPlayer[]
    teams?: SnapshotTeam[]
    tournaments?: SnapshotTournament[]
}

function hasElectronMods(): boolean {
    return (
        typeof window !== "undefined" &&
        !!window.electron &&
        !!window.electron.mods
    )
}

export async function modExists(): Promise<boolean> {
    if (!hasElectronMods()) return false
    try {
        return (await window.electron.mods!.exists()) === true
    } catch {
        return false
    }
}

async function readModJson<T>(filename: string): Promise<T | null> {
    if (!hasElectronMods()) return null
    try {
        const raw = await window.electron.mods!.read(filename)
        return safeParse<T>(raw, null)
    } catch (err) {
        logger.warn(`[mod-loader] Failed to read ${filename}`, err)
        return null
    }
}

/**
 * Load the mod snapshot overlay. Returns null when no mod is present or the
 * environment doesn't support it.
 *
 * Re-validates each entry at load time — users may hand-edit files in
 * userData after the import UI's write-time check, and bad entries would
 * otherwise flow into save data as `undefined` numeric fields and poison
 * the simulation. On any validation error we drop the whole overlay and
 * warn, rather than silently filtering (which would leave dangling roster
 * ids behind).
 */
export async function loadModSnapshot(): Promise<ModSnapshot | null> {
    if (!(await modExists())) return null

    const [players, teams, tournaments] = await Promise.all([
        readModJson<SnapshotPlayer[]>("players.json"),
        readModJson<SnapshotTeam[]>("teams.json"),
        readModJson<SnapshotTournament[]>("tournaments.json"),
    ])

    const candidate: Record<string, unknown> = {}
    if (Array.isArray(players)) candidate.players = players
    if (Array.isArray(teams)) candidate.teams = teams
    if (Array.isArray(tournaments)) candidate.tournaments = tournaments

    if (!candidate.players && !candidate.teams && !candidate.tournaments) return null

    const result = validateModPayload(candidate)
    if (!result.ok) {
        logger.warn(`[mod-loader] Overlay rejected: ${result.error}. Falling back to bundled snapshot.`)
        return null
    }
    return result.value
}

/**
 * Write a single mod file to userData. Returns true on success.
 */
export async function writeModFile(
    filename: "players.json" | "teams.json" | "tournaments.json" | "manifest.json",
    contents: string
): Promise<boolean> {
    if (!hasElectronMods()) return false
    // Parse to validate JSON before writing.
    try {
        JSON.parse(contents)
    } catch {
        return false
    }
    return window.electron.mods!.write(filename, contents)
}

export async function clearMod(): Promise<boolean> {
    if (!hasElectronMods()) return false
    return window.electron.mods!.clear()
}

export async function getModPath(): Promise<string | null> {
    if (!hasElectronMods()) return null
    return window.electron.mods!.getPath()
}

/**
 * Merge a mod snapshot over a base snapshot. Mod entries replace base
 * entries when ids match. New ids from the mod are appended. This is the
 * single integration point the SnapshotLoader uses.
 */
export function mergeSnapshot<T extends { id: string }>(
    base: T[],
    overlay: T[] | undefined
): T[] {
    if (!overlay || overlay.length === 0) return base
    const byId = new Map<string, T>()
    for (const item of base) byId.set(item.id, item)
    for (const item of overlay) byId.set(item.id, item)
    return Array.from(byId.values())
}

// Combat/mental/physical stats that must be finite numbers on every mod
// player. If any are missing, SnapshotLoader.snapshotPlayerToSavePlayer
// would copy `undefined` into the save and poison simulation math.
const REQUIRED_PLAYER_STAT_FIELDS = [
    "skill", "awp", "rifle", "pistol", "grenades", "creativity", "clutch", "tactic",
    "leader", "teamwork", "amicability", "productivity", "stressResistance", "loyalty",
    "reaction", "eyesight", "health", "strength", "endurance", "potential",
] as const

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v)
}

function validatePlayerEntry(entry: unknown, idx: number): string | null {
    if (!entry || typeof entry !== "object") return `players[${idx}] is not an object`
    const p = entry as Record<string, unknown>
    if (typeof p.id !== "string" || !p.id) return `players[${idx}].id must be a non-empty string`
    if (typeof p.name !== "string") return `players[${idx}].name must be a string`
    if (typeof p.nickname !== "string") return `players[${idx}].nickname must be a string`
    if (!isFiniteNumber(p.age)) return `players[${idx}].age must be a number`
    if (typeof p.nationality !== "string") return `players[${idx}].nationality must be a string`
    if (typeof p.portraitPath !== "string") return `players[${idx}].portraitPath must be a string`
    if (typeof p.role !== "string") return `players[${idx}].role must be a string`
    if (typeof p.tier !== "string") return `players[${idx}].tier must be a string`
    for (const f of REQUIRED_PLAYER_STAT_FIELDS) {
        if (!isFiniteNumber(p[f])) return `players[${idx}].${f} must be a finite number`
    }
    return null
}

function validateTeamEntry(entry: unknown, idx: number): string | null {
    if (!entry || typeof entry !== "object") return `teams[${idx}] is not an object`
    const t = entry as Record<string, unknown>
    if (typeof t.id !== "string" || !t.id) return `teams[${idx}].id must be a non-empty string`
    if (typeof t.name !== "string") return `teams[${idx}].name must be a string`
    if (typeof t.tier !== "string") return `teams[${idx}].tier must be a string`
    if (typeof t.region !== "string") return `teams[${idx}].region must be a string`
    if (typeof t.logoPath !== "string") return `teams[${idx}].logoPath must be a string`
    if (!Array.isArray(t.rosterIds)) return `teams[${idx}].rosterIds must be an array`
    if (!isFiniteNumber(t.reputation)) return `teams[${idx}].reputation must be a number`
    if (!isFiniteNumber(t.fanbase)) return `teams[${idx}].fanbase must be a number`
    if (!isFiniteNumber(t.facilitiesLevel)) return `teams[${idx}].facilitiesLevel must be a number`
    if (!isFiniteNumber(t.startingBudget)) return `teams[${idx}].startingBudget must be a number`
    return null
}

function validateTournamentEntry(entry: unknown, idx: number): string | null {
    if (!entry || typeof entry !== "object") return `tournaments[${idx}] is not an object`
    const t = entry as Record<string, unknown>
    if (typeof t.id !== "string" || !t.id) return `tournaments[${idx}].id must be a non-empty string`
    if (typeof t.name !== "string") return `tournaments[${idx}].name must be a string`
    return null
}

/**
 * Validate a candidate mod payload before writing. Accepts either a full
 * Snapshot-shaped object or a partial { players?, teams?, tournaments? }.
 *
 * Per-entity validation is strict: every accepted player/team carries the
 * full set of numeric stats the simulation reads, so mods cannot inject
 * partial objects that later surface as `undefined` in save data.
 */
export function validateModPayload(raw: unknown): { ok: true; value: ModSnapshot } | { ok: false; error: string } {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Not an object" }
    const obj = raw as Record<string, unknown>
    const out: ModSnapshot = {}
    if (obj.players !== undefined) {
        if (!Array.isArray(obj.players)) return { ok: false, error: "players must be an array" }
        for (let i = 0; i < obj.players.length; i++) {
            const err = validatePlayerEntry(obj.players[i], i)
            if (err) return { ok: false, error: err }
        }
        out.players = obj.players as SnapshotPlayer[]
    }
    if (obj.teams !== undefined) {
        if (!Array.isArray(obj.teams)) return { ok: false, error: "teams must be an array" }
        for (let i = 0; i < obj.teams.length; i++) {
            const err = validateTeamEntry(obj.teams[i], i)
            if (err) return { ok: false, error: err }
        }
        out.teams = obj.teams as SnapshotTeam[]
    }
    if (obj.tournaments !== undefined) {
        if (!Array.isArray(obj.tournaments)) return { ok: false, error: "tournaments must be an array" }
        for (let i = 0; i < obj.tournaments.length; i++) {
            const err = validateTournamentEntry(obj.tournaments[i], i)
            if (err) return { ok: false, error: err }
        }
        out.tournaments = obj.tournaments as SnapshotTournament[]
    }
    if (!out.players && !out.teams && !out.tournaments) {
        return { ok: false, error: "No players, teams, or tournaments found in payload" }
    }
    // If the payload is a full snapshot (has version + sources), validate strictly.
    if (typeof obj.version === "string" && Array.isArray(obj.sources)) {
        if (!validateSnapshot(obj)) return { ok: false, error: "Full snapshot validation failed" }
    }
    return { ok: true, value: out }
}
