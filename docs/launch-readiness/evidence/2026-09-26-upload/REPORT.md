# Steam candidate upload 2026-09-26

Requested: upload latest Windows build to app 4326170 / depot 4326171 using Steam account poladero. Upload does not automatically activate the default branch.

Source: eebb2f39 plus upload-description change; current working tree portraits and UI included.

Completed checks: TypeScript; 15 portrait regression tests; content provenance reconciliation and check; strict static content audit (0 high/medium/low); production Next compilation; worker realm startup check. Production build contains pre-existing lint warnings.

PR #57 fixes: upload-artifact includes hidden .next files and excludes cache; old source note moved from public/hltvrankiing to raw-data/archived-notes/hltvrankiing.txt. Web-build CI passed; source CI pending at writing.

SteamCMD login with cached credentials succeeded. No password or token recorded here.

Windows packaging in progress. Package guard, upload Build ID and installed-through-Steam testing still pending. Do not treat this note as release approval.

The second CI failure was A5 scanning portrait provenance metadata. The three exact JSON paths are now source-allowlisted: they record original reference filenames, batch inputs and hashes, and are consumed by authoring/reconciliation scripts and portrait tests, not imported by game runtime code. package.json build.files does not include these data files. This exception preserves honest attribution; it is not a likeness/license clearance or a waiver for shipped artwork. Public asset/path and packaged content checks remain active.

Windows production packaging completed. Removed installer-only resources/elevate.exe from the Steam depot by preserving it under dist/installer-support; future NSIS builds set packElevateHelper=false. Ship verification passed after this correction. Strict readiness audit passed with 0 blockers, 0 high findings and 1 existing medium map-name finding. Installed-through-Steam acceptance remains outstanding.

SteamCMD upload succeeded at 2026-09-26 00:20:30 local time: app 4326170, depot 4326171, Build ID 25538898, manifest 3928827563894977410. This is an uploaded candidate only; no setlive directive was used. Default-branch activation, installed-through-Steam testing and Valve build review are not established by this upload.
