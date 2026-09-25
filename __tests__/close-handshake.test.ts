const { createCloseHandshake } = require("../electron/close-handshake") as {
  createCloseHandshake: (onUnresponsive: () => void) => { request: () => void; acknowledge: () => void; cancel: () => void }
}

describe("Electron close acknowledgement watchdog", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test("an acknowledged close request can wait for a save or player choice indefinitely", () => {
    const unresponsive = jest.fn()
    const handshake = createCloseHandshake(unresponsive)
    handshake.request()
    handshake.acknowledge()
    jest.advanceTimersByTime(120000)
    expect(unresponsive).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  test("only a missing acknowledgement triggers the unresponsive prompt", () => {
    const unresponsive = jest.fn()
    const handshake = createCloseHandshake(unresponsive)
    handshake.request()
    jest.advanceTimersByTime(14999)
    expect(unresponsive).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(unresponsive).toHaveBeenCalledTimes(1)
  })

  test("cancellation clears the watchdog and a later request gets a fresh timeout", () => {
    const unresponsive = jest.fn()
    const handshake = createCloseHandshake(unresponsive)
    handshake.request()
    handshake.cancel()
    jest.advanceTimersByTime(20000)
    expect(unresponsive).not.toHaveBeenCalled()
    handshake.request()
    jest.advanceTimersByTime(15000)
    expect(unresponsive).toHaveBeenCalledTimes(1)
  })
})
