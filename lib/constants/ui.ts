/**
 * Centralized UI Constants
 * Single source of truth for z-index layers, toast durations,
 * animation timings, sidebar dimensions, and tier colors.
 */

// Z-Index layering system - use these instead of arbitrary z-[N] values
export const Z_INDEX = {
  DROPDOWN: 50,
  MODAL_BACKDROP: 100,
  MODAL: 110,
  CELEBRATION: 200,
  SHEET: 300,
  DIALOG: 400,
  DEVTOOLS: 900,
  TOAST: 950,
} as const

// Toast notification durations (ms)
export const TOAST_DURATION = {
  SHORT: 3000,
  DEFAULT: 4000,
  LONG: 8000,
} as const

// Animation timing constants (ms)
export const ANIMATION_TIMING = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const

// Sidebar dimensions (px)
export const SIDEBAR_WIDTH = {
  COLLAPSED: 64,
  EXPANDED: 240,
} as const

// Tournament tier color classes
export const TIER_COLORS = {
  S_TIER: { text: 'text-amber-400', border: 'border-amber-400/30', bg: 'bg-amber-400/10' },
  A_TIER: { text: 'text-blue-400', border: 'border-blue-400/30', bg: 'bg-blue-400/10' },
  B_TIER: { text: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10' },
  C_TIER: { text: 'text-slate-400', border: 'border-slate-400/30', bg: 'bg-slate-400/10' },
  D_TIER: { text: 'text-zinc-500', border: 'border-zinc-500/30', bg: 'bg-zinc-500/10' },
} as const

// Standard backdrop variants for modals/overlays
export const BACKDROP = {
  LIGHT: 'bg-black/60 backdrop-blur-sm',
  HEAVY: 'bg-black/85 backdrop-blur-md',
} as const
