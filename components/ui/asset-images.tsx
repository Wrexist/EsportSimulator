"use client";

import { useState } from "react";
import Image from "next/image";
import { getPlayerImageUrl, getFlagUrl, PLACEHOLDERS, getTeamLogoUrl } from "@/lib/asset-utils";
import { cn } from "@/lib/utils";
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay";

interface PlayerImageProps {
    playerName: string;
    teamName: string;
    country?: string;
    size?: number;
    className?: string;
    showFlag?: boolean;
}

/**
 * Player image component with automatic fallback to placeholder
 */
export function PlayerImage({
    playerName,
    teamName,
    country,
    size = 48,
    className,
    showFlag = false,
}: PlayerImageProps) {
    const [imgError, setImgError] = useState(false);
    const imageSrc = imgError
        ? PLACEHOLDERS.player
        : getPlayerImageUrl(playerName, teamName);
    const flagUrl = country ? getFlagUrl(country) : null;

    return (
        <div className={cn("relative", className)} style={{ width: size, height: size }}>
            <Image
                src={imageSrc}
                alt={playerName}
                width={size}
                height={size}
                className="rounded-full object-cover"
                onError={() => setImgError(true)}
                unoptimized
            />
            {showFlag && flagUrl && (
                <Image
                    src={flagUrl}
                    alt={country || ""}
                    width={16}
                    height={12}
                    className="absolute -bottom-1 -right-1 rounded-sm border border-white/20"
                    unoptimized
                />
            )}
        </div>
    );
}

interface TeamLogoProps {
    teamName: string;
    size?: number;
    className?: string;
}

/**
 * Team logo component with automatic fallback
 */
export function TeamLogo({
    teamName,
    size = 32,
    className,
}: TeamLogoProps) {
    const [imgError, setImgError] = useState(false);

    // Try different extensions
    const sanitize = (name: string) =>
        name.toLowerCase().replace(/[^a-z0-9\-_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

    const teamSlug = sanitize(teamName);
    const logoPath = imgError
        ? PLACEHOLDERS.logo
        : `/assets/teams/${teamSlug}/logo.webp`;

    return (
        <Image
            src={logoPath}
            alt={teamName}
            width={size}
            height={size}
            className={cn("object-contain", className)}
            onError={() => setImgError(true)}
            unoptimized
        />
    );
}

interface TeamLogoImageProps {
    src?: string | null;
    alt: string;
    size?: number;
    className?: string;
    team?: {
        id?: string;
        name: string;
        shortName?: string;
        logoPath?: string;
        customTeamData?: {
            logoData?: string;
            primaryColor: string;
            secondaryColor: string;
            logoIndex: number;
        };
    } | null;
}

/**
 * Simple team logo component that takes a direct src path
 * Supports custom teams via optional team prop (renders generated shield logo)
 * Automatically falls back to team_placeholder.png on error
 */
export function TeamLogoImage({
    src,
    alt,
    size = 32,
    className,
    team,
}: TeamLogoImageProps) {
    const [imgError, setImgError] = useState(false);

    // If team object provided and it's a custom team, use TeamLogoDisplay
    if (team?.customTeamData) {
        return <TeamLogoDisplay team={team} size={size} className={className} />;
    }

    const imageSrc = (!src || imgError) ? PLACEHOLDERS.logo : src;

    return (
        <Image
            src={imageSrc}
            alt={alt}
            width={size}
            height={size}
            className={cn("object-contain", className)}
            onError={() => setImgError(true)}
            unoptimized
        />
    );
}

interface CountryFlagProps {
    country: string;
    size?: "sm" | "md" | "lg";
    className?: string;
}

/**
 * Country flag component
 */
export function CountryFlag({
    country,
    size = "sm",
    className,
}: CountryFlagProps) {
    const flagUrl = getFlagUrl(country);
    const sizes = { sm: { w: 16, h: 12 }, md: { w: 24, h: 18 }, lg: { w: 32, h: 24 } };
    const { w, h } = sizes[size];

    if (!flagUrl) {
        // Return emoji fallback
        return <span className={className}>🏳️</span>;
    }

    return (
        <Image
            src={flagUrl}
            alt={country}
            width={w}
            height={h}
            className={cn("inline-block rounded-sm", className)}
            unoptimized
        />
    );
}

interface PlayerPortraitProps {
    src?: string | null;
    alt: string;
    size?: number;
    className?: string;
    fill?: boolean;
}

/**
 * Simple player portrait component that takes a direct src path
 * Automatically falls back to player_placeholder.png on error
 */
export function PlayerPortrait({
    src,
    alt,
    size = 48,
    className,
    fill = false,
}: PlayerPortraitProps) {
    const [imgError, setImgError] = useState(false);
    const imageSrc = (!src || imgError) ? PLACEHOLDERS.player : src;

    if (fill) {
        return (
            <Image
                src={imageSrc}
                alt={alt}
                fill
                className={cn("object-cover", className)}
                onError={() => setImgError(true)}
                unoptimized
            />
        );
    }

    return (
        <Image
            src={imageSrc}
            alt={alt}
            width={size}
            height={size}
            className={cn("object-cover", className)}
            onError={() => setImgError(true)}
            unoptimized
        />
    );
}

interface StaffPortraitProps {
    src?: string | null;
    alt: string;
    size?: number;
    className?: string;
}

/**
 * Simple staff portrait component that takes a direct src path
 * Automatically falls back to staff_placeholder.png on error
 */
export function StaffPortrait({
    src,
    alt,
    size = 48,
    className,
}: StaffPortraitProps) {
    const [imgError, setImgError] = useState(false);
    const imageSrc = (!src || imgError) ? PLACEHOLDERS.staff : src;

    return (
        <Image
            src={imageSrc}
            alt={alt}
            width={size}
            height={size}
            className={cn("object-cover", className)}
            onError={() => setImgError(true)}
            unoptimized
        />
    );
}
