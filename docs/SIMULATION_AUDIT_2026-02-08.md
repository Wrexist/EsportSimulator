# Simulation Audit (2026-02-08)

## What was run

1. **Release hardening suite**
   - Command: `npm run release:hardening`
   - Includes:
     - save tamper detection
     - crash/resume exact-once checks across week-processing steps
     - 500-week deterministic fuzz run
   - Result: passed (`500` weeks fuzz in ~`543s`)

2. **Snapshot career batch audit (new script)**
   - Command pattern: `npx tsx scripts/session-simulation-audit.ts --sessions=... --weeks=... --start=... --end=...`
   - Short runs:
     - 7 isolated careers x 30 weeks = **210 weeks**
     - Reports:
       - `docs/session-simulation-report-r1.json`
       - `docs/session-simulation-report-r2.json`
       - `docs/session-simulation-report-r3.json`
       - `docs/session-simulation-report-r4.json`
       - `docs/session-simulation-report-r5.json`
       - `docs/session-simulation-report-r6.json`
       - `docs/session-simulation-report-r7-falcons.json`
   - Long runs:
     - 2 isolated careers x 52 weeks = **104 weeks**
     - Reports:
       - `docs/session-simulation-report-low52.json`
       - `docs/session-simulation-report-high52.json`

## High-level outcomes

- Total simulated in this audit: **814 weeks** (`500 + 210 + 104`)
- No fatal transaction corruption found in hardening checks.
- No non-finite numeric state and no orphan team references found in session audits.

## Key findings

1. **Economy is heavily polarized by starting strength**
   - 30-week sessions ranged from `-2,013,135` budget delta (BORING PLAYERS) to `+3,967,260` (paiN).
   - In 7 short runs, 2 teams went negative; 1 dropped below `-500k`.
   - 52-week low-tier sample reached `-2,878,608` minimum budget.

2. **Many careers have very low official match activity early**
   - In 7 short runs, only 1 team (Falcons) had completed official matches by week 30 (`3` matches).
   - Both 52-week samples in this run had `0` completed player-team matches.

3. **AI roster underflow persists week-to-week**
   - Short runs total underflow hits: `579` (sum of weekly checks where teams had `<5` players).
   - Long runs:
     - low 52w: `160` underflow hits
     - high 52w: `112` underflow hits

4. **World economy stress is high**
   - By week 30, bankrupt AI-team counts often sat around `41-43`.
   - By week 52, sampled saves reached `44-45` bankrupt teams.

## Likely root causes in code

1. `engine/ai-manager.ts:164`
   - Free-agent signing is blocked unless `team.budget > 1000`, even when roster is below 5.
2. `engine/pre-season-transfers.ts:60`
   - Pre-season filler stops at 4 players (`if (rosterSize >= 4) continue`), depending on weekly AI to fix the last slot.
3. `store/game-store.ts:2126`
   - Player auto-registration logic filters tournaments by `entryType`.
4. `data/snapshot-loader.ts:455`
   - Snapshot tournaments mapped into save data do not include `entryType`, limiting eligibility/autoreg signals for imported tournaments.

## Fixes recommended first

1. **Enforce roster floor hard rule**
   - Guarantee every AI team reaches `>=5` before week finalization.
   - Allow emergency signing even in negative budget when roster <5.
2. **Economy stabilization pass**
   - Add debt protection/restructuring for AI teams in insolvency instead of repeated deadlock.
   - Rebalance weekly salary/upkeep vs baseline income for lower-rep teams.
3. **Match activity guarantee for player team**
   - Ensure minimum official/scrim opportunities per time window (for example at least one match every 2-4 weeks).
   - Align snapshot tournament conversion with registration rules (`entryType` + requirements metadata).
4. **Keep headless tooling**
   - Retain `scripts/session-simulation-audit.ts` as a repeatable regression harness.

