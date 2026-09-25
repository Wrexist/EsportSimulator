# L06 — Dependency and runtime security

13 September 2026. **Partial; Windows 1.0 remains NO-GO.** All 47 baseline npm package findings have been resolved, including all seven production findings. Fresh full and production audits both report zero known vulnerabilities. No audit exclusions, force fixes or peer-dependency bypasses were used. Acceptance stays open until the actual Windows package is audited and exercised, and prerequisite L02 is complete.

## Changes and version decisions

- Next 14.2.35 → 15.5.25 and matching analyzer/lint configuration. Next 14 is unsupported; 15 is maintained. React/DOM → 19.2.8, with corresponding types, Fiber 9.7.0 and Drei 10.7.8. Fiber's current peer range excludes React 19.3. Match result/live routes now use `useParams`; icon types, SVG text alignment and an uninitialized callback ref were adapted to React 19. The existing veto route already handles asynchronous parameters.
- Electron 39 → 44.3.0; compatible builder and transitive patches. Its bundled Node 24.20.0 successfully loads the Steamworks native binding and runs the local production Next server.
- Sharp 0.35.4 replaces the vulnerable native image codecs. IMG.LY's nested Sharp, Zod 3.25.76 and Lodash 4.18.1 are explicitly overridden and exercised with synthetic image/mask inputs. This is developer asset tooling; model inference itself was not rerun.
- PostCSS 8.5.28 is pinned at the root and under Next. Next 15 still pins an old nested copy without this override; the production build verifies the replacement works.
- SheetJS 0.20.3 comes from its official distribution tarball because the npm `xlsx` release is outdated. Workbook export/import round trip passes.
- Removed unused `@huggingface/transformers`. Its vulnerable ONNX 1.24/archive dependency chain disappears; IMG.LY retains its compatible ONNX 1.17.3. No source imports of Transformers were found in application, engine or scripts.

Primary references: [Next support policy](https://nextjs.org/support-policy), [Next 15 migration](https://nextjs.org/docs/app/guides/upgrading/version-15), [Fiber v9 migration](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide), [Electron releases](https://releases.electronjs.org/), [Electron 44 changes](https://www.electronjs.org/blog/electron-44-0), [Sharp security advisory](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), [SheetJS installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [PostCSS releases](https://github.com/postcss/postcss/releases), [Lodash releases](https://github.com/lodash/lodash/releases). Recheck support before launch: Next 15 is a maintenance bridge, not a promise of indefinite support. ESLint 8, Recharts 2 and legacy notarization dependencies emit deprecation notices; their maintenance migrations remain scheduled work despite the clean vulnerability scan.

## Evidence

| Check | Result |
|---|---|
| Reproducible install | `npm ci` exits 0; 1,090 packages installed. Lockfile byte-identical to the independently resolved lock. [Log](L06-install.txt) |
| Installed graph | `npm ls --all --json` exits 0, no invalid peer dependencies; raw tree retained at `tmp/l06-installed-tree.json`. |
| Full / production audit | Both exit 0 with zero findings. [Full](L06-dependencies.json), [production](L06-runtime-dependencies.json) |
| Original finding dispositions | All 47 package rows, old/current versions, source links and reachability limits. [Table](L06-TRIAGE.md), [data and lock hash](L06-TRIAGE.json) |
| Full regression | **1,311 tests / 133 suites passed**. Includes save snapshots/migrations, worker, identity and portrait safeguards. [Log](L06-regression.txt) |
| Clean types | `npm exec -- tsc --noEmit --incremental false --pretty false` exits 0 after build. |
| Production build | `npm run build` exits 0; 40 pages generated. Lint 0 errors, 154 warnings retained. Actual worker starts without browser globals: `3444.2cf18e741c0b83e6.js`. [Log](L06-build.txt) |
| Image / spreadsheet compatibility | Synthetic PNG mask and visible color preservation, invalid model rejection, lossless WebP, XLSX round trip and ONNX binding load pass. [Log](L06-image-spreadsheet.txt); repeat with `node scripts/launch/dependency-smoke.cjs`. |
| Electron runtime | Real Electron 44.3.0 binary, Node 24.20.0, Chromium 152.0.7977.78; native Steamworks binding loads; local production `/main-menu` returns 200. [Report](L06-electron-server.json) |
| Browser career | Existing QA career restores custom WETERMELON identity, $501,400, week 2/day 1; direct HiCkBNk profile and Mental tab work. [Screenshot](L06-profile.png) |
| Map Studio / lab | Existing 142-mark Mirage draft restored, including spawn/site areas; imported utility visible. Saved crouch route finishes at 6.6 s across 7 surfaces. [Screenshot](L06-lab.png) |
| Release guard | Correctly rejects absent `steam_appid.txt`. [Log](L06-package-guard.txt). No guard bypass, fabricated App ID or release artifact produced. |

Build ID: `jVCdqGfKQbY4RZYlQsqeT`. Preview is running at `http://localhost:3210`. Schema remains 7. Mirage source draft SHA-256 remains `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`. Original and cleaned portrait assets were not regenerated in this package.

One type-check attempt overlapped build cleanup and failed on disappearing `.next/types` files; the independent clean check was rerun successfully after build. The full regression run preceded final type-only migration annotations. The browser schedule briefly shows unhydrated defaults before restoring the correct balance/date; this is remaining hydration/UI acceptance debt, not a verified durable balance change.

## Remaining acceptance and next work

1. Provision the real Steam App ID, build the Windows x64 package, inventory/audit actual ASAR/unpacked dependencies, and verify clean-machine/disconnected startup. npm's production classification is not proof of packaging contents. Electron is runtime software despite being declared a dev dependency.
2. Exercise the native window, preload/IPC, close/save/cancel, Steam unavailable behavior and GPU/3D rendering. The Electron smoke deliberately runs as Node; it does not certify BrowserWindow behavior or online Steam features.
3. Finish L02 failure acceptance and L03 durable save/recovery scenarios, including old exports and interrupted writes. Current browser checks used an existing QA career; no full new-career/match/week journey was repeated in this package.
4. Next independent package: **L07 — desktop/IPC boundary hardening**, followed by **L08 — content provenance and distribution rights**, then L03. Keep maintenance migrations and L06 native acceptance attached to the next Windows candidate.

## Migration and rollback

Dependency inputs before this package are retained in `tmp/l06-backup/package.json` and `package-lock.json`; do not restore the entire repository or discard unrelated dirty changes. A rollback must restore both dependency files, revert only the L06 route/type migrations, run `npm ci`, rebuild and revalidate. It would reintroduce known vulnerabilities and is not a release solution. No save schema or data migration was added here. Durable portrait backups remain outside the project as recorded in the identity report. No commit, upload, publication or Steam account action was performed.
