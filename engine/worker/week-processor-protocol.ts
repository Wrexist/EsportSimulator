import type { GameSave } from "../save-types"
import type { TrainingFocus } from "@/types"
import type { ComputedWeek } from "./compute-week"

export interface ProcessWeekMessage {
  type: "PROCESS_WEEK"
  requestId: number
  save: GameSave
  config: {
    playerTeamId: string
    trainingFocus: Array<[string, { focus: TrainingFocus; intensity: number }]>
  }
  rngSeed: number
}

export type WorkerResponse =
  | { type: "READY" }
  | ({ type: "RESULT"; requestId: number } & ComputedWeek)
  | { type: "ERROR"; requestId: number; error: string }
