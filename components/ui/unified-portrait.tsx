"use client"

import Image from 'next/image'
import { User } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface UnifiedPortraitProps {
    src?: string | null
    alt: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    className?: string
    fallbackType?: 'player' | 'staff' | 'team'
}

const sizeMap = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
}

const fallbackImages = {
    player: '/player_placeholder.png',
    staff: '/staff_placeholder.png',
    team: '/team_placeholder.png'
}

/**
 * Unified Portrait Component
 * Handles all portrait images with consistent fallbacks
 * 
 * @example
 * <UnifiedPortrait src={player.image} alt={player.name} fallbackType="player" />
 */
export function UnifiedPortrait({
    src,
    alt,
    size = 'md',
    className,
    fallbackType = 'player'
}: UnifiedPortraitProps) {
    const [error, setError] = useState(false)
    const [loading, setLoading] = useState(true)

    // Determine which image to show
    const imageSrc = error || !src
        ? fallbackImages[fallbackType]
        : src

    return (
        <div className={cn(
            'relative rounded overflow-hidden bg-white/5 flex items-center justify-center',
            sizeMap[size],
            className
        )}>
            {imageSrc ? (
                <Image
                    src={imageSrc}
                    alt={alt}
                    fill
                    className={cn(
                        'object-cover transition-opacity duration-300',
                        loading ? 'opacity-0' : 'opacity-100'
                    )}
                    onError={() => setError(true)}
                    onLoad={() => setLoading(false)}
                />
            ) : (
                <User className={cn(
                    'text-muted-foreground',
                    size === 'sm' && 'w-4 h-4',
                    size === 'md' && 'w-6 h-6',
                    size === 'lg' && 'w-8 h-8',
                    size === 'xl' && 'w-12 h-12'
                )} />
            )}

            {loading && imageSrc && (
                <div className="absolute inset-0 bg-white/5 animate-pulse" />
            )}
        </div>
    )
}

/**
 * Player Portrait (already exists, update to use UnifiedPortrait)
 */
export function PlayerPortrait({
    portraitPath,
    name,
    size = 'md',
    className
}: {
    portraitPath?: string
    name: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    className?: string
}) {
    return (
        <UnifiedPortrait
            src={portraitPath}
            alt={name}
            size={size}
            fallbackType="player"
            className={className}
        />
    )
}

/**
 * Staff Portrait
 */
export function StaffPortrait({
    portraitPath,
    name,
    size = 'md',
    className
}: {
    portraitPath?: string
    name: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    className?: string
}) {
    return (
        <UnifiedPortrait
            src={portraitPath}
            alt={name}
            size={size}
            fallbackType="staff"
            className={className}
        />
    )
}

/**
 * Team Logo
 */
export function TeamLogo({
    logoPath,
    name,
    size = 'md',
    className
}: {
    logoPath?: string
    name: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    className?: string
}) {
    return (
        <UnifiedPortrait
            src={logoPath}
            alt={name}
            size={size}
            fallbackType="team"
            className={className}
        />
    )
}
