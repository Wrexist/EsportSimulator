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

import { AtomicWeekProcessor, type WeekProcessorConfig, type WeekProcessorResult } from "../atomic-week-processor"
import { type GameSave } from "../save-types"
import { SeededRNG } from "../rng"
import { SaveManager } from "../save-manager"
import type { TrainingFocus } from "@/types"

// Create a no-op SaveManager for the worker context
// The worker doesn't need persistence - it just processes the week
class WorkerSaveManager extends SaveManager {
  constructor() {
    super()
  }

  // Override methods that interact with storage
  async getIncompleteTransaction(): Promise<null> {
    return null
  }

  async saveTransaction(): Promise<void> {
    // No-op in worker
  }

  async clearTransaction(): Promise<void> {
    // No-op in worker
  }

  async saveCheckpoint(): Promise<void> {
    // No-op in worker
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
