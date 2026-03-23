import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * FNV-1a hash-based deterministic seed from string/number parts.
 * Used for seeding RNG in veto, tactics, and other match-related pages.
 */
export function deterministicSeed(...parts: Array<string | number | undefined | null>): number {
  const payload = parts
    .filter((part): part is string | number => part !== undefined && part !== null)
    .map(String)
    .join("|")

  let hash = 2166136261
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) || 1
}

/**
 * Get custom team colors for styling
 * Returns primary and secondary colors for custom teams, or default blue theme
 */
export function getTeamColors(team: { customTeamData?: { primaryColor?: string; secondaryColor?: string } } | null | undefined): {
  primary: string
  secondary: string
  gradient: string
  textClass: string
} {
  const primary = team?.customTeamData?.primaryColor || '#3B82F6'
  const secondary = team?.customTeamData?.secondaryColor || '#1E40AF'

  return {
    primary,
    secondary,
    gradient: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
    textClass: 'text-white' // Custom colors are always vibrant enough for white text
  }
}
