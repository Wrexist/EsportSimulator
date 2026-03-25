# Prompt: Build a New Feature / Page

> Copy the context from `CLAUDE.md` in this folder first, then append this prompt with your details filled in.

---

## Template

```
Build a new feature called [FEATURE_NAME] for the Esports Manager: FPS game.

### What It Does
[DESCRIPTION — explain what this feature adds to the game and why it matters to the player]

### Data Requirements
This feature needs access to the following store data:
- [LIST_STORE_DATA — e.g., "teams, players, contracts, currentWeek"]

If new state is needed, describe it:
- [NEW_STATE — e.g., "sponsorOffers: SponsorOffer[]" or "none"]

### User Interactions
The user should be able to:
- [INTERACTION_1 — e.g., "View a list of available sponsors"]
- [INTERACTION_2 — e.g., "Accept or reject a sponsor deal"]
- [INTERACTION_3 — e.g., "See total sponsorship income on the finances page"]

### Game Logic (if any)
[ENGINE_LOGIC — e.g., "Sponsor offers are generated weekly based on team tier and reputation. Better teams get higher-value offers. Use SeededRNG for generation." or "No new engine logic needed."]

### Visual Reference
[VISUAL — e.g., "Similar to the transfers page — a filterable list with cards. Use glass-panel styling." or "Match the dashboard widget style."]
```

---

## Checklist (AI should follow this)

When building a new feature, create these files in order:

### 1. Types (if new data structures needed)
- [ ] Add interfaces to `types/[feature].ts` or extend existing type files
- [ ] Export from `types/index.ts` if barrel export exists

### 2. Engine Logic (if game simulation needed)
- [ ] Create `engine/[feature]-engine.ts` or `engine/[feature]-manager.ts`
- [ ] Accept `SeededRNG` as parameter for any randomness
- [ ] Export class + singleton instance
- [ ] Add JSDoc header with FEATURES and GUARANTEES

### 3. Store Integration
- [ ] Add state shape to `store/types.ts`
- [ ] Create `store/slices/[feature]-slice.ts` with initial state + actions
- [ ] Wire slice into `store/game-store.ts`
- [ ] If persisted, update `engine/save-types.ts` with new fields

### 4. Page
- [ ] Create `app/[feature]/page.tsx`
- [ ] Add `"use client"` directive
- [ ] Add session guard (redirect to `/main-menu` if not initialized)
- [ ] Use uppercase tracking-wider heading style

### 5. Components
- [ ] Create `components/[feature]/` directory
- [ ] Break page into focused components
- [ ] Use existing UI primitives from `components/ui/` (Card, Button, Badge, Dialog, etc.)
- [ ] Add Framer Motion animations (initial/animate on cards/lists)
- [ ] Use glass-panel styling for containers

### 6. Navigation
- [ ] Add link in sidebar navigation (`components/layout/`)
- [ ] Add Lucide icon for the nav item

### 7. Weekly Integration (if recurring)
- [ ] Hook into `engine/atomic-week-processor.ts` weekly tick if this feature processes weekly

---

## Example: Filled-In Prompt

```
Build a new feature called Sponsorship Manager for the Esports Manager: FPS game.

### What It Does
Allows the player to browse, negotiate, and manage team sponsorships. Sponsors offer
weekly income based on the team's tier, reputation, and recent results. The player
can have up to 3 active sponsors at once.

### Data Requirements
This feature needs access to the following store data:
- teams (for player team reputation and tier)
- currentWeek (for contract timing)
- financeLedger (to show income impact)

New state needed:
- sponsors: Sponsor[] (active sponsor contracts)
- sponsorOffers: SponsorOffer[] (available offers, refreshed weekly)

### User Interactions
The user should be able to:
- View current active sponsors with weekly income and contract duration
- Browse available sponsor offers (3-5 per week)
- Accept a sponsor offer (if under 3 active limit)
- Decline an offer (removed from list)
- See sponsor income reflected in the finances page

### Game Logic
Sponsor offers are generated weekly by a SponsorEngine. Offer value scales with
team.reputation (0-100) and team.tier. S-tier teams get $50k-200k/week offers,
C-tier get $2k-10k/week. Contracts last 12-52 weeks. Use SeededRNG for all
generation. Sponsors can include performance bonuses (e.g., +$5k per tournament win).

### Visual Reference
Similar to the staff page — a list of active sponsors at top, available offers below
in a grid of glass-panel cards. Each card shows sponsor name, weekly value, duration,
and an accept/decline button pair.
```
