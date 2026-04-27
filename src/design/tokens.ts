/**
 * Design Tokens — single source of truth for UI primitives.
 *
 * Consume these tokens via Tailwind utilities (wired in tailwind.config.ts).
 * Do not reference raw hex values elsewhere in the codebase.
 */

// ────────────────────────────────────────────────────────────────────────────
// Color primitives (HSL strings, unprefixed — for `hsl(var(...))` style use)
// ────────────────────────────────────────────────────────────────────────────

const hue = {
  slate950: '222 47% 4%',
  slate900: '222 39% 7%',
  slate850: '222 30% 10%',
  slate800: '222 24% 14%',
  slate700: '222 18% 22%',
  slate500: '222 10% 50%',
  slate300: '222 12% 72%',
  slate100: '222 20% 94%',
  white: '0 0% 100%',

  brand: '190 95% 55%',      // cyan / electric teal
  brandDeep: '200 100% 45%',
  accent: '280 85% 65%',     // magenta / purple
  warning: '38 95% 58%',
  danger: '356 78% 58%',
  success: '150 70% 48%',
  info: '210 90% 60%',

  // Esports-specific
  win: '150 70% 48%',
  loss: '356 78% 58%',
  draw: '38 85% 55%',

  // Tier hues (ascending prestige)
  tierRookie: '210 15% 60%',
  tierAmateur: '150 55% 55%',
  tierPro: '210 90% 60%',
  tierElite: '280 80% 65%',
  tierLegendary: '40 95% 55%',
} as const

// ────────────────────────────────────────────────────────────────────────────
// Semantic color tokens
// ────────────────────────────────────────────────────────────────────────────

export const colors = {
  // Surfaces
  'bg-app': `hsl(${hue.slate950})`,
  'bg-surface': `hsl(${hue.slate900})`,
  'bg-raised': `hsl(${hue.slate850})`,
  'bg-overlay': `hsl(${hue.slate800})`,
  'bg-muted': `hsl(${hue.slate700})`,

  // Text
  'text-primary': `hsl(${hue.slate100})`,
  'text-secondary': `hsl(${hue.slate300})`,
  'text-muted': `hsl(${hue.slate500})`,
  'text-inverse': `hsl(${hue.slate950})`,

  // Borders
  'border-subtle': `hsl(${hue.slate800})`,
  'border-default': `hsl(${hue.slate700})`,
  'border-strong': `hsl(${hue.slate500})`,

  // Accents
  'accent-brand': `hsl(${hue.brand})`,
  'accent-brand-deep': `hsl(${hue.brandDeep})`,
  'accent-secondary': `hsl(${hue.accent})`,

  // Feedback
  'status-success': `hsl(${hue.success})`,
  'status-warning': `hsl(${hue.warning})`,
  'status-danger': `hsl(${hue.danger})`,
  'status-info': `hsl(${hue.info})`,

  // Esports — match outcome
  'match-win': `hsl(${hue.win})`,
  'match-loss': `hsl(${hue.loss})`,
  'match-draw': `hsl(${hue.draw})`,

  // Esports — player / team prestige tiers
  'tier-rookie': `hsl(${hue.tierRookie})`,
  'tier-amateur': `hsl(${hue.tierAmateur})`,
  'tier-pro': `hsl(${hue.tierPro})`,
  'tier-elite': `hsl(${hue.tierElite})`,
  'tier-legendary': `hsl(${hue.tierLegendary})`,

  // Game-type palette (single-game today; keyed for future expansion)
  'game-tactical-fps': `hsl(${hue.warning})`,
} as const

// ────────────────────────────────────────────────────────────────────────────
// Spacing — 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 (px)
// ────────────────────────────────────────────────────────────────────────────

export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  6: '24px',
  8: '32px',
  12: '48px',
  16: '64px',
} as const

// ────────────────────────────────────────────────────────────────────────────
// Radius
// ────────────────────────────────────────────────────────────────────────────

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '20px',
  full: '9999px',
} as const

// ────────────────────────────────────────────────────────────────────────────
// Typography scale
// ────────────────────────────────────────────────────────────────────────────

type FontSizeEntry = [string, { lineHeight: string; letterSpacing?: string; fontWeight?: string }]

export const fontSize: Record<string, FontSizeEntry> = {
  xs: ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
  sm: ['14px', { lineHeight: '20px' }],
  base: ['16px', { lineHeight: '24px' }],
  lg: ['18px', { lineHeight: '28px' }],
  xl: ['20px', { lineHeight: '28px' }],
  '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em' }],
  '3xl': ['30px', { lineHeight: '36px', letterSpacing: '-0.015em' }],
  '4xl': ['36px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
  '5xl': ['48px', { lineHeight: '52px', letterSpacing: '-0.025em', fontWeight: '600' }],
  display: ['64px', { lineHeight: '68px', letterSpacing: '-0.03em', fontWeight: '700' }],
}

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const

export const fontFamily: Record<string, string[]> = {
  sans: ['var(--font-archivo)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
}

// ────────────────────────────────────────────────────────────────────────────
// Elevation (box-shadow) — elev-0 through elev-3
// ────────────────────────────────────────────────────────────────────────────

export const elevation = {
  'elev-0': 'none',
  'elev-1': '0 1px 2px 0 rgb(0 0 0 / 0.35), 0 1px 3px 0 rgb(0 0 0 / 0.25)',
  'elev-2': '0 4px 8px -2px rgb(0 0 0 / 0.45), 0 2px 4px -2px rgb(0 0 0 / 0.30)',
  'elev-3': '0 16px 32px -8px rgb(0 0 0 / 0.55), 0 8px 16px -8px rgb(0 0 0 / 0.35)',
} as const

// ────────────────────────────────────────────────────────────────────────────
// Tailwind `extend` export — wired from tailwind.config.ts
// ────────────────────────────────────────────────────────────────────────────

export const tokens = {
  colors,
  spacing,
  borderRadius: radius,
  fontSize,
  fontWeight,
  fontFamily,
  boxShadow: elevation,
} as const

export type DesignTokens = typeof tokens
