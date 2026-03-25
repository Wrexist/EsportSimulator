/**
 * Save Manager
 * Phase 5: Fail-safe save system with atomic transactions
 * 
 * GUARANTEES:
 * - No corruption via atomic writes with backup
 * - No duplication via unique IDs and dedup
 * - No undefined state via validation and defaults
 * - Rollback/resume for interrupted week ticks
 */

import {
    GameSave,
    TeamSaveData,
    PlayerSaveData,
    ContractSaveData,
    TournamentSaveData,
    MatchSaveData,
    CompletedMatchSaveData,
    FinanceLedgerEntry,
    GameEventSaveData,
    WeekTickState,
    SaveSlotMetadata,
    STORAGE_KEYS,
    CURRENT_SAVE_VERSION,
    validateSaveStructure,
    collectValidationErrors,
    repairSave,
    hasIncompleteWeekTick,
    getResumeStep,
    PlayerPreview,
    QualificationStatus,
} from "./save-types"
import {
    dedupeQualifications,
    normalizeQualificationStatus,
    resolveTournamentIdentity,
} from "./circuit-engine"
import { FOUNDING_LEGENDS } from "./hall-of-fame-data"
import { evaluatePlayer } from "./player-evaluation"
import { generateSeed } from "./rng"
import { AsyncStorage, asyncStorage } from "./storage-adapter"
import { steamService } from "./steam-service"
import { debug } from "@/lib/debug-logger"

// ===== SAVE MANAGER =====

export class SaveManager {
    private storage: AsyncStorage
    private installSecretPromise: Promise<string> | null = null

    constructor(storage: AsyncStorage = asyncStorage) {
        this.storage = storage
    }

    private getWeekTickStateKey(saveId?: string): string {
        return saveId ? `${STORAGE_KEYS.WEEK_TICK_STATE}_${saveId}` : STORAGE_KEYS.WEEK_TICK_STATE
    }

    private serializeForIntegrity(save: Record<string, unknown>): string {
        // Single-pass serialization: exclude integrityHash without deep-cloning the entire save
        const { integrityHash, ...rest } = save
        return JSON.stringify(rest)
    }

    private computeLegacyIntegrityHash(save: Record<string, unknown>): string {
        const payload = this.serializeForIntegrity(save)
        let hash = 2166136261
        for (let i = 0; i < payload.length; i++) {
            hash ^= payload.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, "0")
    }

    private async computeSha256Hex(payload: string): Promise<string> {
        try {
            if (typeof crypto !== "undefined" && crypto.subtle && typeof TextEncoder !== "undefined") {
                const bytes = new TextEncoder().encode(payload)
                const digest = await crypto.subtle.digest("SHA-256", bytes)
                return Array.from(new Uint8Array(digest))
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")
            }
        } catch {
            // Fallback below.
        }

        // Fallback hash for runtimes without WebCrypto support.
        let hash = 2166136261
        for (let i = 0; i < payload.length; i++) {
            hash ^= payload.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, "0")
    }

    private async getOrCreateInstallSecret(): Promise<string> {
        if (this.installSecretPromise) return this.installSecretPromise

        this.installSecretPromise = (async () => {
            const existing = await this.storage.getItem(STORAGE_KEYS.INSTALL_SECRET)
            if (existing && existing.length >= 16) return existing

            let generated = `${Date.now()}_${generateSeed().toString(36)}_${Math.abs(generateSeed()).toString(36)}`
            if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
                const bytes = new Uint8Array(32)
                crypto.getRandomValues(bytes)
                generated = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
            }

            await this.storage.setItem(STORAGE_KEYS.INSTALL_SECRET, generated)
            return generated
        })()

