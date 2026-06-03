/**
 * Web Worker for Week Processing
 *
 * Moves the heavy atomicWeekProcessor.processWeek() off the main thread
 * to prevent UI freezes during week advancement.
 *
 * Communication protocol:
 * - Main thread sends: { type: "PROCESS_WEEK", save: GameSave, config: SerializedConfig, rngSeed: number }
 * - Worker responds: { type: "RESULT", result: WeekProcessorResult, save: GameSave }
 * - Worker responds on error: { type: "ERROR", error: string }
 */

import { AtomicWeekProcessor, type WeekProcessorConfig } from "../atomic-week-processor"
import { type GameSave, type WeekTickState } from "../save-types"
import { SeededRNG } from "../rng"
import { SaveManager } from "../save-manager"
import type { AsyncStorage } from "../storage-adapter"
import type { TrainingFocus } from "@/types"

// Storage adapter that persists NOTHING. The worker COMPUTES the week and
// returns the mutated save to the main thread, which performs the single
// authoritative write. Without this, the base SaveManager picks the IndexedDB
// adapter (a Worker has no `window`) and writes the full save + per-step
// transaction state to a worker-LOCAL store that diverges from — and in
// Electron bypasses — the store every other load/save in the app uses.
const noopStorage: AsyncStorage = {
  async getItem() { return null },
  async setItem() { /* no-op */ },
  async removeItem() { /* no-op */ },
  async clear() { /* no-op */ },
  async getAllKeys() { return [] },
}

// Compute-only SaveManager for the worker context. The no-op storage turns
// every transaction write (beginWeekTick / markStepComplete /
// recordMatchComplete / completeWeekTick) into a no-op while still building the
// in-memory transaction object the processor needs. `saveGame` is overridden
// explicitly because `processWeek` throws on a non-success result and the base
// method's verify-by-read-back would fail under no-op storage.
class WorkerSaveManager extends SaveManager {
  constructor() {
    super(noopStorage)
  }

  // Resume/rollback is never used in the worker — always process the tick fresh
  // from the save the main thread sent.
  async getIncompleteTransaction(): Promise<WeekTickState | null> {
    return null
  }

  // The worker must NOT persist; the main thread owns the authoritative save.
  async saveGame(): Promise<{ success: boolean; error?: string; repairs?: string[] }> {
    return { success: true }
  }
}

interface ProcessWeekMessage {
  type: "PROCESS_WEEK"
  save: GameSave
  config: {
    playerTeamId: string
    trainingFocus: Array<[string, { focus: TrainingFocus; intensity: number }]>
  }
  rngSeed: number
}

type WorkerMessage = ProcessWeekMessage

const processor = new AtomicWeekProcessor(new WorkerSaveManager())

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data

  if (type === "PROCESS_WEEK") {
    try {
      const { save, config: serializedConfig, rngSeed } = event.data

      // Reconstruct the Map from the serialized array
      const config: WeekProcessorConfig = {
        playerTeamId: serializedConfig.playerTeamId,
        trainingFocus: new Map(serializedConfig.trainingFocus),
      }

      const rng = new SeededRNG(rngSeed)
      const result = await processor.processWeek(save, config, rng)

      // Post back the result and mutated save state
      self.postMessage({
        type: "RESULT",
        result,
        save,
        rngState: rng.getState(),
      })
    } catch (err) {
      self.postMessage({
        type: "ERROR",
        error: err instanceof Error ? err.message : "Unknown worker error",
      })
    }
  }
}

// Signal ready
self.postMessage({ type: "READY" })
