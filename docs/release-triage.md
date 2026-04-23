# Release Triage — Phase 1.2

_Branch:_ `claude/full-codebase-audit-GczWy`
_Source:_ `docs/release-audit.md`
_Scope:_ Prioritize findings. No fixes applied.

Effort: **S** = < 1 h, **M** = half day, **L** = 1+ day.

---

## P0 — Shipblockers

Must be fixed before a public Steam build can be signed or uploaded.
Criteria: type errors, build failures, crashes, save corruption,
data loss, unshippable platform configs.

| # | Area | File | Description | Effort | Why it matters for Steam |
| --- | --- | --- | --- | --- | --- |
| P0-1 | Packaging | `package.json` → `build.win.icon` | NSIS points at `public/logo.png` (512×512 PNG). NSIS expects a multi-size `.ico`; electron-builder will transcode into a low-res icon. The existing `public/logo.ico` is a single 32×32 frame. | S | Store page, taskbar, and installer icons will look blurry/pixellated on Windows — an immediate "cheap port" tell on the #1 Steam platform. |
| P0-2 | Packaging | `package.json` → `build.mac` | No `.icns` set. No code-signing identity configured (`forceCodeSigning: false`). Notarization hook uses deprecated `electron-builder-notarize`. | M | Unsigned macOS builds are quarantined by Gatekeeper on modern macOS; Steam mac depot will launch but show "app is damaged" without proper signing + notarization. `handlebars` transitive critical CVE also enters via this package. |
| P0-3 | Packaging | `package.json` → `build.linux` | No `linux.icon` set; falls back to default transcoded PNG. | S | AppImage shortcut icon on Steam Deck + desktop Linux looks off; Steam Deck is a priority target per project README. |
| P0-4 | Security (runtime) | `package.json` (dep: `next 14.2.18`) | Next.js has **14 CVEs open**, including 1 critical (DoS via Server Actions), plus SSRF, middleware auth bypass, cache poisoning, HTTP request smuggling. Fix: `next@14.2.35` (in-range, no breaking changes). | S | Even though the app runs in Electron, the built-in Next dev/prod server surfaces these endpoints — any locally exposed port is exploitable, and `appreview@valvesoftware.com` flags known-CVE bundles. |
| P0-5 | Security (runtime) | `package.json` (dep: `electron 39.4.0`) | 18 CVEs including 6 use-after-free (renderer crashes / RCE), IPC spoofing via service worker, context-isolation bypass, command-line-switch injection. Fix: `electron@39.8.9` (patch bump). | S | UAF bugs = random renderer crashes reported in the wild. Any of the reviewed Electron CVEs can trip Steam's review or a post-launch AV flag. |
| P0-6 | Steam identity | `steam_appid.txt` | Value `4326170` is committed. Needs confirmation that this is the live Steamworks AppID and not a placeholder. | S | Wrong AppID → achievements/leaderboards/rich presence all silently no-op. Would ship "broken Steam features" even with SDK integrated. |

---

## P1 — Must-fix before Steam

Not technically crashing, but will earn refunds, poor reviews, or
store-policy violations if left in.

