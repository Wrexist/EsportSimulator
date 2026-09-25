/**
 * Community-import (mod) data loader.
 *
 * Reads user-supplied fictional-data replacements from Electron's userData
 * directory (outside the shipped bundle) and returns them as a partial
 * snapshot to be merged over the shipped base snapshot.
 *
 * Optional databases live outside the base snapshot in userData/mods/community.
 * Import changes new careers only; redistribution rights need separate review.
 *
 * Gracefully no-ops when running in a browser without Electron or when no
 * mod files are present.
 */

import { validateModContent } from "@/electron/mod-content"
import type { SnapshotPlayer, SnapshotTeam, SnapshotTournament } from "@/data/snapshot-types"
import type { WorkshopModItem, ActiveModPointer } from "@/types/electron-window"
import { safeParseUntrusted } from "@/lib/json-safe"
import { logger } from "@/lib/logger"
import { defaultBrandingFor } from "@/lib/branding/fallback"

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
    const raw = await window.electron.mods!.read(filename)
    if (raw === null) return null
    const value = safeParseUntrusted<T>(raw, null)
    if (value === null) throw new Error(`Invalid mod file: ${filename}`)
    return value
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

    try {
        const [players, teams, tournaments] = await Promise.all([
            readModJson<SnapshotPlayer[]>("players.json"),
            readModJson<SnapshotTeam[]>("teams.json"),
            readModJson<SnapshotTournament[]>("tournaments.json"),
        ])

        const candidate: Record<string, unknown> = {}
        if (players !== null) candidate.players = players
        if (teams !== null) candidate.teams = teams
        if (tournaments !== null) candidate.tournaments = tournaments

        if (!candidate.players && !candidate.teams && !candidate.tournaments) return null

        const result = validateModPayload(candidate)
        if (!result.ok) {
            logger.warn(`[mod-loader] Overlay rejected: ${result.error}. Falling back to bundled snapshot.`)
            return null
        }

        // A mod's logos/portraits live as files INSIDE the active mod folder
        // (userData/mods/community or a subscribed Steam Workshop item), which is
        // outside the shipped web root. Rewrite the mod's relative asset paths to
        // the `/mod-assets/` route that the Electron main process serves from the
        // active mod dir, so <img>/next-image can load them same-origin.
        rewriteModAssetPaths(result.value)
        return result.value
    } catch (error) {
        logger.warn("[mod-loader] Invalid overlay; using bundled database", error)
        return null
    }
}

/** Route the Electron main process serves the active mod folder under. */
export const MOD_ASSET_ROUTE = "/mod-assets/"

/**
 * Turn a mod-relative asset path ("assets/teams/x/logo.png") into a servable
 * URL ("/mod-assets/assets/teams/x/logo.png"). Leaves empty strings, absolute
 * paths ("/assets/...", already served from public/) and any schemed value
 * untouched — validateModPayload already rejected schemes/traversal, so this
 * only ever prefixes a safe relative path.
 */
export function toModAssetUrl(p: unknown): string {
    if (typeof p !== "string" || p === "") return ""
    if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return p // has a scheme — leave as-is
    if (p.startsWith("/")) return p               // already root-relative
    return MOD_ASSET_ROUTE + p.split("/").map(encodeURIComponent).join("/")
}

function rewriteModAssetPaths(mod: ModSnapshot): void {
    if (mod.teams) {
        for (const t of mod.teams) {
            if (t && typeof (t as { logoPath?: unknown }).logoPath === "string") {
                (t as { logoPath?: string }).logoPath = toModAssetUrl((t as { logoPath?: unknown }).logoPath)
            }
        }
    }
    if (mod.players) {
        for (const p of mod.players) {
            if (p && typeof (p as { portraitPath?: unknown }).portraitPath === "string") {
                (p as { portraitPath?: string }).portraitPath = toModAssetUrl((p as { portraitPath?: unknown }).portraitPath)
            }
        }
    }
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

// ============================================================
// Steam Workshop wrappers (desktop-only; no-op in browser)
// ============================================================

function hasWorkshop(): boolean {
    return typeof window !== "undefined" && !!window.electron && !!window.electron.workshop
}

export async function workshopAvailable(): Promise<boolean> {
    if (!hasWorkshop()) return false
    try { return (await window.electron.workshop!.available()) === true } catch { return false }
}

export async function listWorkshopMods(): Promise<WorkshopModItem[]> {
    if (!hasWorkshop()) return []
    try { return (await window.electron.workshop!.list()) || [] } catch { return [] }
}

export async function getActiveMod(): Promise<ActiveModPointer> {
    if (!hasWorkshop()) return { source: "community" }
    try { return (await window.electron.workshop!.getActive()) || { source: "community" } } catch { return { source: "community" } }
}

export async function setActiveMod(pointer: ActiveModPointer): Promise<boolean> {
    if (!hasWorkshop()) return false
    try { return await window.electron.workshop!.setActive(pointer) } catch { return false }
}

export async function openWorkshop(id?: string): Promise<boolean> {
    if (!hasWorkshop()) return false
    try { return await window.electron.workshop!.open(id) } catch { return false }
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

/** Shared schema validation; reference checks run against the merged base snapshot. */
export function validateModPayload(raw: unknown): { ok: true; value: ModSnapshot } | { ok: false; error: string } {
    const result = validateModContent(raw)
    if (!result.ok) return result
    const value = result.value as ModSnapshot
    return { ok: true, value: {
        players: value.players?.map(p => ({ ...p })),
        teams: value.teams?.map(t => ({ ...t, branding: t.branding || defaultBrandingFor(t.id) })),
        tournaments: value.tournaments?.map(t => ({ ...t })),
    } }
}
