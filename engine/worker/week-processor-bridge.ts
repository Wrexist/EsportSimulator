/**
 * Week Processor Bridge
 *
 * Manages the Web Worker lifecycle for week processing.
 * Falls back to synchronous processing when workers are unavailable
 * (e.g., during SSR, in some Electron configs, or if worker fails to load).
 */

import type { GameSave } from "../save-types"
import type { WeekProcessorConfig, WeekProcessorResult } from "../atomic-week-processor"
import type { SeededRNG } from "../rng"
import { logger } from "@/lib/logger"

interface WorkerResult {
  type: "RESULT"
  result: WeekProcessorResult
  save: GameSave
  rngState: number
}

interface WorkerError {
  type: "ERROR"
  error: string
}

type WorkerResponse = WorkerResult | WorkerError | { type: "READY" }

class WeekProcessorBridge {
  private worker: Worker | null = null
  private workerReady = false
  private workerFailed = false
  private initPromise: Promise<void> | null = null

  /**
   * Lazily initialize the worker on first use
   */
  private async ensureWorker(): Promise<boolean> {
    if (this.workerFailed) return false
    if (this.workerReady && this.worker) return true

    if (!this.initPromise) {
      this.initPromise = this.initWorker()
    }

    try {
      await this.initPromise
      return this.workerReady
    } catch {
      this.workerFailed = true
      return false
    }
  }

  private async initWorker(): Promise<void> {
    // Check if we're in a browser environment with Worker support
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      this.workerFailed = true
      return
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.worker = new Worker(
          new URL("./week-processor.worker.ts", import.meta.url)
        )

        const timeout = setTimeout(() => {
          this.workerFailed = true
          reject(new Error("Worker initialization timeout"))
        }, 5000)

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === "READY") {
            clearTimeout(timeout)
            this.workerReady = true
            resolve()
          }
        }

        this.worker.onerror = (err) => {
          clearTimeout(timeout)
          this.workerFailed = true
          logger.warn("[WeekProcessor] Worker failed to load, using synchronous fallback:", err.message)
          reject(err)
        }
      } catch (err) {
        this.workerFailed = true
        reject(err)
      }
    })
  }

  /**
   * Process a week, preferring the Web Worker but falling back to synchronous
   */
  async processWeek(
    save: GameSave,
    config: WeekProcessorConfig,
    rng: SeededRNG
  ): Promise<{ result: WeekProcessorResult; save: GameSave; rngState: number }> {
    const canUseWorker = await this.ensureWorker()

    if (canUseWorker && this.worker) {
      return this.processInWorker(save, config, rng)
    }

    // Synchronous fallback
    return this.processSync(save, config, rng)
  }

  private processInWorker(
    save: GameSave,
    config: WeekProcessorConfig,
    rng: SeededRNG
  ): Promise<{ result: WeekProcessorResult; save: GameSave; rngState: number }> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not available"))
        return
      }

      const timeout = setTimeout(() => {
        // Worker took too long - fall back to sync
        logger.warn("[WeekProcessor] Worker timeout, falling back to synchronous")
        this.processSync(save, config, rng).then(resolve).catch(reject)
      }, 30000) // 30 second timeout

      const handler = (event: MessageEvent<WorkerResponse>) => {
        clearTimeout(timeout)
        this.worker!.removeEventListener("message", handler)

        if (event.data.type === "RESULT") {
          resolve({
            result: event.data.result,
            save: event.data.save,
            rngState: event.data.rngState,
          })
        } else if (event.data.type === "ERROR") {
          // Worker error - fall back to sync
          logger.warn("[WeekProcessor] Worker error, falling back:", event.data.error)
          this.processSync(save, config, rng).then(resolve).catch(reject)
        }
      }

      this.worker.addEventListener("message", handler)

      // Serialize the config (Maps can't be postMessage'd)
      const serializedConfig = {
        playerTeamId: config.playerTeamId,
        trainingFocus: Array.from(config.trainingFocus.entries()),
      }

      // Post the message to the worker
      // Note: structuredClone happens automatically via postMessage
      this.worker.postMessage({
        type: "PROCESS_WEEK",
        save,
        config: serializedConfig,
        rngSeed: rng.getState(),
      })
    })
  }

  private async processSync(
    save: GameSave,
    config: WeekProcessorConfig,
    rng: SeededRNG
  ): Promise<{ result: WeekProcessorResult; save: GameSave; rngState: number }> {
    // Lazy import to avoid bundling in worker context
    const { atomicWeekProcessor } = await import("@/engine")
    const result = await atomicWeekProcessor.processWeek(save, config, rng)
    return { result, save, rngState: rng.getState() }
  }

  /**
   * Check if the worker is available and ready
   */
  isWorkerAvailable(): boolean {
    return this.workerReady && !this.workerFailed
  }

  /**
   * Terminate the worker (cleanup)
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.workerReady = false
    }
  }
}

// Singleton instance
export const weekProcessorBridge = new WeekProcessorBridge()