| # | Area | File | Description | Effort | Why it matters for Steam |
| --- | --- | --- | --- | --- | --- |
| P1-1 | Deps / license | `package.json` (dev: `electron-builder-notarize@1.5.2`) | Deprecated; pulls critical-severity `handlebars` transitively. Replace with `@electron/notarize` and call it directly from an `afterSign` hook. | M | Package removes from the macOS build chain the ability to ship — see P0-2. Also clears the critical `handlebars` CVE. |
| P1-2 | Runtime logging | 28 files incl. `engine/match-engine.ts`, `engine/match-simulation.ts`, `engine/atomic-week-processor.ts`, `store/game-store.ts`, `components/layout/GameShell.tsx`, `components/ui/bulk-actions.tsx`, `components/ui/error-boundary.tsx`, `hooks/use-local-storage.ts` | 150 raw `console.*` calls ship to production renderer console (70 log, 30 warn, 48 error). `lib/logger.ts` + `lib/debug-logger.ts` already exist as proper sinks. | M | Player-visible when they open DevTools (Steam overlay users often do). Floods logs from `app/api/console-log/route.ts` → disk. Clear sign of "unfinished build" to reviewers. |
| P1-3 | Correctness | 14 sites across `app/*/page.tsx`, `lib/performance.ts`, `components/**/*` | `react-hooks/exhaustive-deps` warnings. Missing deps include `loadSaves`, `getAutoContract`, `isPlayerScouted`, `getSynergy`, `financeLedger`, `marketStaff`, `eventsLog`, etc. | M | Stale closures in a save-heavy game = "I pressed the button but nothing happened" bugs that are maddening to reproduce. Steam reviews will call these out as "saves don't update". |
| P1-4 | Bundle weight | `app/player/[id]/page.tsx` (666 kB first-load), `app/staff/page.tsx` (532 kB), `app/desktop/page.tsx` (490 kB), `app/match/[id]/live/page.tsx` (100 kB page chunk / 404 kB FL) | Oversized first-loads cause visible stall on cold navigation under Electron's synchronous resource pipeline. | L | Steam Deck (4-thread Zen 2, 16 GB) is a priority target; 666 kB first-load + Next hydration under Electron is 500-800 ms of jank on first click. Perceived-performance complaint in reviews. |
| P1-5 | Security (packaging) | `electron/main.js:773-783` | CSP allows `'unsafe-inline'` and `'unsafe-eval'` in `script-src`. `unsafe-eval` is needed by Next dev, but the production Electron build can tighten to `'self' 'unsafe-inline'` or nonces. | M | Steam does not require CSP, but `unsafe-eval` combined with the Electron renderer CVEs (P0-5) is an auditor flag. |
| P1-6 | Data integrity | `store/game-store.ts` (6 194 lines, 142 `any`), `store/types.ts:88` (`financeLedger: any[]`), `store/slices/events-slice.ts` | The main persisted store + finance ledger are typed as `any`. Save-migration logic in `CURRENT_SAVE_VERSION` pipeline cannot catch shape drift at the compiler level. | L | Save-corruption bugs are the #1 refund driver for management sims. A year from now, a field rename silently breaks every existing save. Typing the ledger + the persisted slices is the cheapest insurance. |
| P1-7 | Test coverage | `__tests__/` (engine-only); no component or E2E | Jest covers engine, chemistry, radar, critical save/load path. No React component tests, no Playwright suite despite the dependency being installed. | L | The critical-path test protects the engine; it doesn't protect the **save → load → advance-week → save** loop through the UI, which is where players actually hit corruption. Steam reviews will report what players click, not what engines compute. |
| P1-8 | Electron security flags | `electron/main.js:758-766` | `nodeIntegration: false`, `contextIsolation: true` — good. Missing `sandbox: true`, `webSecurity: true` (explicit), `allowRunningInsecureContent: false`. | S | Defense-in-depth; mitigates several of the Electron CVEs in P0-5. Cheap to add. |

---

## P2 — Should-fix

Quality and maintainability. Worth landing for review polish but not
individual refund risks.

