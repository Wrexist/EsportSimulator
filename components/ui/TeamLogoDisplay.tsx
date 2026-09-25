"use client"

import { cn } from "@/lib/utils"
import Image from "next/image"
import { useState } from "react"
import type { TeamBranding } from "@/data/snapshot-types"
import { TeamEmblem } from "@/components/ui/TeamEmblem"
import { defaultBrandingFor } from "@/lib/branding/fallback"
import { teamLogoSources } from "@/lib/team-identity"

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

/** Uploaded image, authored raster/redesign, then a stable vector club emblem. */
export function TeamLogoDisplay({ team, size = 32, className }: TeamLogoDisplayProps) {
    const [failedSources, setFailedSources] = useState<string[]>([])
    const failSource = (source: string) => setFailedSources(previous => previous.includes(source) ? previous : [...previous.slice(-7), source])

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

    const source = teamLogoSources(team).find(candidate => !failedSources.includes(candidate))
    if (source) return <Image src={source} alt={team.name} width={size} height={size}
        className={cn("object-contain shrink-0", className)} unoptimized onError={() => failSource(source)} />

    // Procedural fallback for teams without an individually authored redesign.
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

    return <TeamEmblem name={team.name} shortName={team.shortName}
        seed={team.id || team.name} branding={defaultBrandingFor(team.id || team.name)}
        size={size} className={className} />
}
