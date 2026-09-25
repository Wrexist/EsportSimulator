# IPC inventory

All 41 channels use the same main-process sender gate: exact trusted WebContents object, current main frame, and exact selected localhost origin on both frame and contents. Null/destroyed frames, other windows, host aliases, other ports, credentials, non-HTTP origins and mod-asset documents fail closed. Invalid payloads return the channel fallback before the handler runs. No raw ipcRenderer or event object is exposed by preload.

Native game storage is limited to esports_* keys (ASCII letters/digits/underscore/hyphen, bounded length) and cs2_manager_career_profile in userData/config.json. Renderer clearing does not clear private window configuration. Community writes affect four known JSON files under userData/mods/community; Workshop reads use the SDK-selected installed directory. Logs live under userData/logs; GPU writes affect only userData/gpu-crash-flag. See the source modules for exact predicates and Steam allowlists.

| Channel | Schema / successful return | Rejection | Authority | Handler |
|---|---|---|---|---|
| app-close-cancelled | no arguments → boolean | false | Pending native close handshake | electron/main.js:421 |
| app-close-confirmed | no arguments → boolean | false | Pending native close handshake | electron/main.js:410 |
| app-close-received | no arguments → boolean | false | Pending native close handshake | electron/main.js:404 |
| app-get-user-data-path | no arguments → string / null | null | User-data path disclosure | electron/main.js:311 |
| gpu-get-mode | no arguments → mode / null | null | GPU flag read | electron/main.js:377 |
| gpu-set-mode | compatibility / performance → boolean | false | Fixed GPU flag file | electron/main.js:381 |
| log-write-error | message/stack ≤8000 UTF-8 bytes; fixed level enum → boolean | false | Rotated error logs only | electron/main.js:433 |
| mod-clear | no arguments → boolean | false | Four community JSON files only | electron/main.js:666 |
| mod-exists | no arguments → boolean | false | Active mod metadata | electron/main.js:627 |
| mod-path | no arguments → string / null | null | User-data path disclosure | electron/main.js:679 |
| mod-read | four fixed JSON filenames → bounded string / null | null | Contained active mod files | electron/main.js:643 |
| mod-write | fixed filename + JSON array/manifest object ≤16 MiB → boolean | false | Community mod JSON only | electron/main.js:653 |
| steam-cloud-delete | save_*.json → boolean | false | Steam cloud namespace; throttled | electron/steam.js:460 |
| steam-cloud-read | save_*.json → bounded string / null | null | Steam cloud namespace; throttled | electron/steam.js:435 |
| steam-cloud-write | save_*.json + string ≤32 MiB UTF-8 → boolean | false | Steam cloud namespace; throttled | electron/steam.js:412 |
| steam-get-id | no arguments → string / null | null | Steam identity read | electron/steam.js:253 |
| steam-get-persona-name | no arguments → string / null | null | Steam identity read | electron/steam.js:265 |
| steam-get-rich-presence | status / steam_display → string / null | null | Presence cache | electron/steam.js:405 |
| steam-get-stat | bounded stat identifier → number / null | null | Steam stat allowlist | electron/steam.js:277 |
| steam-is-achievement-unlocked | allowlisted identifier → boolean | false | Steam achievements | electron/steam.js:345 |
| steam-set-achievement | allowlisted identifier → boolean | false | Steam achievements | electron/steam.js:327 |
| steam-set-leaderboard-score | allowlisted name + int32 → boolean | false | Steam leaderboard; throttled | electron/steam.js:359 |
| steam-set-rich-presence | status / steam_display + string ≤255 bytes / null → boolean | false | Bounded presence cache and Steam | electron/steam.js:382 |
| steam-set-stat | allowlisted name + finite 32-bit range value → boolean | false | Steam stats; throttled | electron/steam.js:289 |
| steam-store-stats | no arguments → boolean | false | Steam stats; throttled | electron/steam.js:313 |
| storage-clear | no arguments → boolean | false | Game keys only; preserves private window settings | electron/main.js:517 |
| storage-get-all-keys | no arguments → string[] | [] | Game keys only | electron/main.js:529 |
| storage-get-item | allowed storage key → string / null | null | Game storage namespace | electron/main.js:473 |
| storage-remove-item | allowed storage key → boolean | false | Game storage namespace | electron/main.js:505 |
| storage-set-item | allowed key + string ≤32 MiB UTF-8 → boolean | false | Game storage namespace | electron/main.js:489 |
| window-get-size | no arguments → {width,height} / null | null | Window read | electron/main.js:355 |
| window-is-fullscreen | no arguments → boolean | false | Window read | electron/main.js:366 |
| window-set-fullscreen | boolean → boolean | false | Window and private window settings | electron/main.js:320 |
| window-set-size | two integers 1..16384 → boolean; clamped to UI minimum | false | Window and private window settings | electron/main.js:334 |
| workshop-available | no arguments → boolean | false | Workshop status | electron/steam.js:484 |
| workshop-get-active | no arguments → active pointer / null | null | Fixed active pointer JSON | electron/steam.js:492 |
| workshop-list | no arguments → bounded item list | [] | Subscribed Workshop manifest reads | electron/steam.js:488 |
| workshop-open | optional uint64 ID → boolean | false | Fixed HTTPS steamcommunity.com URL | electron/steam.js:524 |
| workshop-set-active | community or workshop + uint64 decimal ID → boolean | false | Fixed active pointer JSON | electron/steam.js:496 |
| workshop-subscribe | uint64 decimal ID → boolean | false | Steam Workshop subscription | electron/steam.js:507 |
| workshop-unsubscribe | uint64 decimal ID → boolean | false | Steam Workshop subscription | electron/steam.js:518 |

Filesystem controls: JSON reads are bounded (16 MiB overlays, 256 KiB Workshop manifest, 4 KiB active pointer); mod/pointer writes use atomic replacement. Links/junctions within checked paths are rejected. Mod HTTP assets accept GET/HEAD only, approved image extensions, nosniff and a sandboxed document policy. Static malformed mod JSON never reaches the simulation without the existing snapshot validator. These checks do not isolate the game from another OS process that already controls the same user account.