| # | Area | File | Description | Effort | Why it matters for Steam |
| --- | --- | --- | --- | --- | --- |
| P2-1 | Image policy | `components/ui/BugReportButton.tsx`, `components/ui/ImageUploader.tsx`, `components/ui/SocialFeed.tsx`, `components/ui/Taskbar.tsx`, `components/ui/TeamLogoDisplay.tsx`, +34 more | 39 `@next/next/no-img-element` warnings. Should use `next/image`. | M | Bundle size + LCP; contributes to the P1-4 bundle weight. |
| P2-2 | Accessibility | 5 `jsx-a11y/alt-text` warnings in the above components | `<img>` missing `alt`. | S | Steam doesn't gate on a11y, but screen-reader-friendly games get featured. |
| P2-3 | JSX hygiene | `components/ui/tutorial.tsx` and 5 others | 23 `react/no-unescaped-entities` warnings. | S | Cosmetic; mostly in tutorials / marketing copy. |
| P2-4 | Type hygiene | 586 `any` total; top offenders: `store/game-store.ts` (142), `hooks/useLiveMatch.ts` (36), `app/tournaments/[id]/page.tsx` (36), `app/desktop/page.tsx` (31), `components/desktop-apps/AcademyApp.tsx` (29), `components/player/player-detail.tsx` (24) | `any` everywhere. No `@ts-ignore` — so this is the escape hatch. | L | Long-term maintainability. Major refactor won't happen before launch, but the top 5 files (~278 `any`s) are worth tightening. |
| P2-5 | Store monolith | `store/game-store.ts:301` (inline `GameStoreState`) vs `store/types.ts:41-150` (10 slice interfaces) | Two sources of truth for the store shape. Slices under `store/slices/` exist but the main file still holds an inline definition and the full reducer. | L | High-risk refactor area; defer until post-launch unless a specific bug forces it. |
| P2-6 | Dev-dep security | `package.json` dev: `xlsx` (high sev, no fix available) | `xlsx` has known prototype-pollution + ReDoS with no upstream patch. It's in devDeps and should not ship (confirmed by `build.files` excludes). Consider replacing for CI safety. | M | Doesn't affect the shipped game; but CI running on PRs with attacker-controlled `.xlsx` is a supply-chain concern. |
| P2-7 | Dep majors | `package.json` (react 18→19, next 14→16, ts 5→6, tailwind 3→4, zod 3→4, lucide-react 0.562→1.8, recharts 2→3, sonner 1→2, eslint 8→10, jest 29→30, immer 10→11) | Many majors behind. All require migration work. | L | Don't attempt before v1.0. Plan for v1.1 / post-launch. |
| P2-8 | Error tracking | `lib/error-tracking.ts`, `app/error.tsx`, `components/ui/error-boundary.tsx`, `components/layout/ErrorBoundary.tsx` | Two ErrorBoundary components + a `lib/error-tracking.ts`. Unclear which is canonical; `app/layout.tsx` wires `components/ui/error-boundary.tsx`. | S | Consolidate to one. Dead code invites regressions. |
| P2-9 | Console-log proxy | `app/api/console-log/route.ts` | In-app endpoint that persists console output server-side. Useful for debug builds; suspicious in a shipped game. | S | Confirm it's gated behind dev-mode flag; otherwise strip from production asar. |
| P2-10 | Unused packages | `package.json` | `node-fetch@2.7.0` in devDeps alongside native `fetch`; `playwright` installed but no E2E suite wired. | S | Reduce install/build time and disk footprint. |

---

## P3 — Nice-to-have

| # | Area | File | Description | Effort | Why it matters for Steam |
| --- | --- | --- | --- | --- | --- |
| P3-1 | Style | `components/transfer/NegotiationModal.tsx:207`, `lib/social-generator.ts:98` | `prefer-const` warnings. | S | Pure cosmetic. |
| P3-2 | Docs | repo root (`BUILD_FIX_GUIDE.md`, `PROJECT_COMPLETE.md`, `FINAL_SUMMARY.md`, `RELEASE_HARDENING_REPORT.md`, `PRODUCTION_READY.md`, …) | ~20 overlapping status docs in `docs/` + root. | S | Not player-facing. Consolidate for the next contributor's sanity. |
| P3-3 | Dead scripts | `fix_roles_v2.py`, `get_roster.py`, `list_teams.py`, `remove_backgrounds.py` | Loose Python utilities at repo root. | S | Exclude from release artifacts; already outside `build.files`. |
| P3-4 | Build cache | `.next/cache` (537 MB) | Cache is local-only; not shipped. | — | No action needed. |
| P3-5 | Lint major | `eslint@8.57.1` end-of-life | Migrate to ESLint 9+ / flat config eventually. | M | Post-launch. |

---

## Summary

| Priority | Count | Total effort |
| --- | --- | --- |
| P0 | 6 | ~1.5 days |
| P1 | 8 | ~4 days |
| P2 | 10 | ~1.5 weeks (skipping P2-4, P2-5, P2-7 majors) |
| P3 | 5 | ~1 day |

**Recommended ship-gate:** all P0 closed, P1-1/1-2/1-3/1-8 closed,
remaining P1 items tracked but acceptable if regression-tested.
P2/P3 can land post-launch via patch.

Current repo state is **not yet shippable** — blockers are packaging
icons + macOS signing + the next/electron CVE patch bumps. None of the
blockers is architectural; all are 1-day fixes plus signing-cert
procurement.
