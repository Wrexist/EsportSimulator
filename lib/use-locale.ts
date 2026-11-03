"use client"

import { useEffect, useSyncExternalStore } from "react"
import { getLocale, loadLocaleFile, setLocale, subscribeLocale } from "./i18n"

/** Re-render on language change. Returns the active locale. */
export function useLocale(): string {
    return useSyncExternalStore(subscribeLocale, getLocale, () => "en")
}

/**
 * Keeps the active language in step with the Settings choice: loads that
 * language's file, then switches to it (English when the file is missing or
 * incomplete). Mounted once, in the game shell.
 */
export function useUiLanguageSync(language: string) {
    useEffect(() => {
        let cancelled = false
        if (language === "en") { setLocale("en"); return }
        void loadLocaleFile(language).then(() => { if (!cancelled) setLocale(language) })
        return () => { cancelled = true }
    }, [language])
}
