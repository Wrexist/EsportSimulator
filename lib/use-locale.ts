"use client"

import { useSyncExternalStore } from "react"
import { getLocale, subscribeLocale } from "./i18n"

/** Re-render on language change. Returns the active locale. */
export function useLocale(): string {
    return useSyncExternalStore(subscribeLocale, getLocale, () => "en")
}
