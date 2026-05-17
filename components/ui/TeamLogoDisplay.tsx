"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"
import { useState } from "react"
import { PLACEHOLDERS } from "@/lib/asset-utils"
import { textOnBrand } from "@/lib/branding/fallback"
import type { TeamBranding } from "@/data/snapshot-types"

interface TeamLogoDisplayProps {
    team: {
        id?: string
        name: string
        shortName?: string
        logoPath?: string
        branding?: TeamBranding
        customTeamData?: {
            logoData?: string
            primaryColor: string
            secondaryColor: string
            logoIndex: number
        }
    } | null | undefined
    size?: number
    className?: string
}

/**
 * Universal team logo component.
 * Handles custom teams (uploaded image OR generated shield), standard teams, and fallbacks.
 */
export function TeamLogoDisplay({ team, size = 32, className }: TeamLogoDisplayProps) {
    const [imgError, setImgError] = useState(false)

    if (!team) {
        return (
            <div
                className={cn("rounded-lg bg-white/5 flex items-center justify-center", className)}
                style={{ width: size, height: size }}
            >
                <span className="text-white/30 font-bold" style={{ fontSize: size * 0.4 }}>?</span>
            </div>
        )
    }

    // Case 1: Custom team with uploaded image
    if (team.customTeamData?.logoData) {
        return (
            <img
                src={team.customTeamData.logoData}
                alt={team.name}
                className={cn("object-contain", className)}
                style={{ width: size, height: size }}
            />
        )
    }

    // Case 2: Custom team with color preset (no uploaded image) — render SVG shield
    if (team.customTeamData) {
        const { primaryColor, secondaryColor } = team.customTeamData
        const initials = team.shortName?.slice(0, 2).toUpperCase() || team.name.charAt(0).toUpperCase()
        const gradId = `tld-${team.id || team.name.replace(/\s/g, "")}-${size}`

        return (
            <svg
                viewBox="0 0 100 120"
                width={size}
                height={size}
                className={className}
            >
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={primaryColor} />
                        <stop offset="100%" stopColor={secondaryColor} />
                    </linearGradient>
                </defs>
                <path
                    d="M50 2 L96 24 L96 68 Q96 100 50 118 Q4 100 4 68 L4 24 Z"
                    fill={`url(#${gradId})`}
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth="2"
                />
                <text
                    x="50"
                    y="72"
                    textAnchor="middle"
                    fill="white"
                    fontSize={initials.length > 2 ? "26" : "32"}
                    fontWeight="bold"
                    fontFamily="system-ui, sans-serif"
                    style={{ textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}
                >
                    {initials}
                </text>
            </svg>
        )
    }

    // Case 3: Standard team with logo file
    if (team.logoPath && !imgError) {
        return (
            <Image
                src={team.logoPath}
                alt={team.name}
                width={size}
                height={size}
                className={cn("object-contain", className)}
                onError={() => setImgError(true)}
                unoptimized
            />
        )
    }

    // Case 4: Branded initials fallback — predefined teams that fail to
    // load their SVG still render a recognizable colored chip.
    if ((imgError || !team.logoPath) && team.branding?.primaryColor) {
        const initials = team.shortName?.slice(0, 2).toUpperCase() || team.name.charAt(0).toUpperCase()
        return (
            <div
                className={cn("flex items-center justify-center font-bold rounded", className)}
                style={{
                    width: size,
                    height: size,
                    backgroundColor: team.branding.primaryColor,
                    color: textOnBrand(team.branding.primaryColor),
                    fontSize: size * (initials.length > 2 ? 0.32 : 0.42),
                }}
                aria-label={`${team.name} logo`}
            >
                {initials}
            </div>
        )
    }

    // Case 5: Generic placeholder for un-branded teams
    if (imgError || !team.logoPath) {
        return (
            <Image
                src={PLACEHOLDERS.logo}
                alt={team.name}
                width={size}
                height={size}
                className={cn("object-contain", className)}
                unoptimized
            />
        )
    }

    return null
}
