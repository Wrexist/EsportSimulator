// Manages game state snapshots for time travel and save states
import type { GameState } from "@/types/game"
import { debug } from "@/lib/debug-logger"

export interface Snapshot {
  id: string
  timestamp: Date
  gameDate: Date
  state: GameState
  description: string
}

export class SnapshotManager {
  private static readonly SNAPSHOT_KEY = "game_snapshots"
  private static readonly MAX_SNAPSHOTS = 50

  static createSnapshot(state: GameState, description: string): Snapshot {
    return {
      id: `snapshot_${Date.now()}`,
      timestamp: new Date(),
      gameDate: state.currentDate,
      state: JSON.parse(JSON.stringify(state)),
      description,
    }
  }

  static async saveSnapshot(snapshot: Snapshot): Promise<void> {
    try {
      const existing = await this.loadSnapshots()
      const updated = [snapshot, ...existing].slice(0, this.MAX_SNAPSHOTS)
      localStorage.setItem(this.SNAPSHOT_KEY, JSON.stringify(updated))
    } catch (error) {
      debug.error("Failed to save snapshot:", error)
    }
  }

  static async loadSnapshots(): Promise<Snapshot[]> {
    try {
      const data = localStorage.getItem(this.SNAPSHOT_KEY)
      if (!data) return []
      return JSON.parse(data)
    } catch (error) {
      debug.error("Failed to load snapshots:", error)
      return []
    }
  }

  static async restoreSnapshot(snapshotId: string): Promise<GameState | null> {
    try {
      const snapshots = await this.loadSnapshots()
      const snapshot = snapshots.find((s) => s.id === snapshotId)
      return snapshot ? snapshot.state : null
    } catch (error) {
      debug.error("Failed to restore snapshot:", error)
      return null
    }
  }

  static async deleteSnapshot(snapshotId: string): Promise<void> {
    try {
      const snapshots = await this.loadSnapshots()
      const filtered = snapshots.filter((s) => s.id !== snapshotId)
      localStorage.setItem(this.SNAPSHOT_KEY, JSON.stringify(filtered))
    } catch (error) {
      debug.error("Failed to delete snapshot:", error)
    }
  }

  static async clearAllSnapshots(): Promise<void> {
    try {
      localStorage.removeItem(this.SNAPSHOT_KEY)
    } catch (error) {
      debug.error("Failed to clear snapshots:", error)
    }
  }
}
