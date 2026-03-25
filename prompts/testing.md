# Prompt: Write Tests

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Write tests for [MODULE_NAME] in the Esports Manager: FPS game.

### Module Location
[LOCATION — e.g., "engine/chemistry-engine.ts"]

### Critical Behaviors to Test
[BEHAVIORS — the most important things to verify, e.g.:
- Chemistry calculation returns 0-100 range
- Five unique roles produce maximum role balance bonus
- Roster change applies chemistry penalty
- Same inputs always produce same output (determinism)
]

### Edge Cases
[EDGE_CASES — boundary conditions to test, e.g.:
- Empty roster (0 players)
- Single player team
- All players with identical stats
- Maximum/minimum stat values (0 and 100)
]

### Existing Test Examples
Look at __tests__/ for the project's test style. Follow the same patterns.
```

---

## Testing Patterns

### File Location & Naming
- File: `__tests__/[module-name].test.ts`
- Example: `__tests__/chemistry.test.ts`, `__tests__/match-engine.test.ts`

### Test Structure
```typescript
/**
 * Module Name Tests
 * Tests for [brief description of what's being tested]
 */

import { SeededRNG } from "@/engine/rng"
import { ChemistryEngine } from "@/engine/chemistry-engine"
import type { Player } from "@/types"

// ===== HELPERS =====

/** Create a minimal player for testing */
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "test-player-1",
    name: "Test Player",
    role: "RIFLER",
    skill: 75,
    teamwork: 70,
    amicability: 65,
    // ... minimum required fields
    ...overrides,
  } as Player
}

// ===== TESTS =====

describe("ChemistryEngine", () => {
  const engine = new ChemistryEngine()

  describe("calculateChemistry", () => {
    it("should return a value between 0 and 100", () => {
      const players = [
        createTestPlayer({ id: "p1", role: "AWPER" }),
        createTestPlayer({ id: "p2", role: "RIFLER" }),
        createTestPlayer({ id: "p3", role: "IGL" }),
        createTestPlayer({ id: "p4", role: "SUPPORT" }),
        createTestPlayer({ id: "p5", role: "ENTRY_FRAGGER" }),
      ]

      const result = engine.calculateChemistry(players)

      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(100)
    })

    it("should produce higher chemistry with diverse roles", () => {
      const diverseRoles = [
        createTestPlayer({ id: "p1", role: "AWPER" }),
        createTestPlayer({ id: "p2", role: "RIFLER" }),
        createTestPlayer({ id: "p3", role: "IGL" }),
        createTestPlayer({ id: "p4", role: "SUPPORT" }),
        createTestPlayer({ id: "p5", role: "ENTRY_FRAGGER" }),
      ]
      const sameRoles = Array.from({ length: 5 }, (_, i) =>
        createTestPlayer({ id: `p${i}`, role: "RIFLER" })
      )

      const diverseResult = engine.calculateChemistry(diverseRoles)
      const sameResult = engine.calculateChemistry(sameRoles)

      expect(diverseResult).toBeGreaterThan(sameResult)
    })
  })

  describe("edge cases", () => {
    it("should handle empty roster gracefully", () => {
      const result = engine.calculateChemistry([])
      expect(result).toBe(0)
    })
  })
})
```

### Key Testing Principles

1. **Test Determinism First**: For any module using `SeededRNG`, verify same seed = same output
   ```typescript
   it("should produce identical results with the same seed", () => {
     const rng1 = new SeededRNG(42)
     const rng2 = new SeededRNG(42)

     const result1 = engine.simulate(testData, rng1)
     const result2 = engine.simulate(testData, rng2)

     expect(result1).toEqual(result2)
   })
   ```

2. **Test Boundaries**: Always test 0, 1, max, and edge values
   ```typescript
   it("should clamp stat to 0-100 range", () => {
     expect(clampStat(-10)).toBe(0)
     expect(clampStat(0)).toBe(0)
     expect(clampStat(50)).toBe(50)
     expect(clampStat(100)).toBe(100)
     expect(clampStat(150)).toBe(100)
   })
   ```

3. **Test State Transitions**: For store actions, verify before/after state
   ```typescript
   it("should add injury to active list", () => {
     const initialState = { injuries: [] }
     const action = createMySlice(mockSet, mockGet)

     action.addInjury({ playerId: "p1", severity: "minor", weeksRemaining: 2 })

     // Verify set was called with correct mutation
   })
   ```

4. **Arrange-Act-Assert**: Every test follows this pattern
   ```typescript
   it("should do X when Y", () => {
     // Arrange — set up test data
     const player = createTestPlayer({ fatigue: 90 })
     const rng = new SeededRNG(42)

     // Act — call the function
     const result = injurySystem.evaluate(player, 0.8, rng)

     // Assert — verify output
     expect(result.occurred).toBe(true)
   })
   ```

5. **Descriptive Test Names**: Use `"should [expected behavior] when [condition]"` pattern
   ```typescript
   it("should double injury risk when fatigue exceeds 80")
   it("should return zero chemistry for empty roster")
   it("should preserve match determinism across re-runs")
   ```

### Running Tests
```bash
npm run test                  # Run all tests
npm run test -- --watch       # Watch mode
npm run test -- [filename]    # Run specific test file
```

### What to Test in This Project
- **Engine calculations**: Chemistry, match simulation, training gains, economy
- **RNG determinism**: Same seed = same results, across runs
- **Boundary conditions**: Empty arrays, max/min values, missing data
- **State transitions**: Store actions produce expected state changes
- **Data integrity**: Save/load cycle preserves all data
