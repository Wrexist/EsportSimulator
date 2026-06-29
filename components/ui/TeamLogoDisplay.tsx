"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"
import { useState } from "react"
import { PLACEHOLDERS } from "@/lib/asset-utils"
import type { TeamBranding } from "@/data/snapshot-types"
import { TeamEmblem } from "@/components/ui/TeamEmblem"

/** Real hand-made / AI raster logos (.webp/.png/.jpg) win; the flat generated
 *  .svg shields are replaced by the live 3D <TeamEmblem>. */
function isRasterLogo(p?: string): boolean {
    return !!p && /\.(webp|png|jpe?g|gif)$/i.test(p)
}

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
 * Resolution: uploaded image → real raster logo → live 3D procedural emblem
 * (from branding or custom colors) → placeholder. The procedural <TeamEmblem>
 * replaces the old flat 2D .svg shields for every generated team.
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

    // 1. Custom team with an uploaded image.
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

    // 2. A real raster logo (hand-made or AI-generated .webp/.png) — these win.
    if (isRasterLogo(team.logoPath) && !imgError) {
        return (
            <Image
                src={team.logoPath as string}
                alt={team.name}
                width={size}
                height={size}
                className={cn(
                    "object-contain transition-transform duration-300 ease-out",
                    "[filter:drop-shadow(0_2px_4px_rgba(0,0,0,0.35))_drop-shadow(0_0_18px_rgba(255,255,255,0.06))]",
                    className,
                )}
                onError={() => setImgError(true)}
                unoptimized
            />
        )
    }

    // 3. Live 3D procedural emblem from the team's branding (replaces flat .svg).
    if (team.branding?.primaryColor) {
        return (
            <TeamEmblem
                name={team.name}
                shortName={team.shortName}
                branding={team.branding}
                seed={team.id || team.name}
                size={size}
                className={className}
            />
        )
    }

    // 4. Custom color-preset team (no branding object) — emblem from its colors.
    if (team.customTeamData) {
        return (
            <TeamEmblem
                name={team.name}
                shortName={team.shortName}
                branding={{
                    primaryColor: team.customTeamData.primaryColor,
                    secondaryColor: team.customTeamData.secondaryColor,
                    accentColor: "#ffffff",
                    logoStyle: "monogram",
                }}
                seed={team.id || team.name}
                size={size}
                className={className}
            />
        )
    }

    // 5. No branding/colors but has a logo file (incl. legacy .svg) — load it.
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

    // 6. Generic placeholder.
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
