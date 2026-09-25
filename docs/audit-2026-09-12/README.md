# Esports Manager: project audit and professionalization plan

Audit date: 12 September 2026. Baseline commit: `f0c1f814`.

**Implementation has started:** see [first cleanup batch and current validation](IMPLEMENTATION.md). Findings and counts below describe the original baseline. Also see the [glass interface and navigation pass](GLASS-INTERFACE.md).

**Recommendation: keep the existing game and consolidate it.** The simulation and regression suite provide a useful foundation. The biggest problems are inconsistent sources of truth, gaps between subsystem tests and the running application, and an interface that prioritizes decoration over readable decisions. A wholesale rewrite would put working systems and save compatibility at unnecessary risk.

Read these in order:

1. [Audit and findings](AUDIT.md) — verified defects, structural problems, strengths, and limits of the evidence.
2. [Execution plan and backlog](PLAN.md) — ordered work packages, dependencies, estimates, and acceptance criteria.
3. [Project coverage and player-journey checklist](COVERAGE.md) — every route and major subsystem, including the checks still needed.

The audit includes repository inventory, source inspection, a fresh dependency install, TypeScript, lint, all tests, a production build, a 500-week hardening run, Steam static checks, and a browser walkthrough of a new career through a match, saving, and loading. **It does not certify a packaged Steam release or claim that every possible gameplay state was tested.**

## Most important findings

| Priority | Finding | Why it matters |
|---|---|---|
| P1 | Dashboard and Finances disagree about weekly income | Players cannot reliably plan spending. |
| P1 | A late worker result can satisfy the next simulation request | A timeout can apply the wrong week result. Reproduced with a fake transport. |
| P1 | Next Day and Skip Week are outside the 1024×640 viewport | Essential progression controls become inaccessible by mouse. |
| P1 | Autosave has two competing settings; close handling has conflicting timers | Save behavior does not consistently match the player's choices. |
| P1 | Dependency and Electron boundary hardening remain | Static release checks currently miss important runtime concerns. |
| P2 | Heavy typography, tiny labels, competing navigation, contradictory names | The game feels harder to learn and less coherent than its feature set warrants. |

## Baseline verification

| Check | Result |
|---|---|
| Fresh `npm ci` | Passed; 1,226 packages installed |
| TypeScript | Passed |
| Jest | **1,163 tests / 112 suites passed** |
| Lint | Passed with **154 warnings**, zero errors |
| Production Next.js build | Passed |
| Hardening | Passed, including **500 simulated weeks** and 2,202 asset-signature checks |
| Circuit calendar | Passed with four scheduling warnings |
| Strict Steam-ready / compliance scans | Passed; these are limited static scans |
| Dependency audit | **47 affected-package findings: 5 critical, 33 high, 6 moderate, 3 low**; applicability needs triage |
| Browser career → first match → save → continue | Passed for one fresh career |
| Packaged Electron, live Steam, controller, cloud across devices | Not executed |

Source and validation evidence are in [evidence/](evidence/), including [build output](evidence/build.txt), [test totals](evidence/test-summary.json), [dependency report](evidence/dependency-audit.json), [repository inventory](evidence/inventory.json), UI snapshots, screenshots, and [reproducible behavior probes](evidence/behavior-probes.cjs).

The initial audit changed only documents/evidence and README/TASK status links. Subsequent application changes are tracked in [IMPLEMENTATION.md](IMPLEMENTATION.md), [GLASS-INTERFACE.md](GLASS-INTERFACE.md) and [ASSETS-AND-RADAR.md](ASSETS-AND-RADAR.md); dependency versions are unchanged. A test career named Audit Manager was created on the isolated browser origin `127.0.0.1:3210`; existing Electron saves were not used.
