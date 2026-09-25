import { computeWeek } from "./compute-week"
import type { ProcessWeekMessage, WorkerResponse } from "./week-processor-protocol"

const respond = (message: WorkerResponse) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<ProcessWeekMessage>) => {
  if (event.data.type !== "PROCESS_WEEK") return
  const { requestId, save, config, rngSeed } = event.data
  try {
    const computed = await computeWeek(save, {
      playerTeamId: config.playerTeamId,
      trainingFocus: new Map(config.trainingFocus),
    }, rngSeed)
    respond({ type: "RESULT", requestId, ...computed })
  } catch (error) {
    respond({ type: "ERROR", requestId, error: error instanceof Error ? error.message : "Unknown worker error" })
  }
}

respond({ type: "READY" })
