import { AtomicWeekProcessor, type WeekProcessorConfig, type WeekProcessorResult } from "../atomic-week-processor"
import { SaveManager } from "../save-manager"
import type { AsyncStorage } from "../storage-adapter"
import type { GameSave, WeekTickState } from "../save-types"
import { SeededRNG } from "../rng"

export interface ComputedWeek {
  result: WeekProcessorResult
  save: GameSave
  rngState: number
}

const noopStorage: AsyncStorage = {
  async getItem() { return null },
  async setItem() {},
  async removeItem() {},
  async clear() {},
  async getAllKeys() { return [] },
}

// Both transports compute a fresh tick. Only the application coordinator may
// persist it, after academy, synergy, and other post-week changes are applied.
class ComputeOnlySaveManager extends SaveManager {
  constructor() { super(noopStorage) }
  async getIncompleteTransaction(): Promise<WeekTickState | null> { return null }
  async saveGame(): Promise<{ success: boolean }> { return { success: true } }
}

export async function computeWeek(save: GameSave, config: WeekProcessorConfig, rngSeed: number): Promise<ComputedWeek> {
  const rng = new SeededRNG(rngSeed)
  const processor = new AtomicWeekProcessor(new ComputeOnlySaveManager())
  const result = await processor.processWeek(save, config, rng)
  return { result, save, rngState: rng.getState() }
}