        return this.installSecretPromise
    }

    private async computeDeviceBoundIntegrityHash(save: Record<string, unknown>): Promise<string> {
        const secret = await this.getOrCreateInstallSecret()
        const payload = this.serializeForIntegrity(save)
        const digest = await this.computeSha256Hex(`${secret}|${payload}`)
        return `v2:${digest}`
    }

    private async computeIntegrityHash(save: Record<string, unknown>): Promise<string> {
        // Portable signature used for cross-device Steam Cloud compatibility.
        const payload = this.serializeForIntegrity(save)
        const digest = await this.computeSha256Hex(payload)
        return `v3:${digest}`
    }

    private async verifyIntegrityHash(save: Record<string, unknown>): Promise<boolean> {
        if (!save.integrityHash) {
            // Unsigned saves are never valid - prevents save tampering
            return false
        }
        if (typeof save.integrityHash !== "string") return false
        if (save.integrityHash.startsWith("v3:")) {
            return save.integrityHash === await this.computeIntegrityHash(save)
        }
        if (save.integrityHash.startsWith("v2:")) {
            // Backward compatibility: v2 signatures are install-bound.
            const expectedDeviceBound = await this.computeDeviceBoundIntegrityHash(save)
            if (save.integrityHash === expectedDeviceBound) return true

            // v2 saves from a different device: attempt re-sign migration to v3
            // This allows one-time cross-device migration by re-computing the hash
            const legacyHash = this.computeLegacyIntegrityHash(save)
            const v2Payload = save.integrityHash.substring(3) // strip "v2:" prefix
            // Accept if the legacy portion matches (device-independent part)
            return v2Payload.length >= 8 && v2Payload === legacyHash
        }
        // Legacy compatibility path for pre-v2 signatures.
        return save.integrityHash === this.computeLegacyIntegrityHash(save)
    }

    private async parseAndValidateSaveCandidate(
        data: string,
        expectedSaveId: string
    ): Promise<{ migrated: GameSave; updatedAtMs: number } | null> {
        try {
            const parsed = JSON.parse(data) as Record<string, unknown>
            if (parsed?.saveId && parsed.saveId !== expectedSaveId) {
                return null
            }

            if (!(await this.verifyIntegrityHash(parsed))) {
                return null
            }

            const migrated = this.migrateSave(parsed)
            if (!validateSaveStructure(migrated)) {
                return null
            }

            const updatedAtMs = Number.isFinite(new Date(migrated.updatedAt).getTime())
                ? new Date(migrated.updatedAt).getTime()
                : 0

            return { migrated, updatedAtMs }
        } catch {
            return null
        }
    }

    // ===== SAVE OPERATIONS =====

    /**
     * Create a new save
     */
    createSave(name: string, initialData: Partial<GameSave>): GameSave {
        const saveId = `save_${Date.now()}_${generateSeed().toString(36)}`
        const now = new Date().toISOString()

        const save: GameSave = {
            // Metadata
            saveVersion: CURRENT_SAVE_VERSION,
            saveId,
            saveName: name,
            createdAt: now,
            updatedAt: now,

            // Game state
            currentWeek: initialData.currentWeek ?? 1,
            currentDay: initialData.currentDay ?? ((initialData.timeMode === "HYBRID_DAILY") ? 0 : 6),
            timeMode: initialData.timeMode ?? "WEEKLY",
            gameStartDate: initialData.gameStartDate ?? now,

            // Manager Career
            playerTeamId: initialData.playerTeamId ?? initialData.teams?.[0]?.id ?? "unknown",
            managerDetails: initialData.managerDetails ?? {
                name: name,
                level: 1,
                xp: 0,
                reputation: 0,
                careerWins: 0,
                careerLosses: 0,
                championships: 0
            },

            // Entities
            teams: initialData.teams ?? [],
            players: initialData.players ?? [],
            contracts: initialData.contracts ?? [],
            tournaments: initialData.tournaments ?? [],
            staff: initialData.staff ?? [],

            // Matches
            scheduledMatches: initialData.scheduledMatches ?? [],
            completedMatches: initialData.completedMatches ?? [],
            scheduledActivities: initialData.scheduledActivities ?? [],

            // Finance
            financeLedger: initialData.financeLedger ?? [],

            // Events
            eventsLog: initialData.eventsLog ?? [],
            acknowledgedEventIds: initialData.acknowledgedEventIds ?? [],

            // Phase 23: Hall of Fame
            hallOfFame: initialData.hallOfFame ?? FOUNDING_LEGENDS,

            // RNG
            lastRngSeed: initialData.lastRngSeed ?? generateSeed(),

            // Transfer History
            transferHistory: initialData.transferHistory ?? [],

            // Legacy/Optional
            legendaryPlayers: initialData.legendaryPlayers ?? [],

            // Transaction
            weekTickState: null,

            // New Phase Fields
            scoutedPlayers: initialData.scoutedPlayers ?? [],
            circuitPoints: initialData.circuitPoints ?? [],
            tournamentQualifications: initialData.tournamentQualifications ?? [],
            newsFeed: initialData.newsFeed ?? [],
            marketStaff: initialData.marketStaff ?? [],

            // Phase 70: Youth Academy
            academyPlayers: initialData.academyPlayers ?? [],
            academyMatchHistory: initialData.academyMatchHistory ?? [],
            academyRoster: initialData.academyRoster ?? { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyTrainingSchedule: initialData.academyTrainingSchedule ?? {},
            academyWeeklyReports: initialData.academyWeeklyReports ?? [],
            academyScoutingMissions: initialData.academyScoutingMissions ?? [],
            academyPendingProspects: initialData.academyPendingProspects ?? []
        }

        return save
    }

    /**
     * Save game to storage with atomic backup
     */
    async saveGame(save: GameSave): Promise<{ success: boolean; error?: string; repairs?: string[] }> {
        try {
            // Auto-repair common issues before validation
            const repairs = repairSave(save)
            if (repairs && repairs.length > 0) {
                debug.warn(`[SaveManager] Auto-repaired save: ${repairs.join("; ")}`)
            }

            // Validate after repair
            if (!validateSaveStructure(save)) {
                const errors = collectValidationErrors(save)
                const detail = errors.length > 0 ? errors[0] : "unknown"
                return { success: false, error: `Invalid save: ${detail}` }
            }

            // Update timestamp
            save.updatedAt = new Date().toISOString()
            save.integrityHash = await this.computeIntegrityHash(save as unknown as Record<string, unknown>)

            const key = STORAGE_KEYS.SAVE_PREFIX + save.saveId
            const backupKey = STORAGE_KEYS.BACKUP_PREFIX + save.saveId

            // 1. Rotate backups (keep last 3) before overwriting
            const existing = await this.storage.getItem(key)
            if (existing) {
                // Shift backup_2 -> backup_3, backup_1 -> backup_2, current backup -> backup_1
                const backup3 = await this.storage.getItem(backupKey + "_2")
                if (backup3) await this.storage.setItem(backupKey + "_3", backup3)
                const backup2 = await this.storage.getItem(backupKey + "_1")
                if (backup2) await this.storage.setItem(backupKey + "_2", backup2)
                await this.storage.setItem(backupKey + "_1", existing)
            }

            // 2. Serialize and save new data
            const serialized = JSON.stringify(save)
            await this.storage.setItem(key, serialized)

            // 3. Verify write succeeded (retry once on mismatch - concurrent
            //    IndexedDB transactions from Zustand persist can delay reads)
            let verified = false
            for (let vAttempt = 0; vAttempt < 2 && !verified; vAttempt++) {
                const verification = await this.storage.getItem(key)
                if (verification === serialized) {
                    verified = true
                } else if (vAttempt === 0) {
                    // First mismatch: retry write + verify after a short yield
                    await new Promise(r => setTimeout(r, 50))
                    await this.storage.setItem(key, serialized)
                }
            }
            if (!verified) {
                // Restore from backup
                if (existing) {
                    await this.storage.setItem(key, existing)
                }
                return { success: false, error: "Write verification failed" }
            }

            // 4. Update current save ID
            await this.storage.setItem(STORAGE_KEYS.CURRENT_SAVE_ID, save.saveId)

            // 5. Upload to Steam Cloud (non-blocking, don't fail save on cloud error)
            try {
                await steamService.uploadSaveToCloud(save.saveId, serialized)
            } catch (cloudError) {
                debug.warn("[SaveManager] Cloud sync failed (save is still local):", cloudError instanceof Error ? cloudError.message : cloudError)
            }

            // Save size monitoring: warn if approaching storage limits
            const sizeBytes = serialized.length * 2 // UTF-16 encoding
            const sizeMB = sizeBytes / (1024 * 1024)
            if (sizeMB > 4) {
                debug.warn(`[SaveManager] Save file is ${sizeMB.toFixed(1)}MB — approaching storage limits. Consider starting a new career.`)
            }

            return { success: true, repairs: repairs && repairs.length > 0 ? repairs : undefined }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown save error",
            }
        }
    }

    /**
     * Load game from storage
     */
    async loadGame(saveId: string): Promise<{ save: GameSave | null; error?: string; restoredFromBackup?: boolean }> {
        try {
            const key = STORAGE_KEYS.SAVE_PREFIX + saveId
            const backupKey = STORAGE_KEYS.BACKUP_PREFIX + saveId
            let restoredFromBackup = false

            // Try primary save
            let localData = await this.storage.getItem(key)

            // If not found, try rotating backups (newest first)
            if (!localData) {
                for (const suffix of ["_1", "_2", "_3", ""]) {
                    const candidate = await this.storage.getItem(backupKey + suffix)
                    if (candidate) {
                        localData = candidate
                        restoredFromBackup = true
                        debug.warn(`Loaded from backup${suffix || " (legacy)"} - primary save was missing`)
                        await this.storage.setItem(key, localData)
                        break
                    }
                }
            }

            // Try cloud candidate for recovery/conflict resolution.
            let cloudData: string | null = null
            try {
                cloudData = await steamService.downloadSaveFromCloud(saveId)
            } catch {
                cloudData = null
            }

            if (!localData && cloudData) {
                debug.warn("Loaded save from Steam Cloud - local save missing")
                await this.storage.setItem(key, cloudData)
                localData = cloudData
            }

            if (!localData) {
                return { save: null, error: "Save not found" }
            }

            const localCandidate = await this.parseAndValidateSaveCandidate(localData, saveId)
            const cloudCandidate = cloudData
                ? await this.parseAndValidateSaveCandidate(cloudData, saveId)
                : null

            let selected = localCandidate
            let selectedSource: "local" | "cloud" = "local"

            if (!selected && cloudCandidate) {
                selected = cloudCandidate
                selectedSource = "cloud"
            } else if (
                selected &&
                cloudCandidate &&
                cloudCandidate.updatedAtMs > selected.updatedAtMs + 1000
            ) {
                selected = cloudCandidate
                selectedSource = "cloud"
            }

            // If primary + cloud both failed validation, try backup slots for corruption recovery
            if (!selected) {
                for (const suffix of ["_1", "_2", "_3", ""]) {
                    const backupData = await this.storage.getItem(backupKey + suffix)
                    if (!backupData) continue
                    const backupCandidate = await this.parseAndValidateSaveCandidate(backupData, saveId)
                    if (backupCandidate) {
                        selected = backupCandidate
                        selectedSource = "local"
                        restoredFromBackup = true
                        debug.warn(`Restored from backup${suffix || " (legacy)"} - primary save was corrupted`)
                        // Promote backup as new primary so future loads are fast
                        await this.storage.setItem(key, backupData)
                        break
                    }
                }
            }

            if (!selected) {
                return { save: null, error: "Save integrity check failed (possible tampering/corruption)" }
            }

            if (selectedSource === "cloud" && cloudData && cloudData !== localData) {
                // Preserve local candidate in backup and promote cloud save as source-of-truth.
                if (localData) {
                    await this.storage.setItem(backupKey, localData)
                }
                await this.storage.setItem(key, cloudData)
            }

            return { save: selected.migrated, restoredFromBackup: restoredFromBackup || undefined }
        } catch (error) {
            return {
                save: null,
                error: error instanceof Error ? error.message : "Unknown load error",
            }
        }
    }

    /**
     * Load current/last played save
     */
    async loadCurrentSave(): Promise<{ save: GameSave | null; error?: string; restoredFromBackup?: boolean }> {
        const currentId = await this.storage.getItem(STORAGE_KEYS.CURRENT_SAVE_ID)
        if (!currentId) {
            return { save: null, error: "No current save" }
        }
        return this.loadGame(currentId)
    }

    /**
     * Delete a save
     */
    async deleteSave(saveId: string): Promise<{ success: boolean }> {
        try {
            await this.storage.removeItem(STORAGE_KEYS.SAVE_PREFIX + saveId)
            // Remove all backup slots (legacy + numbered)
            const backupKey = STORAGE_KEYS.BACKUP_PREFIX + saveId
            await this.storage.removeItem(backupKey)
            await this.storage.removeItem(backupKey + "_1")
            await this.storage.removeItem(backupKey + "_2")
            await this.storage.removeItem(backupKey + "_3")

            // Clear current if this was it
            const current = await this.storage.getItem(STORAGE_KEYS.CURRENT_SAVE_ID)
            if (current === saveId) {
                await this.storage.removeItem(STORAGE_KEYS.CURRENT_SAVE_ID)
            }

            // Delete from Steam Cloud
            await steamService.deleteCloudFile(`save_${saveId}.json`)

            return { success: true }
        } catch {
            return { success: false }
        }
    }

    /**
     * Delete ALL saves (Nuke)
     */
    async deleteAllSaves(): Promise<{ success: boolean }> {
        try {
            const keys = await this.storage.getAllKeys()
            for (const key of keys) {
                if (key.startsWith(STORAGE_KEYS.SAVE_PREFIX) ||
                    key.startsWith(STORAGE_KEYS.BACKUP_PREFIX) ||
                    key === STORAGE_KEYS.CURRENT_SAVE_ID ||
                    key.startsWith(STORAGE_KEYS.WEEK_TICK_STATE)) {
                    await this.storage.removeItem(key)
                }
            }
            return { success: true }
        } catch (e) {
            return { success: false }
        }
    }

    /**
     * Get all save slot metadata
     */
    async getSaveSlots(): Promise<SaveSlotMetadata[]> {
        const slots: SaveSlotMetadata[] = []
        const keys = await this.storage.getAllKeys()

        for (const key of keys) {
            if (!key.startsWith(STORAGE_KEYS.SAVE_PREFIX)) continue

            try {
                const data = await this.storage.getItem(key)
                if (!data) continue

                const parsed = JSON.parse(data) as GameSave

                // Identify Player Team
                let playerTeamId = parsed.playerTeamId
                // Fallback for V2 saves: Check finance ledger for player team ID
                if (!playerTeamId && parsed.financeLedger && parsed.financeLedger.length > 0) {
                    playerTeamId = parsed.financeLedger[0].teamId
                }
                const playerTeam = parsed.teams.find(t => t.id === playerTeamId) || parsed.teams[0]

                // Get Preview Players (Rich Data)
                const topPlayerPreviews: PlayerPreview[] = []
                const topPlayerPortraits: string[] = [] // Legacy support

                if (playerTeam && parsed.players) {
                    (playerTeam.rosterIds || []).slice(0, 5).forEach(id => {
                        const p = parsed.players.find(pl => pl.id === id)
                        if (p) {
                            // Legacy
                            if (p.portraitPath) topPlayerPortraits.push(p.portraitPath)

                            // Rich Preview
                            const currentYear = 2025 + Math.floor((parsed.currentWeek || 1) / 52)
                            const eval_ = evaluatePlayer(p, undefined, currentYear, parsed.currentWeek)
                            topPlayerPreviews.push({
                                id: p.id,
                                nickname: p.nickname,
                                nationality: p.nationality || "Unknown",
                                portraitPath: p.portraitPath || "/player_placeholder.png",
                                ovr: eval_.overallRating
                            })
                        }
                    })
                }

                // Calculate Team Rating using full evaluation engine
                let teamOvr = 0
                if (playerTeam && parsed.players) {
                    const currentYear = 2025 + Math.floor((parsed.currentWeek || 1) / 52)
                    const roster = parsed.players.filter(p => playerTeam.rosterIds.includes(p.id))
                    if (roster.length > 0) {
                        teamOvr = Math.round(roster.reduce((acc, p) => acc + evaluatePlayer(p, undefined, currentYear, parsed.currentWeek).overallRating, 0) / roster.length)
                    }
                }

                // Count major wins from trophies
                const majorWins = (playerTeam?.trophies || []).filter(t => t.tier === "S_TIER").length

                slots.push({
                    slotId: key,
                    saveId: parsed.saveId,
                    saveName: parsed.saveName,
                    currentWeek: parsed.currentWeek,
                    teamName: playerTeam?.name ?? null,
                    teamLogo: playerTeam?.logoPath,
                    updatedAt: parsed.updatedAt,
                    isEmpty: false,
                    stats: parsed.managerDetails ? {
                        wins: parsed.managerDetails.careerWins,
                        losses: parsed.managerDetails.careerLosses,
                        tournamentsWon: parsed.managerDetails.championships,
                        majorWins: majorWins
                    } : undefined,

                    topPlayerPreviews,
                    topPlayerPortraits,
                    teamOvr,
                    budget: playerTeam?.budget ?? 0,

                    // NEW: Date/Time Data
                    gameStartDate: parsed.gameStartDate,

                    // NEW: Trophy Data (last 5 trophies)
                    trophies: (playerTeam?.trophies || []).slice(-5).map(t => ({
                        tournamentId: t.tournamentId,
                        tournamentName: t.tournamentName,
                        tier: t.tier || "C_TIER",
                        logoPath: t.trophyPath,
                        week: t.week
                    }))
                })
            } catch {
                // Skip corrupted saves
            }
        }

        return slots.sort((a, b) => {
            if (!a.updatedAt) return 1
            if (!b.updatedAt) return -1
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
    }

    // ===== ATOMIC WEEK TICK =====

    /**
     * Begin atomic week tick transaction
     */
    async beginWeekTick(save: GameSave): Promise<WeekTickState> {
        const state: WeekTickState = {
            // Track the week being processed after increment in AtomicWeekProcessor.
            weekNumber: save.currentWeek + 1,
            saveId: save.saveId,
            startedAt: new Date().toISOString(),

            trainingComplete: false,
            fatigueRecoveryComplete: false,
            injuryChecksComplete: false,
            financeComplete: false,
            tournamentProcessingComplete: false,
            matchSimulationComplete: false,
            standingsUpdateComplete: false,
            eventGenerationComplete: false,
            worldLogicComplete: false,
            restDayProcessingComplete: false,

            pendingMatchIds: save.scheduledMatches
                .filter(m => m.week === save.currentWeek)
                .map(m => m.id),
            completedMatchIds: [],
            generatedEventIds: [],
        }

        // Persist transaction state
        await this.storage.setItem(this.getWeekTickStateKey(save.saveId), JSON.stringify(state))

        return state
    }

    /**
     * Mark a step as complete in transaction
     */
    async markStepComplete(
        state: WeekTickState,
        step: keyof Omit<WeekTickState, "weekNumber" | "saveId" | "startedAt" | "pendingMatchIds" | "completedMatchIds" | "generatedEventIds" | "errorMessage" | "failedStep">
    ): Promise<void> {
        (state[step] as boolean) = true
        await this.storage.setItem(this.getWeekTickStateKey(state.saveId), JSON.stringify(state))
    }

    /**
     * Record match completion in transaction
     */
    async recordMatchComplete(state: WeekTickState, matchId: string): Promise<void> {
        state.completedMatchIds.push(matchId)
        state.pendingMatchIds = state.pendingMatchIds.filter(id => id !== matchId)
        await this.storage.setItem(this.getWeekTickStateKey(state.saveId), JSON.stringify(state))
    }

    /**
     * Record generated event in transaction
     */
    async recordEventGenerated(state: WeekTickState, eventId: string): Promise<void> {
        state.generatedEventIds.push(eventId)
        await this.storage.setItem(this.getWeekTickStateKey(state.saveId), JSON.stringify(state))
    }

    /**
     * Mark transaction as failed
     */
    async markTransactionFailed(state: WeekTickState, step: string, error: string): Promise<void> {
        state.failedStep = step
        state.errorMessage = error
        await this.storage.setItem(this.getWeekTickStateKey(state.saveId), JSON.stringify(state))
    }

    /**
     * Complete transaction (clear state)
     */
    async completeWeekTick(saveId?: string): Promise<void> {
        await this.storage.removeItem(this.getWeekTickStateKey(saveId))
        // Legacy cleanup for old global key.
        if (saveId) {
            await this.storage.removeItem(STORAGE_KEYS.WEEK_TICK_STATE)
        }
    }

    /**
     * Check for incomplete transaction
     */
    async getIncompleteTransaction(saveId?: string): Promise<WeekTickState | null> {
        const key = this.getWeekTickStateKey(saveId)
        let data = await this.storage.getItem(key)

        // Backward compatibility with legacy global key.
        if (!data && saveId) {
            const legacyData = await this.storage.getItem(STORAGE_KEYS.WEEK_TICK_STATE)
            if (legacyData) {
                try {
                    const legacy = JSON.parse(legacyData) as WeekTickState
                    if (!legacy.saveId || legacy.saveId === saveId) {
                        legacy.saveId = saveId
                        data = JSON.stringify(legacy)
                        await this.storage.setItem(key, data)
                        await this.storage.removeItem(STORAGE_KEYS.WEEK_TICK_STATE)
                    }
                } catch {
                    // Ignore malformed legacy state.
                }
            }
        }

        if (!data) return null

        try {
            const state = JSON.parse(data) as WeekTickState
            if (saveId && state.saveId && state.saveId !== saveId) {
                return null
            }
            const requiredFlags: Array<keyof WeekTickState> = [
                "trainingComplete",
                "fatigueRecoveryComplete",
                "injuryChecksComplete",
                "financeComplete",
                "tournamentProcessingComplete",
                "matchSimulationComplete",
                "standingsUpdateComplete",
                "eventGenerationComplete",
                "worldLogicComplete",
                "restDayProcessingComplete"
            ]

            if (!requiredFlags.every(flag => typeof state[flag] === "boolean")) {
                // Incompatible transaction format from older builds; discard resume state.
                await this.completeWeekTick(saveId)
                return null
            }

            // If transaction record exists, always return it for the processor to decide.
            // This preserves resume-after-crash safety for the edge case where all step
            // flags are true but finalization/clear was interrupted.
            return state
        } catch {
            return null
        }
    }

    /**
     * Rollback incomplete transaction
     */
    async rollbackTransaction(saveId: string): Promise<{ success: boolean }> {
        try {
            // Load from backup if available
            const backupKey = STORAGE_KEYS.BACKUP_PREFIX + saveId
            const backup = await this.storage.getItem(backupKey)

            if (backup) {
                const key = STORAGE_KEYS.SAVE_PREFIX + saveId
                await this.storage.setItem(key, backup)
            }

            // Clear transaction state
            await this.completeWeekTick(saveId)

            return { success: true }
        } catch {
            return { success: false }
        }
    }

    // ===== MIGRATIONS =====

    /**
     * Migrate save to current version
     */
    migrateSave(save: unknown): GameSave {
        if (!save || typeof save !== "object") {
            throw new Error("Invalid save data")
        }

        let migrated = save as Record<string, unknown>
        const version = (migrated.saveVersion as number) || 0
        // Apply migrations in order
        if (version < 1) {
            migrated = this.migrateToV1(migrated)
        }
        if (version < 2) {
            migrated = this.migrateToV2(migrated)
        }
        if (version < 3) {
            migrated = this.migrateToV3(migrated)
        }
        if (version < 4) {
            migrated = this.migrateToV4(migrated)
        }
        if (version < 5) {
            migrated = this.migrateToV5(migrated)
        }

        return migrated as unknown as GameSave
    }

    /**
     * Migrate save to v2
     */
    private migrateToV2(save: Record<string, unknown>): Record<string, unknown> {
        return {
            ...save,
            saveVersion: 2,
            scoutedPlayers: Array.isArray(save.scoutedPlayers) ? save.scoutedPlayers : [],
            circuitPoints: Array.isArray(save.circuitPoints) ? save.circuitPoints : [],
            tournamentQualifications: Array.isArray(save.tournamentQualifications) ? save.tournamentQualifications : [],
        }
    }

    /**
     * Migrate save to v3
     */
    private migrateToV3(save: Record<string, unknown>): Record<string, unknown> {
        const teams = Array.isArray(save.teams) ? save.teams : []
        let playerTeamId = (save.playerTeamId as string)

        // Recover playerTeamId from finance ledger if missing (V2 saves)
        if (!playerTeamId && Array.isArray(save.financeLedger) && save.financeLedger.length > 0) {
            playerTeamId = (save.financeLedger[0] as FinanceLedgerEntry).teamId
        }

        playerTeamId = playerTeamId || teams[0]?.id || "unknown"

        return {
            ...save,
            saveVersion: 3,
            playerTeamId,
            managerDetails: save.managerDetails || {
                name: (save.saveName as string) || "Manager",
                level: 1,
                xp: 0,
                reputation: 0,
                careerWins: 0,
                careerLosses: 0,
                championships: 0
            },
            marketStaff: save.marketStaff || [],
            newsFeed: save.newsFeed || [],
            transferHistory: save.transferHistory || [],
            scheduledActivities: save.scheduledActivities || []
        }
    }

    /**
     * Migrate save to v4
     */
    private migrateToV4(save: Record<string, unknown>): Record<string, unknown> {
        return {
            ...save,
            saveVersion: 4,
            academyPlayers: Array.isArray(save.academyPlayers) ? save.academyPlayers : [],
            academyMatchHistory: Array.isArray(save.academyMatchHistory) ? save.academyMatchHistory : [],
            academyRoster: save.academyRoster || { IGL: null, Entry: null, AWPer: null, Support: null, Rifler: null },
            academyTrainingSchedule: save.academyTrainingSchedule || {},
            academyWeeklyReports: Array.isArray(save.academyWeeklyReports) ? save.academyWeeklyReports : [],
            academyScoutingMissions: Array.isArray(save.academyScoutingMissions) ? save.academyScoutingMissions : [],
            academyPendingProspects: Array.isArray(save.academyPendingProspects) ? save.academyPendingProspects : []
        }
    }

    /**
     * Migrate save to v5
     * - Introduces hybrid day progression cursor.
     * - Normalizes tournament identity fields (seriesId/instanceId/seasonNumber).
     * - Deduplicates legacy base + seasonal tournament rows.
     */
    private migrateToV5(save: Record<string, unknown>): Record<string, unknown> {
        const currentWeek =
            (typeof save.currentWeek === "number" && Number.isFinite(save.currentWeek) && save.currentWeek > 0)
                ? Math.floor(save.currentWeek)
                : 1

        const timeMode = save.timeMode === "HYBRID_DAILY" ? "HYBRID_DAILY" : "WEEKLY"
        const rawCurrentDay = (save.currentDay as number)
        const currentDay = (typeof rawCurrentDay === "number" && Number.isFinite(rawCurrentDay))
            ? Math.max(0, Math.min(6, Math.floor(rawCurrentDay)))
            : (timeMode === "HYBRID_DAILY" ? 0 : 6)

        const tournaments = Array.isArray(save.tournaments)
            ? (save.tournaments as TournamentSaveData[])
            : []

        const replacementById = new Map<string, string>()
        const grouped = new Map<string, TournamentSaveData[]>()

        for (const row of tournaments) {
            const identity = resolveTournamentIdentity(row.id, row.startWeek || currentWeek)
            const normalized: TournamentSaveData = {
                ...row,
                seriesId: row.seriesId || identity.seriesId,
                seasonNumber: row.seasonNumber || identity.seasonNumber,
                instanceId: row.instanceId || identity.instanceId,
            }
            const key = `${normalized.seriesId}:${normalized.seasonNumber}`
            const bucket = grouped.get(key) || []
            bucket.push(normalized)
            grouped.set(key, bucket)
        }

        const canonicalTournaments: TournamentSaveData[] = []
        for (const bucket of grouped.values()) {
            bucket.sort((left, right) => {
                const leftScore =
                    (left.isCompleted ? 1000 : 0)
                    + ((left.playoffBracket?.length || 0) * 10)
                    + (left.teamIds?.length || 0)
                    + (left.id === left.instanceId ? 5 : 0)
                const rightScore =
                    (right.isCompleted ? 1000 : 0)
                    + ((right.playoffBracket?.length || 0) * 10)
                    + (right.teamIds?.length || 0)
                    + (right.id === right.instanceId ? 5 : 0)
                return rightScore - leftScore
            })

            const canonical = { ...bucket[0] }
            for (let i = 0; i < bucket.length; i++) {
                const candidate = bucket[i]
                if (candidate.id !== canonical.id) {
                    replacementById.set(candidate.id, canonical.id)
                }

                if (!canonical.winnerId && candidate.winnerId) canonical.winnerId = candidate.winnerId
                if (!canonical.isCompleted && candidate.isCompleted) canonical.isCompleted = true
                if (!canonical.rewardsGranted && candidate.rewardsGranted) canonical.rewardsGranted = true

                if ((candidate.teamIds?.length || 0) > 0) {
                    canonical.teamIds = [...new Set([...(canonical.teamIds || []), ...candidate.teamIds])]
                }

                if ((canonical.playoffBracket?.length || 0) === 0 && (candidate.playoffBracket?.length || 0) > 0) {
                    canonical.playoffBracket = candidate.playoffBracket
                }

                if ((canonical.standings?.length || 0) === 0 && (candidate.standings?.length || 0) > 0) {
                    canonical.standings = candidate.standings
                }
            }

            if (canonical.startWeek > currentWeek) {
                // Remove phantom future state from legacy snapshot-seeded rows.
                canonical.teamIds = []
                canonical.standings = []
                canonical.playoffBracket = []
                canonical.currentStage = "Registration"
                canonical.isCompleted = false
                canonical.winnerId = undefined
                canonical.rewardsGranted = false
            }

            canonicalTournaments.push(canonical)
        }

        canonicalTournaments.sort((a, b) => {
            if (a.startWeek !== b.startWeek) return a.startWeek - b.startWeek
            return a.id.localeCompare(b.id)
        })

        const remapTournamentId = (id: string): string => replacementById.get(id) || id

        const scheduledMatches = Array.isArray(save.scheduledMatches)
            ? (save.scheduledMatches as MatchSaveData[]).map(match => ({
                ...match,
                tournamentId: match.tournamentId ? remapTournamentId(match.tournamentId) : match.tournamentId
            }))
            : []

        const completedMatches = Array.isArray(save.completedMatches)
            ? (save.completedMatches as CompletedMatchSaveData[]).map(match => ({
                ...match,
                tournamentId: match.tournamentId ? remapTournamentId(match.tournamentId) : match.tournamentId
            }))
            : []

        const teams = Array.isArray(save.teams)
            ? (save.teams as TeamSaveData[]).map(team => ({
                ...team,
                trophies: (team.trophies || []).map(trophy => ({
                    ...trophy,
                    tournamentId: remapTournamentId(trophy.tournamentId)
                }))
            }))
            : []

        const rawQualifications = Array.isArray(save.tournamentQualifications)
            ? (save.tournamentQualifications as QualificationStatus[])
            : []

        const normalizedQualifications = dedupeQualifications(
            rawQualifications.map(row => normalizeQualificationStatus({
                ...row,
                tournamentId: remapTournamentId(row.tournamentId),
                instanceId: row.instanceId ? remapTournamentId(row.instanceId) : row.instanceId,
                sourceInstanceId: row.sourceInstanceId ? remapTournamentId(row.sourceInstanceId) : row.sourceInstanceId
            }, currentWeek)),
            currentWeek
        )

        return {
            ...save,
            saveVersion: 5,
            currentWeek,
            currentDay,
            timeMode,
            tournaments: canonicalTournaments,
            scheduledMatches,
            completedMatches,
            teams,
            tournamentQualifications: normalizedQualifications,
        }
    }

    /**
     * Migrate legacy save to v1
     */
    private migrateToV1(save: Record<string, unknown>): Record<string, unknown> {
        // Ensure required fields with defaults
        return {
            ...save,
            saveVersion: 1,
            saveId: save.saveId || `migrated_${Date.now()}`,
            saveName: save.saveName || "Migrated Save",
            createdAt: save.createdAt || new Date().toISOString(),
            updatedAt: save.updatedAt || new Date().toISOString(),
            currentWeek: save.currentWeek ?? save.week ?? 1,
            gameStartDate: save.gameStartDate || new Date().toISOString(),

            // Arrays - ensure they exist
            teams: Array.isArray(save.teams) ? save.teams : [],
            players: Array.isArray(save.players) ? save.players : [],
            contracts: Array.isArray(save.contracts) ? save.contracts : [],
            tournaments: Array.isArray(save.tournaments) ? save.tournaments : [],
            scheduledMatches: Array.isArray(save.scheduledMatches) ? save.scheduledMatches : [],
            completedMatches: Array.isArray(save.completedMatches) ? save.completedMatches : [],
            financeLedger: Array.isArray(save.financeLedger) ? save.financeLedger : [],
            eventsLog: Array.isArray(save.eventsLog) ? save.eventsLog : [],
            acknowledgedEventIds: Array.isArray(save.acknowledgedEventIds) ? save.acknowledgedEventIds : [],

            // Phase 23
            hallOfFame: Array.isArray(save.hallOfFame) ? save.hallOfFame : FOUNDING_LEGENDS,

            // RNG
            lastRngSeed: save.lastRngSeed ?? save.seed ?? generateSeed(),

            // Legacy
            legendaryPlayers: Array.isArray(save.legendaryPlayers) ? save.legendaryPlayers : [],

            // Transaction - always null on load
            weekTickState: null,
        }
    }

    // ===== UTILITIES =====

    /**
     * Export save as JSON string (for backup/sharing)
     */
    exportSave(save: GameSave): string {
        return JSON.stringify(save, null, 2)
    }

    /**
     * Import save from JSON string
     */
    importSave(json: string): { save: GameSave | null; error?: string } {
        try {
            const parsed = JSON.parse(json)
            const migrated = this.migrateSave(parsed)

            if (!validateSaveStructure(migrated)) {
                return { save: null, error: "Invalid save structure" }
            }

            // Generate new ID to avoid conflicts
            migrated.saveId = `imported_${Date.now()}_${generateSeed().toString(36)}`
            delete migrated.integrityHash

            return { save: migrated }
        } catch (error) {
            return {
                save: null,
                error: error instanceof Error ? error.message : "Invalid JSON",
            }
        }
    }

    /**
     * Check storage quota
     */
    async getStorageInfo(): Promise<{ used: number; available: string; saveCount: number }> {
        let used = 0
        let saveCount = 0

        const keys = await this.storage.getAllKeys()

        for (const key of keys) {
            const value = await this.storage.getItem(key)
            if (value) {
                used += key.length + value.length
                if (key.startsWith(STORAGE_KEYS.SAVE_PREFIX)) {
                    saveCount++
                }
            }
        }

        // IndexedDB doesn't have a strict limited quota like localStorage, but we can return text
        return { used, available: "Unlimited (Disk Based)", saveCount }
    }
}

export const saveManager = new SaveManager()
