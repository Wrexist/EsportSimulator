# L30 ? Steam integration and L29 follow-up

14 September 2026. **Partial; not release accepted.** Windows 1.0 target. No Steam upload, achievement/stat mutation, Cloud write/delete, Workshop subscription or publication was performed against the owner's account. Owner careers were not opened or changed. Both Mirage drafts and base identity snapshots match the preceding hashes.

## Implemented

- Fixed the installed steamworks.js 0.4.0 binding mismatch: `achievement`, not `achievements`; integer stats use `getInt`/`setInt`. Zero stays zero. Set/store/unlock failures now propagate instead of being reported as successes. Stats use best-career maxima, with a positive minimum for peak ranking, and values are bounded to nonnegative signed integers. Partner definitions still need to agree with these semantics.
- Invalid/missing/Spacewar App IDs no longer silently initialize the wrong game. Current configured ID is 4326170.
- Achievement caches are isolated by identified Steam account, with separate local career/menu caches when no account is available. Rejected unlocks retry for the same known account; concurrent attempts coalesce. A cache miss cannot inherit another career's achievements. Unknown offline progress is not blindly replayed into the next Steam account. Local progression remains available when unlocks fail.
- Cloud respects account/app enabled flags. Bounded Cloud file discovery exposes cloud-only careers in Load Game, including before another Steam feature has initialized the bridge. Stored owner receipts prevent a known filename from being written/read/deleted through another identified account on the same installation.
- Divergent valid local/Cloud saves return CLOUD_CONFLICT instead of automatically picking a newer timestamp or week. Load Game offers This PC / Steam Cloud / Cancel. Choosing preserves both original copies in recovery slots before loading. The slots participate in recovery and explicit career deletion. Failed same-career switching no longer reports success simply because its ID is already active.
- Upload refuses to replace an existing remote file that differs from the last copy observed in this session. Accepted replacements first retain the preceding bytes in an account-scoped local recovery file. A new session must read an existing remote copy before changing it. Concurrent writes on this installation are rejected while a write is in progress; identity is rechecked around reads/writes.
- Rich presence now submits the `#Status` localization token. The partner configuration must contain that token; actual rendering is unverified.

## L29 follow-up

- Added a native Choose mod folder import path feeding the existing preview/explicit install flow.
- PNG/JPEG/WebP image bytes and database metadata are validated before a complete immutable local bundle is made available. Referenced images are pinned beneath a content-derived bundle ID, so a saved career retains its artwork when another database is selected. Limits: 8 MiB/image, 4096 px per dimension, one frame, 512 MiB total and 12,000 referenced assets; existing path and database bounds still apply.
- Pinned bundle serving is independent of the active database. Database rollback retains earlier URLs. Workshop activation pins the installed version for offline use; selecting a missing cached item fails closed instead of activating community data. ?Use installed version? deliberately pins an update for new careers while retaining earlier bundles.
- Clarified that imported tournament definitions are stored but the running career calendar still uses built-in competition rules. This is an existing functional gap, not finished tournament mod support.
- The separate real-identity package remains unpublished. 198 team identities/logos, 1,368 player identities and 1,323 available portraits passed a fresh isolated import/career/base-fallback check. 45 missing/corrupt portraits still require repair. No owner import was installed.

## Evidence and exact scope

| Check | Result |
|---|---|
| Full Jest suite | 1,650 tests / 172 suites pass; L30-tests.json |
| TypeScript | `npm run type-check` passes; L30-types.log |
| Production build | WOMDt4J9XzaXV0mhJvMsO; L30-build.log |
| Bundled worker startup | Pass, 3816.711a4bcdc480627e.js |
| Real Electron IPC transport | Electron 44.3.0, isolated sandbox/preload/origin tests pass; L30-native-ipc.json. Uses synthetic Steam services, not real Cloud acceptance. |
| Actual Steam client, read-only | Connected; running App ID 4326170; owned/subscribed; installed Steam build 23556629; Cloud enabled for account and app. L30-steam-readonly.json. This is not the local Next build or a packaged candidate. |
| Real-data mod source integration | 198 teams / 1,368 players / 1,323 portraits; L30-mod-smoke.json. Synthetic isolated app services, no owner storage. |
| Source preservation | L30-preserved-data.json, all four hashes unchanged |
| Packaging App ID check | Pass, 4326170 |
| Content gate | Still blocks 4,988 unresolved/changed content items. New marketing art has its own pending-review inventory; it is outside this runtime count. |

