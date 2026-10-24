/**
 * Translation layer. English (locales/en.ts) is built in; another language is
 * a JSON file at public/locales/<code>.json with the same keys, written by a
 * human translator (locales/README.md). A language is offered only once its
 * file covers every key, so a half-done file never shows mixed text.
 *
 * Usage:
 *   import { t, tn } from '@/lib/i18n'
 *   t('nav.roster')                 // "Roster"
 *   t('match.round', { n: 5 })      // "Round 5"
 *   tn('menu.saves', 3)             // "3 saves"
 * In a component, useLocale() re-renders it when the language changes.
 */

import { useSyncExternalStore } from "react"
import { EN } from "@/locales/en"

type TranslationDict = Record<string, string>

const translations: Record<string, TranslationDict> = { en: { ...EN } }

let currentLocale = "en"
const listeners = new Set<() => void>()
const notify = () => listeners.forEach(fn => fn())

const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/
const PLACEHOLDER = /\{\{([^{}]+)\}\}/g

/** Set the active locale (falls back to English for one that is missing or incomplete). */
export function setLocale(locale: string) {
    const next = getAvailableLocales().includes(locale) ? locale : "en"
    if (next === currentLocale) return
    currentLocale = next
    if (typeof document !== "undefined") document.documentElement.lang = next
    notify()
}

/** Get the active locale */
export function getLocale(): string {
    return currentLocale
}

/** Locales with a complete dictionary. */
export function getAvailableLocales(): string[] {
    return Object.keys(translations).filter(locale => getLocaleCompleteness(locale).complete)
}

/** Re-render on language change. Returns the active locale. */
export function useLocale(): string {
    return useSyncExternalStore(
        fn => { listeners.add(fn); return () => listeners.delete(fn) },
        getLocale,
        () => "en",
    )
}

/**
 * Translate a key with optional interpolation
 * @param key - Translation key (e.g., "nav.roster")
 * @param params - Optional parameters for interpolation (e.g., { n: 5 })
 * @returns Translated string, or the key if not found
 */
export function t(key: string, params?: Record<string, string | number>): string {
    const dict = translations[currentLocale] || translations.en
    let value = dict[key]

    if (value === undefined) {
        // Fallback to English
        value = translations.en[key]
    }

    if (value === undefined) {
        // Return key as-is if no translation found
        return key
    }

    // Substitute once with a callback: names may contain dollar signs or braces.
    if (params) value = value.replace(PLACEHOLDER, (token, key: string) =>
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : token)

    return value
}

/** Plural: picks `<key>.<form>` by the language's plural rules for `count` ({{count}} is filled in). */
export function tn(key: string, count: number, params?: Record<string, string | number>): string {
    const form = new Intl.PluralRules(currentLocale).select(count)
    const dict = translations[currentLocale] || translations.en
    const chosen = dict[`${key}.${form}`] !== undefined ? `${key}.${form}` : `${key}.other`
    return t(chosen, { count, ...params })
}

/**
 * Register a new locale with translations
 * Call this to add support for a new language
 */
export function registerLocale(locale: string, dict: TranslationDict) {
    if (locale === "en" || !LOCALE_CODE.test(locale)) return
    const clean: TranslationDict = {}
    for (const [key, value] of Object.entries(dict)) if (typeof value === "string") clean[key] = value
    translations[locale] = clean
    notify()
}

/** Load public/locales/<code>.json (a translator's file). False when it is missing or not a flat string map. */
export async function loadLocaleFile(locale: string): Promise<boolean> {
    if (locale === "en") return true
    if (!LOCALE_CODE.test(locale) || typeof fetch === "undefined") return false
    try {
        const res = await fetch(`/locales/${locale}.json`)
        if (!res.ok) return false
        const data: unknown = await res.json()
        if (!data || typeof data !== "object" || Array.isArray(data)) return false
        registerLocale(locale, data as TranslationDict)
        return true
    } catch {
        return false
    }
}

/** The plural forms a language uses (English: one, other). */
function pluralForms(locale: string): readonly string[] {
    try { return new Intl.PluralRules(locale).resolvedOptions().pluralCategories } catch { return ["one", "other"] }
}

/** English keys a locale must have: plural groups need that language's own forms. */
function requiredKeys(locale: string): string[] {
    const forms = pluralForms(locale)
    const out = new Set<string>()
    for (const key of Object.keys(translations.en)) {
        const m = /^(.*)\.(zero|one|two|few|many|other)$/.exec(key)
        if (m && translations.en[`${m[1]}.other`] !== undefined) for (const form of forms) out.add(`${m[1]}.${form}`)
        else out.add(key)
    }
    return [...out]
}

/** Dictionary completeness is not a claim that every route has been translated or tested. */
export function getLocaleCompleteness(locale: string) {
    if (locale === "en") return { complete: true, missing: [] as string[] }
    const dict = Object.prototype.hasOwnProperty.call(translations, locale) ? translations[locale] : {}
    const missing = requiredKeys(locale).filter(key => typeof dict[key] !== "string" || !dict[key].trim())
    return { complete: missing.length === 0, missing }
}

const placeholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map(m => m[1]).sort()

/**
 * A translator's file checked against English: missing keys, keys English
 * does not have, and translations whose {{placeholders}} differ.
 */
export function checkTranslation(locale: string, dict: Record<string, unknown>) {
    const required = requiredKeys(locale)
    const missing = required.filter(key => typeof dict[key] !== "string" || !(dict[key] as string).trim())
    const known = new Set(required)
    const unknown = Object.keys(dict).filter(key => !known.has(key))
    const badPlaceholders = required.filter(key => {
        const value = dict[key]
        if (typeof value !== "string") return false
        const base = key.replace(/\.(zero|one|two|few|many|other)$/, "")
        const source = translations.en[key] ?? translations.en[`${base}.other`] ?? ""
        // A plural form may leave the count out ("une sauvegarde").
        const strip = (list: string[]) => base !== key ? list.filter(name => name !== "count") : list
        return strip(placeholders(value)).join() !== strip(placeholders(source)).join()
    })
    return { missing, unknown, badPlaceholders }
}
