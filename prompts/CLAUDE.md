# Esports Manager: FPS — AI Coding Context

You are working on **Esports Manager: FPS**, a CS2 (Counter-Strike 2) esports team management simulator. It is a desktop game distributed on Steam.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| UI | React 18, TypeScript 5.3, Tailwind CSS 3.4 |
| Components | Radix UI (headless), Lucide React (icons), Framer Motion 12 (animation) |
| State | Zustand 5 + Immer 10 (immutable state) |
| Charts | Recharts 2.15 |
| Validation | Zod 3.24, React Hook Form 7.54 |
| Desktop | Electron 39, Steamworks.js 0.4 |
| Testing | Jest 29 + ts-jest |
| Build | electron-builder 26, PostCSS, ESLint 10 |

---

## Architecture Rules (Non-Negotiable)

### 1. Deterministic Simulation
- ALL randomness MUST use `SeededRNG` from `@/engine/rng`
- NEVER use `Math.random()` anywhere in the codebase
- RNG instances are passed explicitly to functions — no global RNG state
- Same seed + same inputs = identical outputs (for replay/debugging)

### 2. Immutable State
- State lives in a single Zustand store with Immer middleware
- Mutations use Immer's draft syntax: `set((state) => { state.prop = value })`
- NEVER mutate state directly outside of `set()` callbacks
- Previous states can be restored via snapshots

### 3. Offline-First
- Zero network dependencies — all data is local
- Persistence via AsyncStorage (Zustand persist middleware)
- No API calls, no fetch, no server-side data fetching

### 4. Strict TypeScript
- `strict: true` in tsconfig
- No `any` types — always define explicit types
- No `@ts-ignore` or `@ts-nocheck`
- Use `import type { X }` for type-only imports

---

## Directory Structure

```
app/                  → Next.js 14 App Router pages ("use client" on all interactive pages)
engine/               → Core simulation & game logic (deterministic, no UI dependencies)
store/                → Zustand store + slices (single store, Immer middleware)
  slices/             → Store slice creators (ui-slice.ts, academy-slice.ts, etc.)
components/           → React components organized by feature
  ui/                 → Shared UI primitives (Button, Card, Badge, Dialog, etc.)
  layout/             → App shell, sidebar, topbar
  match/              → Match simulation UI
  player/             → Player detail, skills
  squad/              → Team roster, chemistry
  tournament/         → Bracket views
  training/           → Training modals
  transfer/           → Negotiation
  dashboard/          → Dashboard widgets
  stats/              → Statistics
  celebration/        → Animations (SeasonRecap, confetti)
types/                → TypeScript type definitions (game.ts, player.ts, match.ts, etc.)
hooks/                → Custom React hooks (useAutoSave, useLiveMatch, etc.)
lib/                  → Utility functions (cn(), sound-manager, logger, etc.)
data/                 → Static game data (tournament-calendar, map-pool, drills.json)
__tests__/            → Jest test files
electron/             → Electron main process (main.js)
public/assets/        → Images, logos, flags, portraits
```

---

## Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Component files | PascalCase | `NewsFeed.tsx`, `TeamLogoDisplay.tsx` |
| Engine/store files | kebab-case | `match-simulation.ts`, `ui-slice.ts` |
| Hook files | camelCase with `use` prefix | `useAutoSave.ts`, `useLiveMatch.ts` |
| Type files | kebab-case | `game.ts`, `player.ts`, `academy.ts` |
| Directories | kebab-case | `components/match/`, `store/slices/` |
| Variables & functions | camelCase | `playerTeam`, `calculateTeamChemistry()` |
| Constants | UPPER_SNAKE_CASE | `MAX_PLAYER_SALARY`, `MOMENTUM_WEIGHT` |
| Interfaces & types | PascalCase | `Player`, `MatchResult`, `UIState` |
| Enums & enum values | PascalCase / UPPER_CASE | `PlayerRole`, `PlayerTier` |
| Store actions | camelCase verbs | `simulateInstantMatch`, `advanceWeek` |
| Test files | kebab-case with `.test.ts` | `engine.test.ts`, `chemistry.test.ts` |

---

## Import Rules

Always use the `@/` path alias (maps to project root). Organize imports in this order:

