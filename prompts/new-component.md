# Prompt: Create a UI Component

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Create a React component called [COMPONENT_NAME] for the Esports Manager: FPS game.

### Purpose
[PURPOSE — what this component displays or does]

### Props
[PROPS — list the props with types and descriptions, e.g.:
- player: Player — the player data to display
- compact?: boolean — show a smaller version (default: false)
- onSelect?: (id: string) => void — callback when user clicks the card
]

### Store Data (if any)
[STORE_DATA — e.g., "Needs currentWeek and contracts from the store" or "No store access needed — pure presentational"]

### Visual Style
[VISUAL — describe the look, e.g.:
- Glass-panel card with rounded-xl corners
- Player name in bold white, stats in white/60
- Framer Motion fade-in animation
- Hover: scale 1.02 with border-white/10
]

### Behavior
[BEHAVIOR — describe interactions, e.g.:
- Clicking the card calls onSelect with the player ID
- Shows a red badge if contract is expiring within 4 weeks
- Tooltip on stat numbers showing full stat name
]
```

---

## Component Structure Rules

### File Location
- Feature-specific: `components/[feature]/[ComponentName].tsx`
- Shared/reusable: `components/ui/[ComponentName].tsx`

### Required Pattern
```typescript
"use client"

import { useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { Player } from "@/types"

interface ComponentNameProps {
  /** JSDoc description for each prop */
  player: Player
  compact?: boolean
  onSelect?: (id: string) => void
}

export function ComponentName({ player, compact = false, onSelect }: ComponentNameProps) {
  const handleClick = useCallback(() => {
    onSelect?.(player.id)
  }, [onSelect, player.id])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "glass-panel rounded-xl p-4 cursor-pointer",
        "hover:border-white/10 hover:scale-[1.02] transition-all duration-200",
        compact && "p-2"
      )}
      onClick={handleClick}
    >
      {/* Content */}
    </motion.div>
  )
}
```

### Store Subscriptions
```typescript
// Multiple properties — ALWAYS use useShallow
const { teams, players } = useGameStore(useShallow(s => ({
  teams: s.teams,
  players: s.players,
})))

// Single property — direct selector
const currentWeek = useGameStore(s => s.currentWeek)
```

### Styling Rules
- Use Tailwind CSS exclusively — no inline styles or CSS modules
- Use `cn()` for conditional class merging
- Glass containers: `glass-panel` (brighter) or `glass-card` (subtle)
- Text hierarchy: `text-white` → `text-white/60` → `text-white/30`
- Borders: `border-white/5` default, `border-white/10` on hover
- Border radius: `rounded-xl` for cards, `rounded-lg` for inner elements
- Spacing: `space-y-4` for vertical stacks, `gap-4` for grids

### Animation Rules
- Card entrance: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
- List items: stagger with `transition={{ delay: index * 0.05 }}`
- Use `AnimatePresence` for exit animations
- Hover: CSS `transition-all duration-200` (not Framer Motion — too heavy for hover)

### Existing UI Primitives (use instead of building from scratch)
- `@/components/ui/button` — Button variants
- `@/components/ui/card` — Card, CardHeader, CardTitle, CardContent, CardDescription
- `@/components/ui/badge` — Status badges
- `@/components/ui/dialog` — Modal dialogs (Radix-based)
- `@/components/ui/select` — Dropdown selects
- `@/components/ui/tabs` — Tab navigation
- `@/components/ui/tooltip` — Hover tooltips
- `@/components/ui/progress` — Progress bars
- `@/components/ui/separator` — Dividers
- `@/components/ui/TeamLogoDisplay` — Team logo with fallback

---

## Example: Filled-In Prompt

```
Create a React component called StatBar for the Esports Manager: FPS game.

### Purpose
A horizontal bar that visualizes a player stat (0-100) with a colored fill and label.

### Props
- label: string — stat name (e.g., "Rifle", "Clutch")
- value: number — stat value 0-100
- maxValue?: number — maximum value for the bar (default: 100)
- color?: string — Tailwind color class for the fill (default: "bg-blue-500")
- size?: "sm" | "md" — bar height (default: "md")

### Store Data
No store access needed — pure presentational component.

### Visual Style
- Glass-card background with rounded-lg
- Label on the left in text-white/60 text-xs uppercase tracking-wider
- Value number on the right in text-white font-bold
- Fill bar with rounded corners, color based on the color prop
- Small variant: h-1.5 bar, no label. Medium: h-2 bar with label.

### Behavior
- No interactivity — display only
- Fill width is (value / maxValue * 100)%
- Values above 80 get a subtle glow effect on the fill bar
```
