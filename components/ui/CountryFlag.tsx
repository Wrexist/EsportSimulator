"use client"

import React from "react"
import { Flag, type FlagProps } from "@/src/components/ui/Flag"

/**
 * Backwards-compatible alias for the canonical `Flag` primitive.
 * New code should import `Flag` from `@/src/components/ui/Flag` directly.
 */
interface CountryFlagProps {
    country: string
    className?: string
    showName?: boolean
    shortName?: boolean
    size?: number
}

export function CountryFlag({ country, className, showName = false, size = 20 }: CountryFlagProps) {
    return <Flag code={country} className={className} showName={showName} size={size} />
}

export type { FlagProps }
