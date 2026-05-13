# Steam Launch Gate Checklist

This is a release gate, not a wishlist. Do not ship until all `BLOCKER` items pass.

## Scope
- Achievement correctness and exploit resistance
- Steam Cloud save conflict handling and corruption safety
- Refund-abuse vectors (fast progression exploits, Alt+F4 timing abuse, early-game farm loops)

## System Map (Code Ownership)
- Achievements and stats: `engine/steam-service.ts`
- Achievement trigger call-sites: `store/game-store.ts:1999`, `store/game-store.ts:2332`, `store/game-store.ts:2456`
- Rich presence and leaderboards: `engine/steam-service.ts`, `store/game-store.ts:1992`, `store/game-store.ts:1996`, `store/game-store.ts:3808`
- Save integrity and cloud conflict resolution: `engine/save-manager.ts`
- Steam IPC bridge and mutation throttling: `electron/preload.js`, `electron/main.js`
- Close/auto-save behavior: `components/layout/GameShell.tsx`
- Week atomic resume hardening: `scripts/release-hardening-check.ts`, `engine/atomic-week-processor.ts`

## Gate 0: Baseline Build Integrity
- [ ] `BLOCKER` Run `npm run type-check` and require zero errors.
- [ ] `BLOCKER` Run `npm run release:hardening` and require all checks pass.
- [ ] `BLOCKER` Run `npm run build` and require successful production build.
- Evidence required: CI log links or local command output capture in release ticket.

## Gate 1: Achievements and Stats

### 1.1 Definition parity (Steamworks admin vs game IDs)
- [ ] `BLOCKER` Every ID in `ACHIEVEMENTS` exists in Steamworks with exact same identifier.
- [ ] `BLOCKER` No retired IDs remain unlockable in code.
- [ ] `BLOCKER` Hidden/visible flags match product design.
- Evidence required: screenshot/export of Steamworks achievement config mapped 1:1 to `engine/steam-service.ts`.

### 1.2 Unlock correctness and idempotency
- [ ] `BLOCKER` Unlock events are idempotent across replay/reload (`unlockAchievement` must not duplicate side-effects).
- [ ] `BLOCKER` Achievements unlock only when intended trigger conditions are met.
- [ ] `HIGH` No false unlock when running `simulateInstantMatch` repeatedly on same result.
- Test steps:
1. Start clean Steam account/profile state.
2. Trigger each achievement once via legitimate flow.
3. Reload save, replay adjacent actions, verify no duplicate unlock toast and no state corruption.
4. Repeat with Steam offline then online.
- Pass criteria: all expected unlock exactly once; no unexpected unlocks.

### 1.3 Leaderboards and rich presence
- [ ] `BLOCKER` Leaderboard writes succeed only on intended milestones (`weeksToSTier`, `majorWins`).
- [ ] `HIGH` Rich presence updates do not spam/fail when Steam API unavailable.
- [ ] `HIGH` IPC mutation throttling blocks spam calls without crashing UI (`electron/main.js` throttles).
- Test steps:
1. Force repeated UI actions that call Steam writes.
2. Confirm throttling returns safe false/null behavior.
3. Verify game remains responsive and save progression unaffected.
- Pass criteria: no crash, no deadlock, no repeated unintended score writes.

### 1.4 Non-Steam fallback behavior
- [ ] `HIGH` Stub mode (no bridge) never crashes and never blocks progression.
- [ ] `HIGH` Achievement cache remains per-save scoped as designed (`setActiveSave` behavior).
- Pass criteria: identical gameplay progression with or without Steam bridge.

## Gate 2: Save Integrity and Steam Cloud Conflicts

### 2.1 Tamper and corruption rejection
- [ ] `BLOCKER` Modified save payload without valid integrity hash is rejected.
- [ ] `BLOCKER` User receives deterministic error and cannot silently continue with corrupted state.
- Existing automated coverage: `scripts/release-hardening-check.ts` tamper test.

### 2.2 Conflict resolution policy validation
- [ ] `BLOCKER` If local missing and cloud valid: recover from cloud.
- [ ] `BLOCKER` If both valid and cloud newer: cloud selected and local backup retained.
- [ ] `BLOCKER` If both valid and local newer: local selected.
- [ ] `BLOCKER` If one side invalid: valid side selected.
- [ ] `BLOCKER` If both invalid: load fails safely.
- Test matrix:
1. Local older, cloud newer.
2. Local newer, cloud older.
3. Local valid, cloud corrupted.
4. Local corrupted, cloud valid.
5. Both corrupted.
6. Missing local, cloud present.
- Pass criteria: selected source matches policy in `engine/save-manager.ts` for every matrix row.

