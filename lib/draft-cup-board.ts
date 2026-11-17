/**
 * The Draft Cup setup and draft board, kept on this device so a reload, the
 * setup's Back button or a restart reopens the board with the same pool,
 * field, picks and rerolls left (Audit 17 MODES-01: kept per tab, Back twice
 * or a restart dealt a fresh pool with the reroll still unused). The board is
 * cleared only when the cup starts.
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
    deal?: DraftCupDeal
    /** Earlier deals for the other difficulties: switching back restores them (no free reroll by switching). */
    otherDeals?: Partial<Record<DraftCupDifficulty, DraftCupDeal>>
}

export interface DraftCupDeal { difficulty: DraftCupDifficulty; opponentIds: string[]; pool: DraftPool; picks: Partial<Record<DraftRole, string>> }

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
    const deal = normalizeDeal(v.deal)
    if (deal) board.deal = deal
    else if (board.step === "draft") board.step = "setup"
    const others = v.otherDeals && typeof v.otherDeals === "object" ? v.otherDeals : {}
    for (const diff of DRAFT_CUP_DIFFICULTIES) {
        const other = normalizeDeal(others[diff])
        if (other && other.difficulty === diff && diff !== deal?.difficulty) (board.otherDeals ??= {})[diff] = other
    }
    return board
}

function normalizeDeal(d: Partial<DraftCupDeal> | undefined): DraftCupDeal | null {
    if (!d || !DRAFT_CUP_DIFFICULTIES.includes(d.difficulty as DraftCupDifficulty) || !Array.isArray(d.opponentIds) || !d.opponentIds.every(id => typeof id === "string")
        || !d.pool || !DRAFT_ROLES.every(role => Array.isArray(d.pool![role]) && d.pool![role].every(isOption))) return null
    const pool = d.pool
    const picks: Partial<Record<DraftRole, string>> = {}
    for (const role of DRAFT_ROLES) {
        const id = d.picks?.[role]
        if (typeof id === "string" && pool[role].some(o => o.playerId === id)) picks[role] = id
    }
    return { difficulty: d.difficulty as DraftCupDifficulty, opponentIds: d.opponentIds, pool, picks }
}

/** Device storage (it survives a restart); a board from the older per-tab storage is read once and moved over. */
export function loadDraftCupBoard(): DraftCupBoard | null {
    try {
        const stored = window.localStorage.getItem(KEY)
        if (stored) return normalizeDraftCupBoard(JSON.parse(stored))
        const legacy = window.sessionStorage.getItem(KEY)
        if (legacy) window.sessionStorage.removeItem(KEY)
        return legacy ? normalizeDraftCupBoard(JSON.parse(legacy)) : null
    } catch { return null }
}

export function saveDraftCupBoard(board: DraftCupBoard): void {
    try { window.localStorage.setItem(KEY, JSON.stringify(board)) } catch { /* storage denied: the board lasts until reload */ }
}

/** Only when the cup starts: a new run then gets a new deal. */
export function clearDraftCupBoard(): void {
    try { window.localStorage.removeItem(KEY); window.sessionStorage.removeItem(KEY) } catch { /* nothing kept */ }
}

/** True when every option and opponent of a stored deal exists in the rebuilt world. */
export function dealFitsWorld(deal: DraftCupDeal, playerIds: ReadonlySet<string>, teamIds: ReadonlySet<string>): boolean {
    return deal.opponentIds.every(id => teamIds.has(id)) && DRAFT_ROLES.every(role => deal.pool[role].every(o => playerIds.has(o.playerId)))
}
