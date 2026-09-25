# Release reconciliation update — 16 September 2026

The owner answered "Created for my project" for the fictional player/staff portraits and equipment, facility, trophy and event illustrations. `L31-OWNER-ART-CONFIRMATION.json` records 260 exact file hashes as owner-attested project-created art. This supersedes older missing-origin statements for those files. Original real-player photographs and original team logos remain local and excluded from Steam.

The source asset gate now uses electron-builder's actual include/exclude patterns; embedded data and fonts remain checked. Hidden `.logo_*` metadata is excluded without deleting source files. A separate final-ASAR check rejects unreviewed or changed packaged assets, including fonts renamed by Next. Four targeted tests pass.

`L31-RELEASE-CONTENT-REMAINING.json` lists 545 remaining selected-source records out of 867 selected files. These are pending reconciliation entries, not a finding that all those assets are third-party content. The complete source inventory is retained separately.

No real release was packaged or uploaded in this pass, and no new Steam Build ID or installed-game test is claimed. The Steam graphics drag area did not expose a usable file chooser in the current browser automation; the prepared gameplay gallery has not replaced the existing gallery. Store Early Access text remains present; the owner's requested Windows 1.0 classification still needs reconciliation before submission.

Next: resolve the remaining shipped vector/logo, icon, embedded-data and notice families from their creation/source records; build the real release; verify the exact archive and root Windows launcher; upload; install and test through Steam; finish the store gallery and submit for review.
