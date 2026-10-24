/**
 * Best Draft Cup runs on this device (G7), newest score list for the setup
 * and result screens. Browser storage only: a convenience, the save keeps
 * each run's own result.
 */

import type { DraftCupDifficulty, DraftCupFinish } from "@/engine/draft-cup"

const KEY = "esim_draft_cup_runs_v1"
const KEEP = 10

export interface DraftCupRunRecord {
    saveId: string
    teamName: string
    difficulty: DraftCupDifficulty
    finish: DraftCupFinish
    score: number
    at: string
}

export function loadDraftCupRuns(): DraftCupRunRecord[] {
    try {
        const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]")
        return Array.isArray(raw) ? raw.filter(r => r && typeof r.score === "number" && typeof r.teamName === "string").slice(0, KEEP) : []
    } catch {
        return []
    }
}

/** Adds a run (once per save) and keeps the best KEEP by score. */
export function recordDraftCupRun(run: DraftCupRunRecord): void {
    try {
        const runs = loadDraftCupRuns().filter(r => r.saveId !== run.saveId)
        runs.push(run)
        runs.sort((a, b) => b.score - a.score || b.at.localeCompare(a.at))
        window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, KEEP)))
    } catch { /* storage unavailable: the save still has the result */ }
}
