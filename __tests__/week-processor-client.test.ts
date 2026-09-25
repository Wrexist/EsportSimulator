import { WeekProcessorBridge } from "@/engine/worker/week-processor-client"
import { computeWeek } from "@/engine/worker/compute-week"
import { SeededRNG } from "@/engine/rng"
import type { GameSave } from "@/engine/save-types"
import type { ComputedWeek } from "@/engine/worker/compute-week"
import type { ProcessWeekMessage, WorkerResponse } from "@/engine/worker/week-processor-protocol"

jest.mock("@/engine/worker/compute-week", () => ({ computeWeek: jest.fn() }))
jest.mock("@/lib/logger", () => ({ logger: { warn: jest.fn() } }))

class FakeWorker {
  listeners = new Map<string, Set<(event: { data?: WorkerResponse }) => void>>()
  sent: ProcessWeekMessage[] = []
  terminate = jest.fn()
  failSend = false
  addEventListener(type: string, handler: (event: { data?: WorkerResponse }) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(handler)
  }
  removeEventListener(type: string, handler: (event: { data?: WorkerResponse }) => void) {
    this.listeners.get(type)?.delete(handler)
  }
  postMessage(message: ProcessWeekMessage) {
    if (this.failSend) throw new Error("Clone failed")
    this.sent.push(structuredClone(message))
  }
  emit(type: string, data?: WorkerResponse) {
    for (const handler of Array.from(this.listeners.get(type) ?? [])) handler({ data })
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0) }
}

const save = () => ({ saveId: "test", currentWeek: 1 } as GameSave)
const config = () => ({ playerTeamId: "team", trainingFocus: new Map() })
const computed = (input = save(), rngState = 42): ComputedWeek => ({
  save: { ...input, currentWeek: input.currentWeek + 1 },
  result: { success: true } as ComputedWeek["result"], rngState,
})
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe("week processor transport lifecycle", () => {
  let worker: FakeWorker
  let bridge: WeekProcessorBridge
  const fallback = jest.mocked(computeWeek)
  beforeEach(() => {
    jest.useFakeTimers()
    fallback.mockReset().mockImplementation(async (input, _config, seed) => computed(input, seed))
    worker = new FakeWorker()
    bridge = new WeekProcessorBridge(() => worker as unknown as Worker)
  })
  afterEach(() => { bridge.terminate(); jest.useRealTimers() })

  async function start(input = save(), rng = new SeededRNG(42)) {
    const pending = bridge.processWeek(input, config(), rng)
    worker.emit("message", { type: "READY" })
    await flush()
    return { pending, message: worker.sent[worker.sent.length - 1] }
  }

  test("only the matching response completes a request; cleanup permits the next request", async () => {
    const first = await start()
    worker.emit("message", { type: "RESULT", requestId: first.message.requestId, ...computed() })
    await expect(first.pending).resolves.toMatchObject({ save: { currentWeek: 2 } })
    expect(worker.listenerCount).toBe(0)
    const second = await start({ ...save(), currentWeek: 2 })
    let resolved = false
    void second.pending.then(() => { resolved = true })
    worker.emit("message", { type: "READY" })
    worker.emit("message", { type: "RESULT", requestId: first.message.requestId, ...computed() })
    await flush()
    expect(resolved).toBe(false)
    worker.emit("message", { type: "RESULT", requestId: second.message.requestId, ...computed(second.message.save) })
    await expect(second.pending).resolves.toMatchObject({ save: { currentWeek: 3 } })
    expect(worker.listenerCount).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
    expect(fallback).not.toHaveBeenCalled()
  })

  test("timeout discards the worker and late responses cannot contaminate the next week", async () => {
    const first = await start()
    await jest.advanceTimersByTimeAsync(30000)
    await expect(first.pending).resolves.toMatchObject({ save: { currentWeek: 2 } })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount).toBe(0)
    const second = bridge.processWeek({ ...save(), currentWeek: 2 }, config(), new SeededRNG(99))
    worker.emit("message", { type: "RESULT", requestId: first.message.requestId, ...computed() })
    await expect(second).resolves.toMatchObject({ save: { currentWeek: 3 }, rngState: 99 })
    expect(fallback).toHaveBeenCalledTimes(2)
  })

  test.each(["error", "messageerror", "reported-error", "send-error"])("%s falls back once and clears all request resources", async failure => {
    worker.failSend = failure === "send-error"
    const { pending, message } = await start()
    if (failure === "reported-error") worker.emit("message", { type: "ERROR", requestId: message.requestId, error: "Failed" })
    else if (failure !== "send-error") worker.emit(failure)
    await expect(pending).resolves.toMatchObject({ result: { success: true } })
    await jest.advanceTimersByTimeAsync(30000)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(worker.listenerCount).toBe(0)
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  test("initialization timeout cleans up and uses the captured input and RNG", async () => {
    const input = save()
    const rng = new SeededRNG(123)
    const pending = bridge.processWeek(input, config(), rng)
    input.currentWeek = 99
    rng.next()
    await jest.advanceTimersByTimeAsync(5000)
    await expect(pending).resolves.toMatchObject({ save: { currentWeek: 2 }, rngState: 123 })
    expect(input.currentWeek).toBe(99)
    expect(worker.listenerCount).toBe(0)
  })

  test("unsupported workers use the same compute function", async () => {
    bridge = new WeekProcessorBridge(() => { throw new Error("No Worker support") })
    await expect(bridge.processWeek(save(), config(), new SeededRNG(2))).resolves.toMatchObject({ rngState: 2 })
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  test("a matching but invalid result is discarded and recomputed from captured input", async () => {
    const { pending, message } = await start()
    worker.emit('message', { type: 'RESULT', requestId: message.requestId, ...computed({ ...save(), saveId: 'wrong-career' }) })
    await expect(pending).resolves.toMatchObject({ save: { saveId: 'test', currentWeek: 2 } })
    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  test("overlapping requests reject without disturbing the active week", async () => {
    const { pending, message } = await start()
    await expect(bridge.processWeek(save(), config(), new SeededRNG(3))).rejects.toThrow("already being processed")
    worker.emit("message", { type: "RESULT", requestId: message.requestId, ...computed() })
    await expect(pending).resolves.toMatchObject({ result: { success: true } })
  })

  test.each([false, true])("termination during initialization/processing (ready=%s) rejects without fallback", async ready => {
    const pending = bridge.processWeek(save(), config(), new SeededRNG(3))
    const rejection = expect(pending).rejects.toThrow("cancelled")
    if (ready) { worker.emit("message", { type: "READY" }); await flush() }
    bridge.terminate()
    await rejection
    expect(fallback).not.toHaveBeenCalled()
    expect(worker.listenerCount).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })
})
