"use client"

/**
 * Lightweight i18n (internationalization) system
 * Provides translation infrastructure for future multi-language support.
 * Currently ships with English only.
 *
 * Usage:
 *   import { t } from '@/lib/i18n'
 *   t('nav.dashboard')  // "Dashboard"
 *   t('match.round', { n: 5 })  // "Round 5"
 */

type TranslationDict = Record<string, string>

const translations: Record<string, TranslationDict> = {
    en: {
        // Navigation
        "nav.dashboard": "Dashboard",
        "nav.squad": "Squad",
        "nav.matches": "Matches",
        "nav.training": "Training",
        "nav.transfers": "Transfers",
        "nav.tournaments": "Tournaments",
        "nav.schedule": "Schedule",
        "nav.finances": "Finances",
        "nav.staff": "Staff",
        "nav.equipment": "Equipment",
        "nav.scouting": "Scouting",
        "nav.stats": "Statistics",
        "nav.rankings": "Rankings",
        "nav.settings": "Settings",

        // Common
        "common.save": "Save",
        "common.load": "Load",
        "common.cancel": "Cancel",
        "common.confirm": "Confirm",
        "common.back": "Back",
        "common.next": "Next",
        "common.close": "Close",
        "common.search": "Search",
        "common.filter": "Filter",
        "common.yes": "Yes",
        "common.no": "No",
        "common.ok": "OK",

        // Game
        "game.newGame": "New Game",
        "game.loadGame": "Load Game",
        "game.mainMenu": "Main Menu",
        "game.advanceWeek": "Advance Week",
        "game.saveGame": "Save Game",

        // Match
        "match.live": "LIVE",
        "match.round": "Round {{n}}",
        "match.halftime": "Half Time",
        "match.overtime": "Overtime",
        "match.finished": "Match Finished",
        "match.victory": "Victory!",
        "match.defeat": "Defeat",

        // Settings
        "settings.title": "Settings & Tools",
        "settings.display": "Display",
        "settings.audio": "Audio",
        "settings.game": "Game",
        "settings.soundEffects": "UI Sound Effects",
        "settings.masterVolume": "Master Volume",
        "settings.musicVolume": "Music Volume",
        "settings.autoSave": "Auto-Save",
        "settings.gameSpeed": "Game Speed",
        "settings.notifications": "Notifications",

        // Achievements
        "achievements.title": "Achievements",
        "achievements.unlocked": "Unlocked",
        "achievements.locked": "Locked",
        "achievements.progress": "Career Progress",
    }
}

let currentLocale = "en"

/**
 * Set the active locale
 */
export function setLocale(locale: string) {
    if (translations[locale]) {
        currentLocale = locale
    }
}

/**
 * Get the active locale
 */
export function getLocale(): string {
    return currentLocale
}

/**
 * Get available locales
 */
export function getAvailableLocales(): string[] {
    return Object.keys(translations)
}

/**
 * Translate a key with optional interpolation
 * @param key - Translation key (e.g., "nav.dashboard")
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

    // Interpolate {{param}} placeholders
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            value = value.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v))
        }
    }

    return value
}

/**
 * Register a new locale with translations
 * Call this to add support for a new language
 */
export function registerLocale(locale: string, dict: TranslationDict) {
    translations[locale] = { ...translations.en, ...dict }
}
