"use client";

import { useState } from "react";
import Image from "next/image";
import { getPlayerImageUrl, getFlagUrl, PLACEHOLDERS } from "@/lib/asset-utils";
import { cn } from "@/lib/utils";
import { findTeamIdentity } from "@/lib/team-identity"
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay";
import { PlayerPortraitFrame, type PlayerPortraitVariant } from "@/components/ui/player-portrait-frame";
import { playerPortraitSource } from "@/lib/player-portrait-source";

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
        : playerPortraitSource(getPlayerImageUrl(playerName, teamName), `${teamName}:${playerName}`)!;
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
    return <TeamLogoDisplay team={findTeamIdentity(teamName) || { name: teamName }} size={size} className={className} />;
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
        branding?: {
            primaryColor: string;
            secondaryColor: string;
            accentColor: string;
            logoStyle: "monogram" | "mascot" | "emblem" | "wordmark";
        };
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
 * Automatically falls back to team_placeholder.webp on error
 */
export function TeamLogoImage({
    src,
    alt,
    size = 32,
    className,
    team,
}: TeamLogoImageProps) {
    const identity = team || findTeamIdentity(alt) || { name: alt };
    return <TeamLogoDisplay team={team || { ...identity, ...(src ? { logoPath: src } : {}) }} size={size} className={className} />;
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
    variant?: PlayerPortraitVariant;
    teamColor?: string;
    imageClassName?: string;
    /**
     * Stable per-player key (use `player.id`). When the portrait would
     * otherwise fall back to the generic placeholder silhouette — i.e. the
     * player has no real photo — a baked portrait is selected
     * from this seed instead. Every player screen must pass the same player ID.
     * Omit it to keep the plain placeholder behaviour.
     */
    seed?: string;
}

/**
 * Simple player portrait component that takes a direct src path.
 * Resolution order: real baked photo (.png) → on load failure, a pooled baked
 * portrait picked from `seed` → static placeholder. Players without a real
 * photo (placeholder src, or a flat legend `.svg`) also resolve to a pooled
 * baked portrait so the whole game uses the same 3D/baked portrait style — no
 * flat 2D procedural avatars.
 */
export function PlayerPortrait({
    src,
    alt,
    size = 48,
    className,
    fill = false,
    variant = "avatar",
    teamColor,
    imageClassName,
    seed,
}: PlayerPortraitProps) {
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const resolvedSrc = playerPortraitSource(src, seed, failedSource);
    const onError = () => setFailedSource(resolvedSrc);
    const usingOriginal = !!resolvedSrc && resolvedSrc !== failedSource;

    if (fill) {
        const fillSrc = resolvedSrc || PLACEHOLDERS.player;
        return (
            <Image
                key={fillSrc}
                src={fillSrc}
                alt={alt}
                fill
                className={cn("object-cover", className)}
                onError={usingOriginal ? onError : undefined}
                unoptimized
            />
        );
    }

    const framedSrc = resolvedSrc;

    return (
        <PlayerPortraitFrame
            key={framedSrc || "ph"}
            src={framedSrc}
            alt={alt}
            size={size}
            variant={variant}
            teamColor={teamColor}
            className={className}
            imageClassName={imageClassName}
            onImageError={usingOriginal ? onError : undefined}
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
 * Automatically falls back to staff_placeholder.webp on error
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
