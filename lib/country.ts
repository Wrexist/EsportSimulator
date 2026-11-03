/**
 * Country names and codes. Saves store a player's nationality as an English
 * country name or an ISO-2 code; these helpers turn either into a code (for
 * flags) or a name in the active language (for text).
 */
import { getCountryCode, ISO2_ALIASES } from "./asset-utils"
import { intlLocale } from "./i18n"

/**
 * Maps common English country names to ISO-2 codes. Used when the caller
 * passes a name (e.g., "Sweden") instead of a code.
 */
export const NAME_TO_ISO2: Record<string, string> = {
  Sweden: "se", France: "fr", Germany: "de", Russia: "ru", Ukraine: "ua",
  Poland: "pl", Denmark: "dk", USA: "us", "United States": "us", Brazil: "br",
  Canada: "ca", China: "cn", Australia: "au", Norway: "no", Finland: "fi",
  "United Kingdom": "gb", UK: "gb", Turkey: "tr", Kazakhstan: "kz", Spain: "es",
  Portugal: "pt", Argentina: "ar", Slovakia: "sk", "Czech Republic": "cz",
  Hungary: "hu", Bulgaria: "bg", Romania: "ro", Serbia: "rs",
  "Bosnia and Herzegovina": "ba", Croatia: "hr", Montenegro: "me",
  Macedonia: "mk", "North Macedonia": "mk", Estonia: "ee", Latvia: "lv",
  Lithuania: "lt", Netherlands: "nl", Belgium: "be", Italy: "it",
  Switzerland: "ch", Austria: "at", Israel: "il", Jordan: "jo", Mongolia: "mn",
  "South Africa": "za", "New Zealand": "nz", Kosovo: "xk", Europe: "eu",
  NA: "us", "North America": "us",
  // Tournament / club regions (rendered as labelled glyphs below)
  ASIA: "asia", INTERNATIONAL: "int", WORLD: "int", MENA: "mena", CIS: "cis",
  OCE: "oce", OCEANIA: "oce",
}

/** ISO-2 code ("se") for a code or a common English country name, or null. */
export function resolveCountryCode(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 2 && /^[a-zA-Z]{2}$/.test(trimmed)) {
    const code = trimmed.toLowerCase()
    return ISO2_ALIASES[code] ?? code
  }
  return NAME_TO_ISO2[trimmed] ?? getCountryCode(trimmed) ?? NAME_TO_ISO2[trimmed.split(" ")[0]] ?? null
}

/** Regions stored where a country can be; shown as stored. */
const REGIONS = new Set(["NA", "EU", "SA", "NORTH AMERICA", "SOUTH AMERICA", "EUROPE", "ASIA", "INTERNATIONAL", "WORLD", "INT", "MENA", "CIS", "OCE", "OCEANIA", "UN"])

const displayNames = new Map<string, Intl.DisplayNames | null>()

/**
 * A nationality in the active language ("Russia" -> "Rusia" in Spanish).
 * Regions and anything unrecognised are shown as stored.
 */
export function countryName(raw: string | null | undefined): string {
    const stored = String(raw ?? "").trim()
    if (!stored) return ""
    const locale = intlLocale()
    if (locale === "en-US" || REGIONS.has(stored.toUpperCase())) return stored
    const code = resolveCountryCode(stored)
    if (!code || code.length !== 2 || code === "eu" || code === "xk") return stored
    if (!displayNames.has(locale)) {
        try { displayNames.set(locale, new Intl.DisplayNames([locale], { type: "region" })) } catch { displayNames.set(locale, null) }
    }
    try {
        const name = displayNames.get(locale)?.of(code.toUpperCase())
        return name && name !== code.toUpperCase() ? name : stored
    } catch {
        return stored
    }
}
