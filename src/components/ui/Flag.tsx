"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Maps common English country names to ISO-2 codes. Used when the caller
 * passes a name (e.g., "Sweden") instead of a code.
 */
const NAME_TO_ISO2: Record<string, string> = {
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
}

export interface FlagProps {
  /** ISO 3166-1 alpha-2 country code (case-insensitive), or an English country name. */
  code: string
  /** Pixel width of the flag; height is auto (3:4 ratio). */
  size?: number
  /** Show the country name next to the flag. */
  showName?: boolean
  className?: string
}

function resolveCode(raw: string): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 2 && /^[a-zA-Z]{2}$/.test(trimmed)) return trimmed.toLowerCase()
  return NAME_TO_ISO2[trimmed] ?? NAME_TO_ISO2[trimmed.split(" ")[0]] ?? null
}

/**
 * Flag — renders a country flag from the local SVG set under /public/assets/flags/.
 * Falls back to a neutral flag glyph when the code is unknown or missing.
 *
 * Accepts either an ISO-2 code ("se") or a common country name ("Sweden").
 */
export function Flag({ code, size = 20, showName = false, className }: FlagProps) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 20
  const iso2 = resolveCode(code)

  if (!iso2) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-xs text-muted-foreground font-bold" aria-hidden>🏳️</span>
        {showName && <span className="text-xs text-muted-foreground">{code || "Unknown"}</span>}
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2", className)} title={code}>
      <div
        className="relative overflow-hidden rounded-[2px] shadow-sm bg-white/5 shrink-0"
        style={{ width: safeSize, height: Math.round(safeSize * 0.75) }}
      >
        <Image
          src={`/assets/flags/${iso2}.svg`}
          alt={code}
          fill
          className="object-cover"
          sizes={`${safeSize}px`}
          unoptimized
        />
      </div>
      {showName && <span className="text-xs font-semibold text-white/80">{code}</span>}
    </div>
  )
}
