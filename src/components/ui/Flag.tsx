"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { FLAGS_WITHOUT_SVG } from "@/lib/asset-utils"
import { resolveCountryCode as resolveCode, countryName } from "@/lib/country"

/**
 * Regional / aggregate codes that have no corresponding country flag SVG
 * in the local set. Rendered as a label glyph instead of a broken <img>.
 */
const REGION_LABEL: Record<string, string> = {
  un: "INT",
  int: "INT",
  world: "INT",
  eu: "EU",
  na: "NA",
  sa: "SA",
  asia: "AS",
  oce: "OC",
  mena: "ME",
  cis: "CIS",
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

function RegionGlyph({ label, size, className }: { label: string; size: number; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-[2px] bg-hover text-[11px] font-bold uppercase tracking-wider text-ink-2 shrink-0",
        className,
      )}
      style={{ width: size, height: Math.round(size * 0.75) }}
      aria-label={label}
    >
      {label}
    </div>
  )
}

/**
 * Flag — renders a country flag from the local SVG set under
 * /public/assets/flags/. Falls back to a labelled glyph when the code is
 * a regional aggregate ("eu", "un"/"int") or the SVG fails to load.
 *
 * Accepts either an ISO-2 code ("se") or a common country name ("Sweden").
 */
export function Flag({ code, size = 20, showName = false, className }: FlagProps) {
  const safeSize = Number.isFinite(size) && size > 0 ? size : 20
  const iso2 = resolveCode(code)
  const [imgError, setImgError] = useState(false)

  // Unknown input entirely
  if (!iso2) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <RegionGlyph label="?" size={safeSize} />
        {showName && <span className="text-xs text-muted-foreground">{code || "Unknown"}</span>}
      </div>
    )
  }

  // Regional aggregate codes — render as labelled glyph (no SVG exists)
  const regionLabel = REGION_LABEL[iso2]
  if (regionLabel || imgError || FLAGS_WITHOUT_SVG.has(iso2)) {
    return (
      <div className={cn("flex items-center gap-2", className)} title={countryName(code)}>
        <RegionGlyph label={regionLabel ?? iso2.toUpperCase()} size={safeSize} />
        {showName && <span className="text-xs font-semibold text-ink-1">{countryName(code)}</span>}
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2", className)} title={countryName(code)}>
      <div
        className="relative overflow-hidden rounded-[2px] shadow-xs bg-raised shrink-0"
        style={{ width: safeSize, height: Math.round(safeSize * 0.75) }}
      >
        <Image
          src={`/assets/flags/${iso2}.svg`}
          alt={code}
          fill
          className="object-cover"
          sizes={`${safeSize}px`}
          unoptimized
          onError={() => setImgError(true)}
        />
      </div>
      {showName && <span className="text-xs font-semibold text-ink-1">{countryName(code)}</span>}
    </div>
  )
}

