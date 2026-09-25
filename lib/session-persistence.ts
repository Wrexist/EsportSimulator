interface SessionState {
  saveId: string | null
  isLoading: boolean
  saveGame: () => Promise<void>
}

interface SessionPersistenceOptions {
  getState: () => SessionState
  getSettings: () => { autoSave: boolean; autoSaveInterval: number }
  flush: () => Promise<void>
  confirm: (variant: "simulationRunning" | "saveFailed") => Promise<boolean>
  showSaving: (saving: boolean) => void
  onError: (error: unknown) => void
}

// Own the timer and the close operation together. Canceling close resumes the
// existing timer; React remounts dispose the complete lifecycle, not half of it.
export function createSessionPersistence(options: SessionPersistenceOptions) {
  let elapsedMs = 0
  let disposed = false
  let closePromise: Promise<boolean> | null = null
  let periodicSave: Promise<void> | null = null
  const tickMs = 30000

  const timer = setInterval(() => {
    if (disposed || closePromise || periodicSave) return
    const settings = options.getSettings()
    if (!settings.autoSave) { elapsedMs = 0; return }
    elapsedMs += tickMs
    const minutes = Number.isFinite(settings.autoSaveInterval) ? Math.max(1, settings.autoSaveInterval) : 10
    if (elapsedMs < minutes * 60000) return
    const state = options.getState()
    if (!state.saveId || state.isLoading) return
    elapsedMs = 0
    periodicSave = Promise.resolve().then(async () => {
      try {
        await options.flush()
        if (!disposed && !options.getState().isLoading) await options.getState().saveGame()
      } catch (error) { options.onError(error) }
      finally { periodicSave = null }
    })
  }, tickMs)

  async function close(): Promise<boolean> {
    try {
      if (periodicSave) await periodicSave
      await options.flush()
      if (disposed) return false
      if (options.getState().isLoading && !await options.confirm("simulationRunning")) return false
      if (disposed) return false
      const state = options.getState()
      if (!state.isLoading && state.saveId && options.getSettings().autoSave) {
        options.showSaving(true)
        let saved = false
        try {
          for (let attempt = 0; attempt < 3 && !disposed; attempt++) {
            try { await options.getState().saveGame(); saved = true; break }
            catch (error) { options.onError(error) }
          }
        } finally { if (!disposed) options.showSaving(false) }
        if (disposed) return false
        if (!saved) return options.confirm("saveFailed")
      }
      return !disposed
    } catch (error) {
      options.onError(error)
      return disposed ? false : options.confirm("saveFailed")
    }
  }

  return {
    requestClose(): Promise<boolean> {
      if (disposed) return Promise.resolve(false)
      if (!closePromise) closePromise = close().finally(() => { closePromise = null })
      return closePromise
    },
    dispose() { disposed = true; clearInterval(timer) },
  }
}