### 2.3 Cloud outage and degraded mode
- [ ] `BLOCKER` Local save must still succeed if cloud upload fails.
- [ ] `HIGH` Cloud read/delete failures are handled without blocking core save/delete flows.
- [ ] `HIGH` No hard crash on Steam Cloud unavailability.
- Pass criteria: zero user data loss beyond expected cloud-sync delay.

### 2.4 Multi-device and clock skew scenario
- [ ] `HIGH` Simulate two machines with skewed clocks and conflicting updates.
- [ ] `HIGH` Verify `updatedAt` policy does not incorrectly overwrite latest intended progress.
- [ ] `MEDIUM` Decide and document tie-break rule for near-simultaneous writes (current 1s threshold).
- Pass criteria: deterministic winner and no silent destructive overwrite.

### 2.5 Close/exit safety (Alt+F4 / forced close)
- [ ] `BLOCKER` Close-intent flow attempts save when safe and confirms on failure.
- [ ] `BLOCKER` Force-close during week processing does not duplicate week progression on resume.
- Existing automated coverage: crash/resume exact-once in `release-hardening-check`.
- Manual test steps:
1. Trigger long week processing.
2. Close app mid-processing from window close, Alt+F4, and task-kill.
3. Relaunch and verify resume and one-week increment only.

## Gate 3: Refund-Abuse Vectors (2-hour adversarial sprint)

### 3.1 Early progression exploit sweep
- [ ] `BLOCKER` No infinite money loop in first 2 hours (sponsor payouts, transfer edge-cases, duplicate rewards).
- [ ] `BLOCKER` No deterministic reroll exploit yielding guaranteed top outcomes via save-reload loop.
- [ ] `HIGH` No repeatable week-advance exploit that bypasses intended costs.
- Attack script:
1. New save, minimal interactions.
2. Rush to first tournament and transfer market interactions.
3. Repeat save/reload around rewards and payouts.
4. Attempt duplicate trigger via action spam and route transitions.
- Pass criteria: no net-positive exploit with reproducible step sequence.

### 3.2 Alt+F4 transaction abuse
- [ ] `BLOCKER` During transfer, sponsor, facility, and match-result flows, force close cannot duplicate value.
- [ ] `BLOCKER` Partial commit states are either rolled back or completed exactly once after relaunch.
- [ ] `HIGH` Event log, budget, roster, and contracts remain consistent after recovery.
- Pass criteria: no duplicated money, no duplicated roster moves, no phantom rewards.

### 3.3 Save-edit and trainer resistance (single-player realistic bar)
- [ ] `BLOCKER` Save-edit cannot be loaded without valid integrity hash in production.
- [ ] `HIGH` Debug/dev-only controls are inaccessible in production build (`isDevToolsEnabled` guard).
- [ ] `MEDIUM` Document accepted limits: memory trainers can alter runtime state; protect persistence boundary.
- Pass criteria: persistent exploit requires runtime cheating only, not trivial save file edits.

### 3.4 Review-bomb risk guardrails
- [ ] `HIGH` Known exploit list and fix status prepared before launch.
- [ ] `HIGH` Fast hotfix path documented (who patches, who verifies, Steam patch SLA target).
- [ ] `MEDIUM` Support macros prepared for cloud conflict recovery and corrupted-save support.

## Gate 4: Release Evidence Packet (Must Exist Before Ship)
- [ ] `BLOCKER` Command outputs for `type-check`, `release:hardening`, and `build`.
- [ ] `BLOCKER` Achievement validation sheet (each ID, trigger, tester, result).
- [ ] `BLOCKER` Cloud conflict matrix results and selected-source outcomes.
- [ ] `BLOCKER` Refund-abuse sprint report with attempted exploit scripts and outcomes.
- [ ] `HIGH` Known-risk register with mitigation and post-launch monitoring plan.

## Go/No-Go Rule
- Ship only if all `BLOCKER` items are checked and signed by Engineering + QA.
- Any failed `BLOCKER` item is automatic no-go.
