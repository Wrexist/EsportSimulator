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
 * In a component, useLocale() (lib/use-locale.ts) re-renders it when the
 * language changes.
 */

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

/** The locale for Intl date and list formatting (English keeps the US month-day order the game always used). */
export function intlLocale(): string {
    return currentLocale === "en" ? "en-US" : currentLocale
}

/** "A, B and C" in the active language (English keeps the game's no-serial-comma style). */
export function listJoin(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? ""
    if (currentLocale === "en") return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
    return new Intl.ListFormat(intlLocale(), { type: "conjunction" }).format(items)
}

/** "1st", "1.", "1er", "1-е": a position in a table, in the active language. */
export function ordinalLabel(n: number): string {
    switch (currentLocale) {
        case "de": case "pl": return `${n}.`
        case "es": return `${n}.º`
        case "pt-BR": return `${n}º`
        case "fr": return n === 1 ? "1er" : `${n}e`
        case "ru": return `${n}-е`
        default: {
            const s = ["th", "st", "nd", "rd"], v = n % 100
            return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
        }
    }
}

/** Locales with a complete dictionary. */
export function getAvailableLocales(): string[] {
    return Object.keys(translations).filter(locale => getLocaleCompleteness(locale).complete)
}

/** Called on every language change; returns the unsubscribe. */
export function subscribeLocale(fn: () => void): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
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
 * A translatable line kept in a save: the key and its values, so the text is
 * shown in whatever language is active when it is read. `count` picks the
 * plural form (tn).
 */
export interface TextRef {
    key: string
    /** Values; a nested TextRef is shown in the same language (a division, a head-to-head line). */
    params?: Record<string, TextParam>
    count?: number
}
export type TextParam = string | number | TextRef

/** Key of a TextRef that shows `count` as an ordinal in the active language ("3rd", "3.", "3e"). */
export const ORDINAL_REF = "@ordinal"
/** Key of a TextRef that shows `count` as a number with the language's digit grouping ("2,000", "2.000"). */
export const NUMBER_REF = "@number"
/** Key of a TextRef that joins its params' values as a list ("A, B and C") in the active language. */
export const LIST_REF = "@list"
/** Key of a TextRef whose `text` param is English stored by older code: shown through lib/stored-text when loaded. */
export const STORED_REF = "@stored"
let storedResolver: ((english: string) => string) | null = null
/** lib/stored-text registers itself here (i18n cannot import it: it imports i18n). */
export function setStoredTextResolver(fn: (english: string) => string): void {
    storedResolver = fn
}
/** Key of a TextRef that joins its params' values (but `sep`) with `sep`: a paragraph built from parts. */
export const JOIN_REF = "@join"
/** Key of a TextRef whose `iso` param is a UTC date, shown short with the weekday ("Sun, Jan 4") in the active language. */
export const DATE_REF = "@date"

export function isTextRef(v: unknown): v is TextRef {
    return !!v && typeof v === "object" && typeof (v as TextRef).key === "string"
}

/** A TextRef in the active language. */
export function tRef(ref: TextRef): string {
    if (ref.key === ORDINAL_REF) return ordinalLabel(ref.count ?? 0)
    if (ref.key === NUMBER_REF) return (ref.count ?? 0).toLocaleString(intlLocale())
    if (ref.key === STORED_REF) {
        const english = String(ref.params?.text ?? "")
        return storedResolver && currentLocale !== "en" ? storedResolver(english) : english
    }
    if (ref.key === JOIN_REF) {
        const { sep, ...parts } = ref.params ?? {}
        return Object.values(parts).map(v => (isTextRef(v) ? tRef(v) : String(v))).join(typeof sep === "string" ? sep : " ")
    }
    if (ref.key === DATE_REF) {
        const date = new Date(String(ref.params?.iso ?? ""))
        if (Number.isNaN(date.getTime())) return ""
        return date.toLocaleDateString(intlLocale(), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    }
    if (ref.key === LIST_REF) return listJoin(Object.values(ref.params ?? {}).map(v => (isTextRef(v) ? tRef(v) : String(v))))
    let params: Record<string, string | number> | undefined
    if (ref.params) {
        params = {}
        for (const [k, v] of Object.entries(ref.params)) params[k] = isTextRef(v) ? tRef(v) : v
    }
    return ref.count !== undefined ? tn(ref.key, ref.count, params) : t(ref.key, params)
}

/** A TextRef in English, for the plain-text copy a save keeps next to it (logs, older readers). */
export function tRefEn(ref: TextRef): string {
    const was = currentLocale
    currentLocale = "en"
    try {
        return tRef(ref)
    } finally {
        currentLocale = was
    }
}

/**
 * Short-lived messages (store results, toasts) stay plain English strings so
 * callers and tests keep working. `liveText` returns that English and
 * remembers its TextRef, so the screen that shows it can call storedText()
 * and get the active language. Bounded: only recent messages are needed.
 */
const LIVE_TEXT = new Map<string, TextRef>()
const LIVE_TEXT_MAX = 200
export function liveText(ref: TextRef): string {
    const english = tRefEn(ref)
    LIVE_TEXT.delete(english)
    LIVE_TEXT.set(english, ref)
    if (LIVE_TEXT.size > LIVE_TEXT_MAX) LIVE_TEXT.delete(LIVE_TEXT.keys().next().value as string)
    return english
}
/** The TextRef a recent `liveText` message came from, if any. */
export function liveTextRef(english: string): TextRef | undefined {
    return LIVE_TEXT.get(english)
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
/** Styled-part tags (<kbd>…</kbd>, see lib/trans.tsx) a translation must keep. */
const tags = (text: string) => [...text.matchAll(/<([a-z][a-z0-9]*)>/g)].map(m => m[1]).sort().join()

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
        return strip(placeholders(value)).join() !== strip(placeholders(source)).join() || tags(value) !== tags(source)
    })
    return { missing, unknown, badPlaceholders }
}
