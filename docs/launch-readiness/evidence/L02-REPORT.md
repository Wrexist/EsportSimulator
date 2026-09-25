# L02 implementation report

Status: partial. Seven deterministic synthetic fixtures now generate into unique folders with seed 3402, schema 7, lock/factory identity, hashes, reset instructions and expectations. Every fixture passes the production schema and export/import path. Historical fixtures and the owner's Mirage draft were preserved.

Added tests for deterministic independent scenarios, constraint validity, production week computation and failed primary-save writes retaining a last-good save. These use explicit memory storage, not browser IndexedDB or physical disk. No private user save was loaded.

The real browser core journey ran on empty `http://localhost:3210`, separate from owner `127.0.0.1`: new manager Launch QA 3402, Pulsar with five starters and $500,000; Recoil Master drill (0/3 to 1/3, +50 XP, energy reduced); signed HyperDragon for $19,200/week onto the bench; advanced to day 3, quick veto, live Inferno playback and game skip, result 8-13; completed second friendly via instant result (7-13); advanced to week 2 with $501,400; exported the save; closed tab; reopened menu and loaded Pulsar, week 2/day 1, $501,400 and HyperDragon's contract intact. Browser production build ID: fqEs4AOEePEZfY9iNXuao. This existing app build predates this tooling-only batch.

Last-good export: `tmp/launch-browser-acceptance/last-good-week-2.json`, SHA256 b7897cdd8330b1c9ab57c9c5e6d6a0b9e60204e26b10d6f596f6690ef0dda6fd, 4,463,065 bytes. Machine observations: `L02-browser.json`. Ctrl+S produced no visible acknowledgement in this run; the successful export and reopen verified the persisted week, not shortcut feedback.

Observed follow-ups: Pulsar selection OVR 52 versus dashboard raw-skill 44; drill allowance 3 versus tooltip baseline 10, then next-week allowance 10; HyperDragon transfer-list 84/$5,670 estimate versus negotiation 67/$19,200; after week/reload bench lists RIFLER rather than initial IGL (needs cause isolation); match result date Sep 13 versus played header Sep 15; menu still says REAL PLAYERS and onboarding says Semi-Pro while level-1 clubs are Amateur. Assign to L03/L16/L17/L19/L23/L26 as appropriate. These discrepancies prevent treating the core journey as fully accepted even though it executed.

Remaining: browser import and scenario coverage for all seven generated careers, worker error/late response/coordinator injection, IndexedDB and Windows disk failure matrix, automated per-case failure evidence and last-good capture. L02.1/.2/.3 and A1/A2 completed; L02.4 and A3 remain open. A2 records real actions, not absence of defects.

Next: L06 dependencies, L07 IPC and L08 rights unblock candidate gates; L03 closes save/recovery acceptance. Keep the retained QA career for reproduction.
