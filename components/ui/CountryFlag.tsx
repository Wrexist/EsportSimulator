"use client"

import React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

// Mapping of country names (as they appear in our data) to ISO 2-letter codes
const COUNTRY_CODES: Record<string, string> = {
    "Sweden": "se",
    "France": "fr",
    "Germany": "de",
    "Russia": "ru",
    "Ukraine": "ua",
    "Poland": "pl",
    "Denmark": "dk",
    "USA": "us",
    "United States": "us",
    "Brazil": "br",
    "Canada": "ca",
    "China": "cn",
    "Australia": "au",
    "Norway": "no",
    "Finland": "fi",
    "United Kingdom": "gb",
    "UK": "gb",
    "Turkey": "tr",
    "Kazakhstan": "kz",
    "Spain": "es",
    "Portugal": "pt",
    "Argentina": "ar",
    "Slovakia": "sk",
    "Czech Republic": "cz",
    "Hungary": "hu",
    "Bulgaria": "bg",
    "Romania": "ro",
    "Serbia": "rs",
    "Bosnia and Herzegovina": "ba",
    "Croatia": "hr",
    "Montenegro": "me",
    "Macedonia": "mk",
    "North Macedonia": "mk",
    "Estonia": "ee",
    "Latvia": "lv",
    "Lithuania": "lt",
    "Netherlands": "nl",
    "Belgium": "be",
    "Italy": "it",
    "Switzerland": "ch",
    "Austria": "at",
    "Israel": "il",
    "Jordan": "jo",
    "Mongolia": "mn",
    "South Africa": "za",
    "New Zealand": "nz",
    "Kosovo": "xk",
    "Europe": "eu",
    "NA": "us",
    "North America": "us"
}

interface CountryFlagProps {
    country: string
    className?: string
    showName?: boolean
    shortName?: boolean // If true, shows generic code or short version if flag fails? mostly just for flag styling
    size?: number
}

export function CountryFlag({ country, className, showName = false, size = 20 }: CountryFlagProps) {
    // Ensure size is a valid number
    const safeSize = typeof size === 'number' && !isNaN(size) ? size : 20

    if (!country) {
        return (
            <div className={cn("flex items-center gap-2", className)}>
                <span className="text-xs text-muted-foreground font-bold">?</span>
                {showName && <span className="text-xs text-muted-foreground">Unknown</span>}
            </div>
        )
    }

    // If country is already a 2-letter code (e.g. from getTeamFlag), use it directly
    // Otherwise look up in map
    // Check map first to allow overrides for things like "NA" (which would be Namibia "na" otherwise)
    const code = COUNTRY_CODES[country] ||
        (country.length === 2 ? country.toLowerCase() : COUNTRY_CODES[country.split(" ")[0]])

    // If no code found, fallback to text
    if (!code) {
        return (
            <div className={cn("flex items-center gap-2", className)}>
                <span className="text-xs text-muted-foreground font-bold">🏳️</span>
                {showName && <span className="text-xs text-muted-foreground">{country}</span>}
            </div>
        )
    }

    return (
        <div className={cn("flex items-center gap-2", className)} title={country}>
            <div
                className={cn("relative overflow-hidden rounded-[2px] shadow-sm bg-white/5", className)}
                style={{ width: safeSize, height: Math.round(safeSize * 0.75) }}
            >
                <Image
                    src={`/assets/flags/${code.toLowerCase()}.svg`}
                    alt={country}
                    fill
                    className="object-cover"
                    sizes={`${safeSize}px`}
                    unoptimized
                />
            </div>
            {showName && <span className="text-xs font-semibold text-white/80">{country}</span>}
        </div>
    )
}
