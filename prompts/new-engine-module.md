# Prompt: Add Game Engine Logic

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Create a new engine module called [MODULE_NAME] for the Esports Manager: FPS game.

### Game Mechanic
[MECHANIC — explain the game mechanic this module implements, e.g., "Player injury system that determines when players get injured, how long they're out, and how it affects team performance"]

### Inputs
[INPUTS — what data does this module need, e.g.:
- players: Player[] — the team roster
- fatigue: number — player fatigue level (0-100)
- rng: SeededRNG — deterministic random number generator
]

### Outputs
[OUTPUTS — what does this module produce, e.g.:
- InjuryResult — whether an injury occurred, severity, and weeks out
- Updated player fatigue/health values
]

### Integration Point
[INTEGRATION — where does this plug into the game loop, e.g.:
- Called during the weekly tick in atomic-week-processor.ts
- Called after each match simulation
- Called on-demand from a UI action
]

### Balance Parameters
[BALANCE — key tuning constants, e.g.:
- Base injury chance: 2% per match
- Injury severity weights: 60% minor (1-2 weeks), 30% moderate (3-5 weeks), 10% severe (6-12 weeks)
- Fatigue above 80 doubles injury risk
]
```

---

## Engine Module Structure Rules

### File Location & Naming
- File: `engine/[module-name].ts` (kebab-case)
- Example: `engine/injury-system.ts`, `engine/morale-engine.ts`

### Required Pattern
```typescript
/**
 * Module Name
 * Brief description of what this module does
 *
 * FEATURES:
 * - Feature one
 * - Feature two
 *
 * GUARANTEES:
 * - All randomness uses SeededRNG (deterministic)
 * - Pure functions — no side effects, no store access
 * - Same inputs always produce same outputs
 */

import { SeededRNG } from "./rng"
import type { Player, Team } from "@/types"

// ===== CONSTANTS =====

/** Base chance of injury per match (2%) */
const BASE_INJURY_CHANCE = 0.02

/** Fatigue threshold above which injury risk doubles */
const HIGH_FATIGUE_THRESHOLD = 80

// ===== TYPES =====

export interface InjuryResult {
  occurred: boolean
  severity: "minor" | "moderate" | "severe"
  weeksOut: number
}

// ===== CORE LOGIC =====

export class InjurySystem {
  /**
   * Evaluate injury risk for a player after a match
   * @param player - The player to evaluate
   * @param matchIntensity - How intense the match was (0-1)
   * @param rng - Seeded RNG instance
   * @returns Injury result with severity and duration
   */
  evaluate(player: Player, matchIntensity: number, rng: SeededRNG): InjuryResult {
    const fatigueMultiplier = player.fatigue > HIGH_FATIGUE_THRESHOLD ? 2.0 : 1.0
    const chance = BASE_INJURY_CHANCE * fatigueMultiplier * matchIntensity

    if (!rng.bool(chance)) {
      return { occurred: false, severity: "minor", weeksOut: 0 }
    }

    const roll = rng.next()
    if (roll < 0.6) return { occurred: true, severity: "minor", weeksOut: rng.int(1, 2) }
    if (roll < 0.9) return { occurred: true, severity: "moderate", weeksOut: rng.int(3, 5) }
    return { occurred: true, severity: "severe", weeksOut: rng.int(6, 12) }
  }
}

// Export singleton
export const injurySystem = new InjurySystem()
```

### Critical Rules

1. **Determinism**: Every function that involves randomness MUST accept `SeededRNG` as a parameter
   ```typescript
   // CORRECT
   calculate(player: Player, rng: SeededRNG): number

   // WRONG — never do this
   calculate(player: Player): number {
     const random = Math.random() // FORBIDDEN
   }
   ```

2. **Purity**: Engine code must be pure — no React, no store imports, no DOM, no side effects
   ```typescript
   // CORRECT — import from engine or types only
   import { SeededRNG } from "./rng"
   import type { Player } from "@/types"

   // WRONG — never import these in engine code
   import { useGameStore } from "@/store/game-store"  // NO
   import { useState } from "react"                    // NO
   ```

3. **Constants**: Use UPPER_SNAKE_CASE, add JSDoc explaining the value
   ```typescript
   /** Maximum team chemistry bonus (15% strength increase) */
   const MAX_CHEMISTRY_BONUS = 0.15
   ```

4. **Section Dividers**: Use consistent comment separators
   ```typescript
   // ===== CONSTANTS =====
   // ===== TYPES =====
   // ===== CORE LOGIC =====
   // ===== HELPERS =====
   ```

5. **Export Pattern**: Export both class and singleton instance
   ```typescript
   export class MyEngine { ... }
   export const myEngine = new MyEngine()
   ```

6. **Integration with Weekly Tick**: If the module runs weekly, it should be called from `engine/atomic-week-processor.ts` during the week processing pipeline

### Existing Engine Modules (for reference)
- `engine/match-simulation.ts` — Round-by-round match simulation
- `engine/chemistry-engine.ts` — Team chemistry calculation
- `engine/training-manager.ts` — Training system
- `engine/economy-manager.ts` — Financial calculations
- `engine/academy-engine.ts` — Youth academy system
- `engine/player-evaluation.ts` — Player scouting/rating
- `engine/ai-manager.ts` — AI team decision-making
- `engine/tournament-manager.ts` — Tournament brackets & scheduling
- `engine/weapon-mastery-system.ts` — Weapon XP progression
- `engine/synergy-calculator.ts` — Player synergy bonuses
- `engine/rng.ts` — SeededRNG class (mulberry32 algorithm)
