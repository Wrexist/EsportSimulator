/**
 * The Draft Cup setup and draft board, kept for this tab so a reload
 * reopens the board with the same pool, field and picks.
 *
 * The world is not stored (it is several MB): its seed is, and the same seed
 * rebuilds the same players (lib/draft-cup-world.ts). A deal that no longer
 * fits the rebuilt world (new game data) is dropped and dealt again.
 */
import { DRAFT_CUP_DIFFICULTIES, DRAFT_REROLLS, DRAFT_ROLES, type DraftCupDifficulty, type DraftOption, type DraftPool, type DraftRole } from "@/engine/draft-cup"

const KEY = "esim_draft_cup_board_v1"

export interface DraftCupBoard {
    version: 1
    step: "setup" | "draft"
    worldSeed: number
    managerName: string
    teamName: string
    shortName: string
    swatch: number
    difficulty: DraftCupDifficulty
    rerolls: number
    /** The current deal, absent before the first draft. */
    deal?: { difficulty: DraftCupDifficulty; opponentIds: string[]; pool: DraftPool; picks: Partial<Record<DraftRole, string>> }
}

const isOption = (o: unknown): o is DraftOption => {
    const v = o as DraftOption
    return !!v && typeof v.playerId === "string" && typeof v.nickname === "string" && typeof v.overall === "number"
        && typeof v.price === "number" && typeof v.fromTeamId === "string" && (DRAFT_ROLES as readonly string[]).includes(v.role)
}

export function normalizeDraftCupBoard(raw: unknown): DraftCupBoard | null {
    const v = raw as Partial<DraftCupBoard> | null
    if (!v || v.version !== 1 || !Number.isInteger(v.worldSeed)) return null
    if (v.step !== "setup" && v.step !== "draft") return null
    if (typeof v.teamName !== "string" || typeof v.shortName !== "string" || typeof v.managerName !== "string") return null
    if (!DRAFT_CUP_DIFFICULTIES.includes(v.difficulty as DraftCupDifficulty)) return null
    const board: DraftCupBoard = {
        version: 1, step: v.step, worldSeed: v.worldSeed as number, managerName: v.managerName.slice(0, 32),
        teamName: v.teamName.slice(0, 28), shortName: v.shortName.slice(0, 5),
        swatch: Number.isInteger(v.swatch) && (v.swatch as number) >= 0 && (v.swatch as number) < 8 ? v.swatch as number : 0,
        difficulty: v.difficulty as DraftCupDifficulty,
        rerolls: Number.isInteger(v.rerolls) ? Math.max(0, Math.min(DRAFT_REROLLS, v.rerolls as number)) : DRAFT_REROLLS,
    }
    const d = v.deal
    if (d && DRAFT_CUP_DIFFICULTIES.includes(d.difficulty) && Array.isArray(d.opponentIds) && d.opponentIds.every(id => typeof id === "string")
        && d.pool && DRAFT_ROLES.every(role => Array.isArray(d.pool[role]) && d.pool[role].every(isOption))) {
        const picks: Partial<Record<DraftRole, string>> = {}
        for (const role of DRAFT_ROLES) {
            const id = d.picks?.[role]
            if (typeof id === "string" && d.pool[role].some(o => o.playerId === id)) picks[role] = id
        }
        board.deal = { difficulty: d.difficulty, opponentIds: d.opponentIds, pool: d.pool, picks }
    } else if (board.step === "draft") {
        board.step = "setup"
    }
    return board
}

export function loadDraftCupBoard(): DraftCupBoard | null {
    try { return normalizeDraftCupBoard(JSON.parse(window.sessionStorage.getItem(KEY) || "null")) } catch { return null }
}

export function saveDraftCupBoard(board: DraftCupBoard): void {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(board)) } catch { /* storage denied: the board lasts until reload */ }
}

export function clearDraftCupBoard(): void {
    try { window.sessionStorage.removeItem(KEY) } catch { /* nothing kept */ }
}

/** True when every option and opponent of a stored deal exists in the rebuilt world. */
export function dealFitsWorld(deal: NonNullable<DraftCupBoard["deal"]>, playerIds: ReadonlySet<string>, teamIds: ReadonlySet<string>): boolean {
    return deal.opponentIds.every(id => teamIds.has(id)) && DRAFT_ROLES.every(role => deal.pool[role].every(o => playerIds.has(o.playerId)))
}
