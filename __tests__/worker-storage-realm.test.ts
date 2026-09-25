describe("storage selection in a worker realm", () => {
  test("a realm with IndexedDB but no window does not open durable storage on import", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "indexedDB")
    const open = jest.fn()
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: { open } })
    try {
      let storage!: typeof import("@/engine/storage-adapter").asyncStorage
      jest.isolateModules(() => { storage = require("@/engine/storage-adapter").asyncStorage })
      expect(open).not.toHaveBeenCalled()
      await storage.setItem("test", "in memory")
      expect(await storage.getItem("test")).toBe("in memory")
      expect(open).not.toHaveBeenCalled()
    } finally {
      if (original) Object.defineProperty(globalThis, "indexedDB", original)
      else Reflect.deleteProperty(globalThis, "indexedDB")
    }
  })
})