```typescript
// 1. React / Next.js
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

// 2. External libraries
import { motion, AnimatePresence } from "framer-motion"
import { useShallow } from "zustand/react/shallow"

// 3. Store
import { useGameStore } from "@/store/game-store"

// 4. Engine modules
import { SeededRNG } from "@/engine/rng"
import { simulationEngineV2 } from "@/engine"

// 5. Components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

// 6. Types (use import type)
import type { Player, Team, Match } from "@/types"

// 7. Utilities & data
import { cn } from "@/lib/utils"
import { FULL_TOURNAMENT_CALENDAR } from "@/data/tournament-calendar"

// 8. Icons (always last)
import { Trophy, Users, TrendingUp } from "lucide-react"
```

---

## Component Patterns

Every interactive component starts with `"use client"` and follows this structure:

```typescript
"use client"

import { useCallback, useMemo } from "react"
import { useGameStore } from "@/store/game-store"
import { useShallow } from "zustand/react/shallow"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { Player } from "@/types"

interface PlayerCardProps {
  /** The player to display */
  player: Player
  /** Whether the card is in compact mode */
  compact?: boolean
}

export function PlayerCard({ player, compact = false }: PlayerCardProps) {
  // Store subscriptions — use useShallow for multiple properties
  const { playerTeamId, contracts } = useGameStore(useShallow(state => ({
    playerTeamId: state.playerTeamId,
    contracts: state.contracts,
  })))

  // For single properties, no useShallow needed
  const currentWeek = useGameStore(s => s.currentWeek)

  // Memoize expensive computations
  const contract = useMemo(
    () => contracts.find(c => c.playerId === player.id),
    [contracts, player.id]
  )

  // useCallback for event handlers
  const handleClick = useCallback(() => {
    // ...
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "glass-panel rounded-xl p-4",
        compact && "p-2"
      )}
    >
      {/* Content */}
    </motion.div>
  )
}
```

### Key Rules:
- Use `cn()` from `@/lib/utils` to merge Tailwind classes conditionally
- Use `glass-panel` or `glass-card` CSS classes for the glassmorphism look
- Use Framer Motion `motion.div` for enter/exit animations
- Use Lucide React for all icons: `import { Trophy } from "lucide-react"`
- Use Radix UI primitives for accessible interactive elements (Dialog, Select, Tooltip, etc.)
- Use `useShallow` when selecting multiple store properties to prevent unnecessary re-renders
- Use `useMemo` for derived data, `useCallback` for event handlers

---

## Store Patterns

### Accessing the Store

```typescript
// Single property — direct selector
const currentWeek = useGameStore(s => s.currentWeek)

// Multiple properties — always use useShallow
const { teams, players } = useGameStore(useShallow(s => ({
  teams: s.teams,
  players: s.players,
})))

// Calling store actions
const advanceWeek = useGameStore(s => s.advanceWeek)
```

### Creating a Store Slice

```typescript
// store/slices/my-slice.ts
"use client"

import type { MyState, MyActions, SliceCreator } from "@/store/types"

export const myInitialState: MyState = {
  items: [],
  selectedId: null,
}

export const createMySlice: SliceCreator<MyActions> = (set, get) => ({
  setSelectedId: (id) => set({ selectedId: id }),

  addItem: (item) =>
    set((state) => {
      state.items.push(item)
    }),

  removeItem: (id) =>
    set((state) => {
      state.items = state.items.filter(i => i.id !== id)
    }),

  getSelectedItem: () => {
    const state = get()
    return state.items.find(i => i.id === state.selectedId) ?? null
  },
})
```

### Store RNG Helpers (for deterministic IDs and randomness inside the store)

```typescript
// Inside store actions, use these helpers:
const value = nextRandom(state)           // random float [0, 1)
const id = nextDeterministicId(state, "match", homeId, awayId)  // deterministic ID
const seed = ensureDeterministicSeed(state, match)  // ensure match has a seed
```

---

## Engine Patterns

Engine files live in `engine/` and contain pure game logic — no React, no UI, no store imports.

