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

  brand: '40 88% 59%',       // trophy gold (#F2B53A)
  brandDeep: '40 100% 68%',  // gold hover (#FFC85C)
  accent: '213 100% 68%',    // CT / info blue (#5AA9FF)
  warning: '23 100% 62%',    // caution / T side (#FF8A3D)
  danger: '352 100% 66%',    // negative (#FF5468)
  success: '151 65% 54%',    // positive (#3DD68C)
  info: '213 100% 68%',

  // Esports-specific
  win: '151 65% 54%',
  loss: '352 100% 66%',
  draw: '216 10% 55%',

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
  'glass-surface': 'rgb(255 255 255 / 0.075)',
  'glass-surface-strong': 'rgb(255 255 255 / 0.12)',
  'glass-surface-muted': 'rgb(255 255 255 / 0.045)',
  'glass-border': 'rgb(255 255 255 / 0.12)',
  'glass-border-strong': 'rgb(255 255 255 / 0.2)',
  'glass-highlight': 'rgb(255 255 255 / 0.42)',
  'glass-shadow': 'rgb(0 0 0 / 0.42)',

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

  // Game-type palette (single-game today: CS2; keyed for future expansion)
  'game-cs2': `hsl(${hue.warning})`,

  // ── Design system v2: "Broadcast Graphite + Trophy Gold" ──────────────
  // Solid surfaces, 1px lines, gold for the one thing that matters on screen
  // (primary action, selection, trophies, 90+ ratings) — keep it under ~5%.
  ink: '#07090C',
  shell: '#0D1015',
  panel: '#12161C',
  raised: '#181D25',
  hover: '#212833',
  line: 'rgb(255 255 255 / 0.07)',
  'line-strong': 'rgb(255 255 255 / 0.14)',
  'ink-1': '#F2F4F7',
  'ink-2': '#AEB6C2',
  'ink-3': '#808A99',
  gold: { DEFAULT: '#F2B53A', hover: '#FFC85C', on: '#15100A' },
  positive: '#3DD68C',
  negative: '#FF5468',
  caution: '#FF8A3D',
  // Not `t`/`ct`: a color named `t` turns `border-t` into a border color.
  'side-ct': '#5AA9FF',
  'side-t': '#FF8A3D',
  rating: { low: '#808A99', mid: '#D5DAE1', good: '#8FE3B5', high: '#3DD68C', elite: '#F2B53A' },
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

// v2: crisp, broadcast-style corners. Tags 2-3px, controls 4px, panels 6-8px,
// heroes and modals 10px — nothing pill-soft except avatars (full).
export const radius = {
  sm: '3px',
  md: '4px',
  lg: '6px',
  xl: '8px',
  '2xl': '10px',
  '3xl': '12px',
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
  // Families are declared in app/fonts.css (self-hosted, SIL OFL).
  sans: ['"Inter Variable"', '"Segoe UI"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  display: ['"Barlow Condensed"', '"Arial Narrow"', '"Segoe UI"', 'sans-serif'],
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
  'glass-soft': '0 1px 0 rgb(255 255 255 / 0.08) inset, 0 18px 45px -28px rgb(0 0 0 / 0.72)',
  'glass-float': '0 1px 0 rgb(255 255 255 / 0.12) inset, 0 26px 70px -34px rgb(0 0 0 / 0.82)',
  /** Restrained highlight for selected nav / focus — not a loud cyan bloom */
  'glass-active': '0 1px 0 rgb(255 255 255 / 0.14) inset, 0 14px 40px -28px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(34 211 238 / 0.14)',
} as const

// ────────────────────────────────────────────────────────────────────────────
// Motion (align with `app/globals.css` --motion-*)
// ────────────────────────────────────────────────────────────────────────────

export const motion = {
  durationMs: {
    instant: 0,
    fast: 120,
    base: 180,
    deliberate: 280,
    page: 140,
  },
  /** CSS easing — cubic bezier */
  easeOutExpo: [0.22, 1, 0.36, 1] as const,
  /** Spring presets consumed by Framer Motion config objects */
  spring: {
    liquid: { type: 'spring' as const, stiffness: 360, damping: 34, mass: 0.8 },
    soft: { type: 'spring' as const, stiffness: 260, damping: 28, mass: 0.9 },
    snappy: { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.75 },
  },
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
  motion,
} as const

export type DesignTokens = typeof tokens