Regression cases cover SDK return values, zero/high-water stats, known-owner rejection, account/cache separation, retry and concurrent unlocks; Cloud-only discovery, corruption, explicit conflict choices, unseen-remote upload rejection and retained originals; media validation, concurrent pinning, replacement/rollback and offline cached Workshop selection. These tests do not substitute for platform/UI acceptance.

## Steam store materials

[Local visual preview](../../../marketing/steam-2026-09-14/preview.html), [copy](../../../marketing/steam-2026-09-14/description.md), [delivery notes](../../../marketing/steam-2026-09-14/README.md), [asset inventory](../../../marketing/steam-2026-09-14/asset-inventory.json).

Four original built-in imagegen PNG masters: title/capsule concept, Build Your Squad, Run the Club, Shape Your Season. Production briefs and source output paths are retained. The club image received a targeted incidental-lettering cleanup. These are promotional illustrations, not game screenshots. Actual master sizes: 1656 ? 950 and three at 1956 ? 804. Exact Steam capsule adaptations, current gameplay screenshots and final visual/content approval remain. A 202-character short description, feature copy and text-only Steam BBCode are ready for review. The draft promises management features, not photorealistic gameplay, released Workshop, licensed teams or verified Cloud/achievements.

## Still required

1. Obtain an authorized partner definition/configuration export and reconcile every achievement ID/condition, stat meaning, Cloud quota, launch option and rich-presence token. Installed SDK has no leaderboard API; do not advertise leaderboards without a supported implementation and real tests.
2. L31: build and test the actual Windows shipping artifact. Then test overlay, presence, every achievement/stat condition, native callback/store acknowledgement and offline-to-online behavior on the candidate. The read-only probe does not prove server-side write acknowledgement or achievement correctness.
3. Two-device and two-Steam-user Cloud campaign with clock skew, corruption, disconnection, quota failure and deliberate conflict choices. The new UI is not visually accepted yet. Local career storage is still shared at the OS-user app-data level; filename receipts do not fully segregate account-owned local careers. Legacy files without receipts bind at first write and have no proven historical owner.
4. Upload now checks the current SDK view against the last observed content and keeps a previous-copy backup, but Steam provides no cross-device atomic compare-and-swap. An unsynced second machine or a change after the read can still race the write. Durable retry, a visible Cloud-sync failure indicator, merge/ancestry policy and a UI for the account-scoped native recovery copies remain open. Do not call the lifecycle loss-proof. Account changes during native calls need real testing. Offline unscoped/legacy achievement migration and durable stat retries remain to design/test.
5. Test native folder selection and all import/Workshop UI on Windows. Existing careers with legacy unpinned URLs are not automatically migrated; an available original source is required. Cache retention has no reference-counted cleanup/export UI yet. Mod art is local to the installation and is not bundled into Cloud saves; another PC needs the same bundle for retained portraits. Real subscribe/update/unsubscribe/download-failure acceptance remains open. Keep the real-identity mod separate and unpublished until content clearance and its release work are done.
6. Earlier full 5v5 integration, Mirage height/area review, calibration, identities and human player/UI acceptance remain open. No launch or content approval is claimed.

## Migration and rollback

No save schema version was changed. Valid divergent originals are copied to `_local`/`_cloud` recovery slots before an explicit selection; normal backups remain. Achievement cache v2 is new; old cache keys are not deleted. Pinned URLs are persistent local content references; reverting to an older binary without that route would require restoring/exporting the corresponding old mod before portraits can render. Retain bundles and original mod folders. No recursive cleanup of user data was performed.

## Primary references

[Steam statistics/achievements](https://partner.steamgames.com/doc/features/achievements/stats_guide), [Steam asset dimensions](https://partner.steamgames.com/doc/store/assets), [graphical asset rules](https://partner.steamgames.com/doc/store/assets/rules), [written descriptions](https://partner.steamgames.com/doc/store/page/description). SDK compatibility was checked against the installed `node_modules/steamworks.js/client.d.ts` and index implementation.

Preview refreshed at http://localhost:3210, process 447176, using the build above. HTTP checks are not visual UI acceptance.

**Next: L31 ? produce and test the actual Windows shipping artifact**, alongside the remaining L29/L30 work above. This increment is complete as recorded; L30 acceptance remains partial.
