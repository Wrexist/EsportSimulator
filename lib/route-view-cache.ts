/** Session-only presentation state. Never persisted into a career or map project. */
export function createRouteViewCache(limit = 96) {
    const entries = new Map<string, unknown>()
    const key = (career: string, field: string) => JSON.stringify([career, field])
    return {
        get<T>(career: string | null | undefined, field: string, fallback: T): T {
            if (!career) return fallback
            const id = key(career, field)
            return entries.has(id) ? entries.get(id) as T : fallback
        },
        set<T>(career: string | null | undefined, field: string, value: T) {
            if (!career) return
            const id = key(career, field)
            entries.delete(id)
            entries.set(id, value)
            while (entries.size > Math.max(1, limit)) entries.delete(entries.keys().next().value!)
        },
    }
}

export const routeViewCache = createRouteViewCache()
