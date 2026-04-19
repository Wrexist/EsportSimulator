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
        if (!raw) return null
        return JSON.parse(raw) as T
    } catch (err) {
        console.warn(`[mod-loader] Failed to read ${filename}:`, err)
        return null
    }
}

/**
 * Load the mod snapshot overlay. Returns null when no mod is present or the
 * environment doesn't support it.
 *
 * Validation is intentionally loose here: we trust the sanitize/validate step
 * in the caller. We only check that the top-level shapes are arrays.
 */
export async function loadModSnapshot(): Promise<ModSnapshot | null> {
    if (!(await modExists())) return null

    const [players, teams, tournaments] = await Promise.all([
        readModJson<SnapshotPlayer[]>("players.json"),
        readModJson<SnapshotTeam[]>("teams.json"),
        readModJson<SnapshotTournament[]>("tournaments.json"),
    ])

    const out: ModSnapshot = {}
    if (Array.isArray(players)) out.players = players
    if (Array.isArray(teams)) out.teams = teams
    if (Array.isArray(tournaments)) out.tournaments = tournaments

    const hasAny = out.players || out.teams || out.tournaments
    return hasAny ? out : null
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

/**
 * Validate a candidate mod payload before writing. Accepts either a full
 * Snapshot-shaped object or a partial { players?, teams?, tournaments? }.
 */
export function validateModPayload(raw: unknown): { ok: true; value: ModSnapshot } | { ok: false; error: string } {
    if (!raw || typeof raw !== "object") return { ok: false, error: "Not an object" }
    const obj = raw as Record<string, unknown>
    const out: ModSnapshot = {}
    if (obj.players !== undefined) {
        if (!Array.isArray(obj.players)) return { ok: false, error: "players must be an array" }
        out.players = obj.players as SnapshotPlayer[]
    }
    if (obj.teams !== undefined) {
        if (!Array.isArray(obj.teams)) return { ok: false, error: "teams must be an array" }
        out.teams = obj.teams as SnapshotTeam[]
    }
    if (obj.tournaments !== undefined) {
        if (!Array.isArray(obj.tournaments)) return { ok: false, error: "tournaments must be an array" }
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
