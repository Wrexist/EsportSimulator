"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { getPlayerImageUrl, getFlagUrl, PLACEHOLDERS } from "@/lib/asset-utils";
import { cn } from "@/lib/utils";
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay";
import { PlayerPortraitFrame, type PlayerPortraitVariant } from "@/components/ui/player-portrait-frame";
import { renderPortraitSVG } from "@/lib/safe-branding/portrait-generator";

/**
 * Build an inline data-URI for the procedural portrait of `seed`. Same hash →
 * same person as the live 3D portrait (both consume derivePortraitFeatures),
 * but this is a pure SVG string — no WebGL context, no network — so it's safe
 * to render hundreds at once in tables and grids.
 */
function proceduralPortraitDataUri(seed: string, label: string): string {
    return `data:image/svg+xml,${encodeURIComponent(renderPortraitSVG(seed, label))}`;
}

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
 * Automatically falls back to team_placeholder.webp on error
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
    variant?: PlayerPortraitVariant;
    teamColor?: string;
    imageClassName?: string;
    /**
     * Stable per-player key (use `player.id`). When the portrait would
     * otherwise fall back to the generic placeholder silhouette — i.e. the
     * player has no real photo — a deterministic procedural face is generated
     * from this seed instead. Matches the face the 3D portrait would render.
     * Omit it to keep the plain placeholder behaviour.
     */
    seed?: string;
}

/**
 * Simple player portrait component that takes a direct src path.
 * Resolution order: real photo (.png) → baked .svg sibling → procedural
 * portrait from `seed` (if provided) → static placeholder.
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
    // If the snapshot points to a baked .png and it fails to load (404, network),
    // fall back to the procedural .svg at the same path. Only THEN fall back to
    // the placeholder / generated portrait.
    const [stage, setStage] = useState<"primary" | "svg" | "placeholder">("primary");

    const svgFallbackSrc =
        typeof src === "string" && src.endsWith(".png")
            ? src.replace(/\.png$/, ".svg")
            : null;

    const resolvedSrc =
        stage === "primary"
            ? src
            : stage === "svg" && svgFallbackSrc
                ? svgFallbackSrc
                : PLACEHOLDERS.player;

    const onError = () => {
        if (stage === "primary" && svgFallbackSrc) setStage("svg");
        else setStage("placeholder");
    };

    // When there's no real photo (missing src, the static placeholder, or a
    // failed load), render a generated procedural portrait from `seed` instead
    // of the generic silhouette. Memoized so the SVG string is built once.
    const wouldShowPlaceholder =
        !src || src === PLACEHOLDERS.player || stage === "placeholder";
    const proceduralSrc = useMemo(
        () => (wouldShowPlaceholder && seed ? proceduralPortraitDataUri(seed, alt) : null),
        [wouldShowPlaceholder, seed, alt],
    );

    if (fill) {
        const fillSrc = proceduralSrc || resolvedSrc || PLACEHOLDERS.player;
        return (
            <Image
                key={fillSrc}
                src={fillSrc}
                alt={alt}
                fill
                className={cn("object-cover", className)}
                onError={proceduralSrc ? undefined : onError}
                unoptimized
            />
        );
    }

    const framedSrc =
        proceduralSrc ?? (!src || stage === "placeholder" ? null : resolvedSrc);

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
            onImageError={proceduralSrc ? undefined : onError}
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