```typescript
/**
 * Module Name
 * Phase X: Brief description
 *
 * FEATURES:
 * - Feature one
 * - Feature two
 *
 * GUARANTEES:
 * - Invariant one
 * - Invariant two
 */

import { SeededRNG } from "./rng"
import type { Player, Team } from "@/types"

// ===== CONSTANTS =====

const BASE_MORALE_RECOVERY = 5
const MAX_FATIGUE = 100

// ===== CORE LOGIC =====

export class TrainingProcessor {
  /**
   * Calculate training gains for a player
   * @param player - The player being trained
   * @param focus - Training focus area
   * @param rng - Seeded RNG instance (required for determinism)
   * @returns Updated player stats
   */
  calculateGains(player: Player, focus: string, rng: SeededRNG): Partial<Player> {
    const roll = rng.next()
    // ... logic
    return { /* updated stats */ }
  }
}

// Export singleton instance
export const trainingProcessor = new TrainingProcessor()
```

### Key Rules:
- Always accept `SeededRNG` as a parameter — never create one internally
- Use JSDoc with `@param` and `@returns`
- Use section dividers: `// ===== SECTION NAME =====`
- Export both the class and a singleton: `export const x = new X()`
- Keep engine code pure — no React hooks, no store access, no side effects

---

## Page Patterns (Next.js App Router)

```typescript
// app/feature-name/page.tsx
"use client"

import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useGameStore } from "@/store/game-store"

export default function FeaturePage() {
  const router = useRouter()
  const isInitialized = useGameStore(s => s.isInitialized)

  // Redirect to main menu if no active game session
  useEffect(() => {
    if (!isInitialized) router.push('/main-menu')
  }, [isInitialized, router])

  if (!isInitialized) return null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-wider uppercase">Feature Name</h1>
      {/* Page content */}
    </div>
  )
}
```

---

## Visual Style

- **Theme**: Dark glassmorphism (`#0e1217` background)
- **Glass effects**: Use `glass-panel` (brighter) or `glass-card` (subtle) CSS classes
- **Colors**: Cyan `#3b82f6`, Emerald `#10b981`, Violet `#8b5cf6`, Gold `#fbbf24`, Red `#f87171`
- **Font**: Archivo Black, uppercase headers with `tracking-wider` or `tracking-[0.4em]`
- **Borders**: `border-white/5` to `border-white/10`
- **Text**: `text-white` primary, `text-white/60` secondary, `text-white/30` muted
- **Animations**: Framer Motion for enter/exit, CSS transitions for hover states
- **Border radius**: `rounded-xl` for cards, `rounded-lg` for smaller elements

---

## ESLint Rules

- `no-var: error` — use `const` or `let`
- `eqeqeq: always` — use `===` (null comparison exempt)
- `no-console: warn` — only `console.error` allowed
- `prefer-const: warn` — use `const` when variable is never reassigned
- `@typescript-eslint/no-unused-vars: warn` — prefix unused params with `_`

---

## Testing

```typescript
// __tests__/module-name.test.ts
import { SeededRNG } from "@/engine/rng"

describe("ModuleName", () => {
  describe("featureName", () => {
    it("should do the expected thing", () => {
      // Arrange
      const rng = new SeededRNG(42)
      // Act
      const result = someFunction(rng)
      // Assert
      expect(result).toBe(expected)
    })
  })
})
```

Run tests: `npm run test`
Type check: `npm run type-check`
Lint: `npm run lint`

---

## Key Domain Concepts

- **Player**: 20+ attributes (skill, AWP, rifle, pistol, grenades, clutch, tactic, morale, fatigue, potential, form), age lifecycle, weapon mastery
- **Team**: 5-player roster + staff (coach, analyst, psychologist), chemistry 0-100, facilities level 1-10, playstyle
- **Match**: CS2 format — BO1/BO3/BO5, map veto, round-by-round simulation with economy, deterministic from seed
- **Tournament**: Tier system (S/A/B/C), bracket/swiss/league formats, circuit points, Major championships
- **Week Tick**: Core game loop — `atomic-week-processor.ts` processes all weekly events (matches, training, events, finances, aging)
- **Save System**: Versioned saves (v1-v4) with SHA-256 integrity, max 50 snapshots, array caps to prevent unbounded growth

---

## Common Gotchas

1. **Forgot `"use client"`** — every interactive component needs it (Next.js App Router)
2. **Used Math.random()** — NEVER. Always use `SeededRNG`
3. **Mutated state directly** — always inside `set((state) => { ... })` with Immer
4. **Selected entire store** — use granular selectors or `useShallow` to prevent re-render storms
5. **Missing save migration** — if you add new persisted state, update `save-types.ts` and add migration logic
6. **Created engine code with React imports** — engine must be pure, no React dependencies
7. **Used relative imports** — always use `@/` path alias
