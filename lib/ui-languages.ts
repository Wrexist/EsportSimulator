/**
 * Languages the game ships. English is built in (locales/en.ts); each other
 * language is public/locales/<code>.json, loaded when the player picks it in
 * Settings. Names are written in their own language.
 */
export const UI_LANGUAGES = [
    { code: "en", name: "English" },
    { code: "de", name: "Deutsch" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "pl", name: "Polski" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "ru", name: "Русский" },
] as const

export type UiLanguage = (typeof UI_LANGUAGES)[number]["code"]

const CODES: readonly string[] = UI_LANGUAGES.map(l => l.code)

/** A stored or picked language code, or English when the game does not ship it. */
export function normalizeUiLanguage(code: unknown): UiLanguage {
    return typeof code === "string" && CODES.includes(code) ? code as UiLanguage : "en"
}
