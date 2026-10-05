# IPC inventory

All 45 channels use the same main-process sender gate: exact trusted WebContents object, current main frame, and exact selected localhost origin on both frame and contents. Null/destroyed frames, other windows, host aliases, other ports, credentials, non-HTTP origins and mod-asset documents fail closed. Invalid payloads return the channel fallback before the handler runs. No raw ipcRenderer or event object is exposed by preload.

Native game storage is limited to esports_* keys (ASCII letters/digits/underscore/hyphen, bounded length) and cs2_manager_career_profile. Each career copy is its own atomically replaced file under userData/saves/<careerId>/ (career IDs are whitelisted and Windows device names rejected); other game keys live under userData/game-storage/. The legacy userData/config.json is only read, once, to import older saves. Window configuration lives in userData/settings.json, outside renderer authority, and renderer clearing does not touch it. Community writes affect four known JSON files under userData/mods/community; Workshop reads use the SDK-selected installed directory. Logs live under userData/logs; GPU writes affect only userData/gpu-crash-flag. See the source modules for exact predicates and Steam allowlists.

| Channel | Schema / successful return | Rejection | Authority | Handler |
|---|---|---|---|---|
| app-close-cancelled | no arguments → boolean | false | Pending native close handshake | electron/main.js:472 |
| app-close-confirmed | no arguments → boolean | false | Pending native close handshake | electron/main.js:461 |
| app-close-received | no arguments → boolean | false | Pending native close handshake | electron/main.js:455 |
| app-get-user-data-path | no arguments → string / null | null | User-data path disclosure | electron/main.js:362 |
| gpu-get-mode | no arguments → mode / null | null | GPU flag read | electron/main.js:428 |
| gpu-set-mode | compatibility / performance → boolean | false | Fixed GPU flag file | electron/main.js:432 |
| log-write-error | message/stack ≤8000 UTF-8 bytes; fixed level enum → boolean | false | Rotated error logs only | electron/main.js:484 |
| mod-clear | no arguments → boolean | false | Four community JSON files only | electron/main.js:746 |
| mod-exists | no arguments → boolean | false | Active mod metadata | electron/main.js:690 |
| mod-install | complete database JSON up to 16 MiB | false | Atomic community database replacement with backup | electron/main.js:726 |
| mod-path | no arguments → string / null | null | User-data path disclosure | electron/main.js:748 |
| mod-read | four fixed JSON filenames → bounded string / null | null | Contained active mod files | electron/main.js:701 |
| mod-read-folder | native folder chooser to validated pinned database JSON | null | Read selected mod media; retain local image bundle for preview | electron/main.js:739 |
| mod-restore | no arguments | false | Restore previous community database | electron/main.js:745 |
| mod-write | fixed filename + JSON array/manifest object ≤16 MiB → boolean | false | Community mod JSON only | electron/main.js:713 |
| steam-cloud-delete | save_*.json → boolean | false | Steam cloud namespace; throttled | electron/steam.js:505 |
| steam-cloud-list | no arguments to bounded save filenames | [] | Current Steam account cloud namespace, receipt filtered | electron/steam.js:425 |
| steam-cloud-read | save_*.json → bounded string / null | null | Steam cloud namespace; throttled | electron/steam.js:472 |
| steam-cloud-write | save_*.json + string ≤32 MiB UTF-8 → boolean | false | Steam cloud namespace; throttled | electron/steam.js:434 |
| steam-get-id | no arguments → string / null | null | Steam identity read | electron/steam.js:268 |
| steam-get-persona-name | no arguments → string / null | null | Steam identity read | electron/steam.js:280 |
| steam-get-rich-presence | status / steam_display → string / null | null | Presence cache | electron/steam.js:419 |
| steam-get-stat | bounded stat identifier → number / null | null | Steam stat allowlist | electron/steam.js:292 |
| steam-is-achievement-unlocked | allowlisted identifier → boolean | false | Steam achievements | electron/steam.js:359 |
| steam-set-achievement | allowlisted identifier → boolean | false | Steam achievements | electron/steam.js:342 |
| steam-set-leaderboard-score | allowlisted name + int32 → boolean | false | Steam leaderboard; throttled | electron/steam.js:373 |
| steam-set-rich-presence | status / steam_display + string ≤255 bytes / null → boolean | false | Bounded presence cache and Steam | electron/steam.js:396 |
| steam-set-stat | allowlisted name + finite 32-bit range value → boolean | false | Steam stats; throttled | electron/steam.js:304 |
| steam-store-stats | no arguments → boolean | false | Steam stats; throttled | electron/steam.js:329 |
| storage-clear | no arguments → boolean | false | Game keys only; preserves private window settings | electron/main.js:580 |
| storage-get-all-keys | no arguments → string[] | [] | Game keys only | electron/main.js:589 |
| storage-get-item | allowed storage key → string / null | null | Game storage namespace | electron/main.js:541 |
| storage-remove-item | allowed storage key → boolean | false | Game storage namespace | electron/main.js:570 |
| storage-set-item | allowed key + string ≤32 MiB UTF-8 → boolean | false | Game storage namespace | electron/main.js:556 |
| window-get-size | no arguments → {width,height} / null | null | Window read | electron/main.js:406 |
| window-is-fullscreen | no arguments → boolean | false | Window read | electron/main.js:417 |
| window-set-fullscreen | boolean → boolean | false | Window and private window settings | electron/main.js:371 |
| window-set-size | two integers 1..16384 → boolean; clamped to UI minimum | false | Window and private window settings | electron/main.js:385 |
| workshop-available | no arguments → boolean | false | Workshop status | electron/steam.js:530 |
| workshop-get-active | no arguments → active pointer / null | null | Fixed active pointer JSON | electron/steam.js:538 |
| workshop-list | no arguments → bounded item list | [] | Subscribed Workshop manifest reads | electron/steam.js:534 |
| workshop-open | optional uint64 ID → boolean | false | Fixed HTTPS steamcommunity.com URL | electron/steam.js:575 |
| workshop-set-active | community or workshop + uint64 decimal ID → boolean | false | Fixed active pointer JSON | electron/steam.js:542 |
| workshop-subscribe | uint64 decimal ID → boolean | false | Steam Workshop subscription | electron/steam.js:558 |
| workshop-unsubscribe | uint64 decimal ID → boolean | false | Steam Workshop subscription | electron/steam.js:569 |

Filesystem controls: JSON reads are bounded (16 MiB overlays, 256 KiB Workshop manifest, 4 KiB active pointer); mod/pointer writes use atomic replacement. Links/junctions within checked paths are rejected. Mod HTTP assets accept GET/HEAD only, approved image extensions, nosniff and a sandboxed document policy. Static malformed mod JSON never reaches the simulation without the existing snapshot validator. These checks do not isolate the game from another OS process that already controls the same user account.
