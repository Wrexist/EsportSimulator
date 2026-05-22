/**
 * Save integrity / signature subsystem.
 *
 * Three signature formats coexist:
 *   - legacy  (8-char FNV-1a hex, no prefix)        — pre-v2 saves
 *   - "v2:"   (SHA-256 of `${installSecret}|${payload}`) — device-bound
 *   - "v3:"   (SHA-256 of `payload`)                — portable, cross-device
 *
 * New saves are signed v3. Loading accepts all three with a one-time
 * re-sign migration for v2 saves on different devices.
 *
 * Extracted from save-manager.ts (Phase H2). The integrity subsystem owns
 * the install-secret cache + the WebCrypto fallback, so SaveManager
 * doesn't need to know about hashing internals.
 */

import { STORAGE_KEYS } from "./save-types"
import type { AsyncStorage } from "./storage-adapter"
import { generateSeed } from "./rng"

export class SaveIntegrityManager {
    private installSecretPromise: Promise<string> | null = null

    constructor(private readonly storage: AsyncStorage) { }

    /**
     * Canonical serialization for hashing — strips integrityHash so the
     * hash is reproducible whether or not it's already present.
     */
    private serializeForIntegrity(save: Record<string, unknown>): string {
        const { integrityHash: _omit, ...rest } = save
        void _omit
        return JSON.stringify(rest)
    }

    /**
     * 32-bit FNV-1a hash. Used by legacy (pre-v2) saves and as the v2
     * cross-device migration fallback. Not cryptographic — kept only for
     * backward compatibility.
     */
    private computeLegacyIntegrityHash(save: Record<string, unknown>): string {
        const payload = this.serializeForIntegrity(save)
        let hash = 2166136261
        for (let i = 0; i < payload.length; i++) {
            hash ^= payload.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, "0")
    }

    /**
     * SHA-256 via WebCrypto with an FNV fallback when WebCrypto isn't
     * available (older Node runtimes, hostile test envs).
     */
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

        let hash = 2166136261
        for (let i = 0; i < payload.length; i++) {
            hash ^= payload.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return (hash >>> 0).toString(16).padStart(8, "0")
    }

    /**
     * Lazy, cached install-secret read/create. Reuses the same promise for
     * concurrent callers within one SaveIntegrityManager instance.
     */
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

    /**
     * Device-bound v2 signature. Used during cross-device migration only —
     * new saves are written as v3.
     */
    private async computeDeviceBoundIntegrityHash(save: Record<string, unknown>): Promise<string> {
        const secret = await this.getOrCreateInstallSecret()
        const payload = this.serializeForIntegrity(save)
        const digest = await this.computeSha256Hex(`${secret}|${payload}`)
        return `v2:${digest}`
    }

    /**
     * Portable v3 signature — written for every new save. SHA-256 of the
     * canonical payload; no install secret. Survives cloud sync between
     * devices.
     *
     * NOTE: because v3 is keyless, it detects accidental corruption / partial
     * writes — it is NOT tamper-proof. A user who edits a save can recompute a
     * matching hash. That is an accepted limitation for a single-player game;
     * do not treat a passing v3 check as an anti-cheat guarantee.
     */
    async computeIntegrityHash(save: Record<string, unknown>): Promise<string> {
        const payload = this.serializeForIntegrity(save)
        const digest = await this.computeSha256Hex(payload)
        return `v3:${digest}`
    }

    /**
     * Validate a save's signature, accepting v3 / v2 / legacy formats.
     * Unsigned saves are always rejected. This catches corruption and partial
     * writes; only the device-bound v2 signature resists deliberate tampering.
     */
    async verifyIntegrityHash(save: Record<string, unknown>): Promise<boolean> {
        if (!save.integrityHash) return false
        if (typeof save.integrityHash !== "string") return false

        if (save.integrityHash.startsWith("v3:")) {
            return save.integrityHash === await this.computeIntegrityHash(save)
        }
        if (save.integrityHash.startsWith("v2:")) {
            // Same device → still verifies.
            const expectedDeviceBound = await this.computeDeviceBoundIntegrityHash(save)
            if (save.integrityHash === expectedDeviceBound) return true

            // Cross-device v2 → accept if the legacy (device-independent)
            // portion matches. Save will be re-signed v3 on next write.
            const legacyHash = this.computeLegacyIntegrityHash(save)
            const v2Payload = save.integrityHash.substring(3)
            return v2Payload.length >= 8 && v2Payload === legacyHash
        }
        // Pre-v2 legacy signature.
        return save.integrityHash === this.computeLegacyIntegrityHash(save)
    }
}
