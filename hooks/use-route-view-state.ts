"use client"

import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { routeViewCache } from "@/lib/route-view-cache"

/** Retain list controls across route remounts without inheriting another career's filters. */
export function useRouteViewState<T>(career: string | null | undefined, field: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    const key = JSON.stringify([career, field])
    const [snapshot, setSnapshot] = useState(() => ({ key, value: routeViewCache.get(career, field, initial) }))
    // Reset during render when the career changes, before stale filters reach the screen.
    if (snapshot.key !== key) setSnapshot({ key, value: routeViewCache.get(career, field, initial) })
    useEffect(() => {
        if (snapshot.key === key) routeViewCache.set(career, field, snapshot.value)
    }, [career, field, key, snapshot])
    const setValue: Dispatch<SetStateAction<T>> = update => setSnapshot(previous => ({
        key,
        value: typeof update === "function"
            ? (update as (value: T) => T)(previous.key === key ? previous.value : initial)
            : update,
    }))
    return [snapshot.key === key ? snapshot.value : initial, setValue]
}
