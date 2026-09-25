import type { GameSave } from "../save-types"
import type { WeekProcessorConfig } from "../atomic-week-processor"
import type { SeededRNG } from "../rng"
import type { ComputedWeek } from "./compute-week"
import type { ProcessWeekMessage, WorkerResponse } from "./week-processor-protocol"
import { logger } from "@/lib/logger"

export class WeekProcessorBridge {
  private worker: Worker | null = null
  private workerReady = false
  private workerFailed = false
  private busy = false
  private requestId = 0
  private cancelPending: (() => void) | null = null
  private generation = 0

  constructor(private readonly createWorker: () => Worker) {}

  private discardWorker(): void {
    this.worker?.terminate()
    this.worker = null
    this.workerReady = false
    this.workerFailed = true
  }

  private async ensureWorker(): Promise<boolean> {
    if (this.workerFailed) return false
    if (this.workerReady && this.worker) return true
    try {
      const worker = this.createWorker()
      this.worker = worker
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeout)
          worker.removeEventListener("message", onMessage)
          worker.removeEventListener("error", onError)
          worker.removeEventListener("messageerror", onError)
          this.cancelPending = null
        }
        const fail = (error: Error) => { cleanup(); reject(error) }
        const onMessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data?.type !== "READY") return
          cleanup()
          this.workerReady = true
          resolve()
        }
        const onError = (event: Event) => {
          event?.preventDefault?.()
          fail(new Error("Worker initialization failed"))
        }
        const timeout = setTimeout(() => fail(new Error("Worker initialization timeout")), 5000)
        this.cancelPending = () => fail(new Error("Week processing cancelled"))
        worker.addEventListener("message", onMessage)
        worker.addEventListener("error", onError)
        worker.addEventListener("messageerror", onError)
      })
      return true
    } catch (error) {
      this.discardWorker()
      logger.warn("[WeekProcessor] Worker unavailable, using synchronous fallback:", error)
      return false
    }
  }

  async processWeek(save: GameSave, config: WeekProcessorConfig, rng: SeededRNG): Promise<ComputedWeek> {
    if (this.busy) throw new Error("A week is already being processed")
    this.busy = true
    const generation = this.generation
    try {
      // Capture once before initialization or timeout yields to another action.
      // The worker and fallback start with the same input and RNG state.
      const input = structuredClone(save)
      const inputConfig = structuredClone(config)
      const rngSeed = rng.getState()
      const canUseWorker = await this.ensureWorker()
      if (generation !== this.generation) throw new Error("Week processing cancelled")
      const computed = canUseWorker && this.worker
        ? await this.processInWorker(this.worker, input, inputConfig, rngSeed)
        : await this.processSync(input, inputConfig, rngSeed)
      if (generation !== this.generation) throw new Error("Week processing cancelled")
      return computed
    } finally {
      this.busy = false
    }
  }

  private processInWorker(worker: Worker, save: GameSave, config: WeekProcessorConfig, rngSeed: number): Promise<ComputedWeek> {
    const requestId = ++this.requestId
    return new Promise((resolve, reject) => {
      let settled = false
      const cleanup = () => {
        settled = true
        clearTimeout(timeout)
        worker.removeEventListener("message", onMessage)
        worker.removeEventListener("error", onError)
        worker.removeEventListener("messageerror", onError)
        this.cancelPending = null
      }
      const fallback = (reason: string) => {
        if (settled) return
        cleanup()
        this.discardWorker()
        logger.warn("[WeekProcessor] Falling back to synchronous processing:", reason)
        this.processSync(save, config, rngSeed).then(resolve, reject)
      }
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data
        if (settled || !response || response.type === "READY" || response.requestId !== requestId) return
        if (response.type === "ERROR") { fallback(response.error); return }
        if (response.type !== "RESULT" || !response.result || !response.save || response.save.saveId !== save.saveId ||
            (response.result.success && response.save.currentWeek !== save.currentWeek + 1) ||
            !Number.isInteger(response.rngState) || response.rngState < 0 || response.rngState > 0xffffffff) {
          fallback("Worker returned an invalid week result")
          return
        }
        cleanup()
        resolve({ result: response.result, save: response.save, rngState: response.rngState })
      }
      const onError = (event: Event) => {
        event?.preventDefault?.()
        fallback("Worker runtime or message error")
      }
      const timeout = setTimeout(() => fallback("Worker request timed out"), 30000)
      this.cancelPending = () => {
        if (settled) return
        cleanup()
        reject(new Error("Week processing cancelled"))
      }
      worker.addEventListener("message", onMessage)
      worker.addEventListener("error", onError)
      worker.addEventListener("messageerror", onError)
      const message: ProcessWeekMessage = {
        type: "PROCESS_WEEK", requestId, save, rngSeed,
        config: { playerTeamId: config.playerTeamId, trainingFocus: Array.from(config.trainingFocus.entries()) },
      }
      try { worker.postMessage(message) }
      catch (error) { fallback(error instanceof Error ? error.message : "Could not send worker request") }
    })
  }

  private async processSync(save: GameSave, config: WeekProcessorConfig, rngSeed: number): Promise<ComputedWeek> {
    const { computeWeek } = await import("./compute-week")
    return computeWeek(save, config, rngSeed)
  }

  isWorkerAvailable(): boolean { return this.workerReady && !this.workerFailed }

  reset(): void {
    this.terminate()
    this.workerFailed = false
  }

  terminate(): void {
    this.generation++
    this.cancelPending?.()
    this.discardWorker()
  }
}
