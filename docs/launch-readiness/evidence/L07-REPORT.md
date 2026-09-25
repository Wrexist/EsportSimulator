# L07 — Electron, IPC and local boundaries

13 September 2026. **Partial; release acceptance remains open.** The implementation and source integration checks are complete. All 41 IPC channels now use a shared sender gate and explicit payload contracts. A real Electron 44 probe verifies trusted and untrusted window behavior; the Windows package itself is still absent because the real Steam App ID file is missing. L06 is also partial, so L07 is not accepted as a release gate.

## Verified findings and fixes

| Finding | Resulting behavior |
|---|---|
| Storage, window, GPU, log and mod handlers lacked sender checks; Steam trusted only a WebContents ID. | Every channel checks the exact trusted WebContents object, its current main frame, and the selected localhost origin on both frame and contents. Other windows, child frames, null/destroyed frames, alternate ports/host aliases and mod-asset documents are denied. |
| Renderer storage accepted arbitrary electron-store keys and clearing removed native settings too. | Game keys are restricted to the existing game namespace and manager profile key. Reading/listing/clearing cannot access private window configuration. Existing game key names and save schema 7 remain unchanged. |
| Several privileged payloads were unbounded or loosely coerced. | Explicit argument counts, booleans/enums, bounded integer window sizes, identifier allowlists, uint64 Workshop IDs, fixed presence keys and UTF-8 byte limits. Save/Cloud writes: 32 MiB; mod JSON: 16 MiB. Error reports are bounded and rate-limited. |
| Mod JSON reads/writes followed links; writes had no main-process JSON/size checks; clear removed unrelated files. | Reject traversal, alternate-stream paths and symlinks/junctions; bound reads; reject malformed/wrong-shaped/unsafe-key JSON; atomically replace four known community JSON files. Clearing preserves unrelated notes/assets. The existing full snapshot validator still runs before gameplay uses an overlay. |
| Mod SVG documents could inherit the app's script policy. | Only approved image types, GET/HEAD, nosniff and sandboxed document CSP. Mod-asset documents cannot become trusted app navigation targets. |
| The loopback server lacked Host/Origin checks and could open the wrong port after contention. | Reject unexpected Host, foreign Origin and cross-site requests. Listen only on 127.0.0.1; remove failed-port callbacks and derive the launch URL from the successfully bound port. Dev startup also uses its explicitly selected port without silently trusting a second server. |
| Production CSP retained an unproven eval exception. | Real production menu, Map Studio, Mirage geometry and actual worker pass without eval. Remove unsafe-eval in packaged production; retain it for Next development. Explicitly disallow frames, objects, base URLs and form submissions; permit same-origin workers. |
| Cloud handlers and service ignored false write/delete results. | Propagate explicit acknowledgement from Steam through IPC and the game service. Rejected Cloud operations return false; local saves remain durable and usable offline. |
| Launch error HTML escaped JavaScript quotes rather than HTML. | Escape markup before displaying error text. Bound diagnostic history, and validate paths for renderer-driven log/GPU/config writes. |

The full [IPC inventory](L07-IPC-INVENTORY.md) lists each channel's schema, return/failure contract and authority, with [machine-readable entries](L07-IPC-INVENTORY.json). The inventory generator verifies that every registered handler has a contract; tests also cover every preload invocation.

## Validation

Exact final check results and source/build identities are recorded in [L07-checks.json](L07-checks.json). Logs: [regression](L07-regression.txt), [targeted handlers and Cloud](L07-cloud-tests.txt), [types](L07-types.txt), [lint](L07-lint.txt), [production build/worker](L07-build.txt).

The real [Electron IPC smoke](L07-native-security.json) uses sandboxed, isolated hidden windows with the actual main/Steam handler registration code. Synthetic storage and a fake Steam SDK prevent touching owner careers or making account calls. It verifies successful authorized game storage, protected native settings, malformed input rejection, blocked renderer navigation/popups, denied access from a second real WebContents, denied access after the original window changes origin, and rejection of a foreign Host on the real loopback listener. Child-frame checks run against registered handlers in the unit harness; they are not presented as a complete hostile-frame packaged penetration test.

The [production CSP smoke](L07-native-csp.json) runs the compiled Next build and actual preload under Electron 44. It loads the main menu, Map Studio and Mirage lab, verifies reference geometry becomes available, and starts the actual compiled week worker without CSP violations or console errors. It retains necessary inline bootstrap/style allowances. This covers these routes and worker startup, not every application interaction or 3D/GPU mode.

The owner Mirage draft hash remains `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`. No portrait or identity data was regenerated. All native probe files live in unique `tmp/l07-native` / `tmp/l07-csp` directories; owner save directories and browser storage were not cleared.

Two probe setup issues were corrected and retained in temporary logs: the shell inherited ELECTRON_RUN_AS_NODE=1, which initially launched Node instead of Electron; the navigation probe initially waited for will-navigate after the earlier will-frame-navigate event had already cancelled navigation. Final runs use the real Electron app runtime and inspect the first cancellable navigation event. No production control was weakened to pass the checks.

## Scope, remaining acceptance and next work

- Build and inspect the actual Windows x64 ASAR/unpacked artifact once the real Steam App ID is provisioned. Repeat navigation, permission, IPC, local-port, CSP and save/close/cancel acceptance on that exact candidate. The probes use real Electron transport and rendering, but synthetic storage/SDK and a test-created BrowserWindow; they do not certify the complete packaged startup/lifecycle.
- Complete L06 packaged dependencies/offline startup and L02 fault evidence. Real Steam Cloud rejection/recovery across two machines, Workshop and other online SDK behavior remain unverified. Local safety tests do not constitute Steam account acceptance.
- Same-account hostile OS processes are outside these filesystem protections; path validation does not claim to eliminate concurrent filesystem races by an attacker already controlling that user account. A compromised trusted main renderer still owns its authorized game-save namespace. Per-write limits do not impose a total lifetime storage quota.
- CSP unsafe-inline remains for Next bootstrap/flight scripts and React styles. A nonce/hash migration needs all-route acceptance. GPU modes, permissions and native failure dialogs still need packaged/manual checks. Port changes can select a different browser-storage origin; durable native Map Studio origin/recovery behavior belongs in L03/L31 acceptance.

**Next: L08 — content provenance and distribution rights. Then L03 — save, migration and recovery trust.** Keep L06/L07 packaged acceptance attached to the next Windows candidate.

## Files, migration and rollback

Main changes: `electron/main.js`, `steam.js`, `app-origin.js`; new `ipc-policy.js`, `local-files.js`, `local-server.js`, `content-policy.js`, `renderer-security.js`; Cloud acknowledgement propagation in `engine/steam-service.ts`. Preload's existing narrow API remains unchanged in this package. Tests live in `__tests__/electron-ipc-boundaries.test.ts`, `electron-local-server.test.ts`, updated origin and Cloud round-trip suites; native probes and inventory generator live in `scripts/launch`.

No save schema/data migration is needed. Existing backups are in `tmp/l07-backup` for main/Steam/preload; preserve all earlier unrelated work. To roll back, revert only L07's edits and helper wiring, rebuild and rerun affected checks. A rollback restores known security gaps and is not a release solution. No commit, publish, upload or Steam account action was performed.

Primary references: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [WebContents navigation/event contracts](https://www.electronjs.org/docs/latest/api/web-contents), [sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox), and the installed `steamworks.js/client.d.ts` return signatures. Electron documents that cancelling an earlier navigation event prevents later events; the native test now verifies that ordering directly.
