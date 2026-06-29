"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { getPlayerImageUrl, getFlagUrl, PLACEHOLDERS } from "@/lib/asset-utils";
import { cn } from "@/lib/utils";
import { TeamLogoDisplay } from "@/components/ui/TeamLogoDisplay";
import { PlayerPortraitFrame, type PlayerPortraitVariant } from "@/components/ui/player-portrait-frame";
import { pickPooledPortrait } from "@/lib/safe-branding/portrait-pool";

/**
 * A "photo-less" source is one that should be replaced by a baked portrait:
 * the static placeholder, or a flat procedural SVG (legends ship
 * `/assets/legends/*.svg`). Real player photos are always `.png`.
 */
function isPhotoless(src?: string | null): boolean {
    if (!src) return true;
    if (src === PLACEHOLDERS.player) return true;
    return src.endsWith(".svg") || src.includes("/legends/");
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
    const [imgError, setImgError] = useState(false);

    // If we have enough to render the live 3D emblem (branding or custom colors),
    // delegate to TeamLogoDisplay so generated teams stop showing the flat .svg.
    if (team && (team.customTeamData || team.branding)) {
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
    // A real baked .png can still fail to load (404/network); on error, drop to
    // the pooled baked portrait (if we have a seed) rather than a bare silhouette.
    const [stage, setStage] = useState<"primary" | "placeholder">("primary");

    // Treat placeholder/legend-svg sources as photo-less up front so they never
    // render the old flat 2D avatar.
    const photoless = isPhotoless(src) || stage === "placeholder";

    const onError = () => setStage("placeholder");

    // Pooled baked portrait (same family real players use), chosen deterministically
    // from the seed. Replaces the retired 2D procedural SVG.
    const pooledSrc = useMemo(
        () => (photoless && seed ? pickPooledPortrait(seed) : null),
        [photoless, seed],
    );

    const resolvedSrc = photoless ? (pooledSrc ?? PLACEHOLDERS.player) : (src as string);

    if (fill) {
        const fillSrc = resolvedSrc || PLACEHOLDERS.player;
        return (
            <Image
                key={fillSrc}
                src={fillSrc}
                alt={alt}
                fill
                className={cn("object-cover", className)}
                onError={photoless ? undefined : onError}
                unoptimized
            />
        );
    }

    const framedSrc = photoless ? pooledSrc : (src as string);

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
            onImageError={photoless ? undefined : onError}
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
