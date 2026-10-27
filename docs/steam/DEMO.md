# Free demo

The demo is the full game with a calendar cap. A career plays the first
**12 weeks of season one**: the club brief, the league split draw and its
first rounds, the first events, transfers, training, playbook and live
matches. When week 12 has been processed the career stops on a "Demo
complete" screen with a link to the full game. Draft Cup runs are short and
end on their own, so the demo leaves them open.

The demo writes its careers to the same save folder as the full game, so a
player who buys the game finds the career in **Load game** and plays on from
week 13. Achievements, stats, leaderboards, Steam Cloud and the Workshop are
off in the demo.

Code: `lib/edition.ts` (week cap, renderer), `electron/edition.cjs` (Steam
App ID and the switched-off Steam features), `components/demo/DemoEnd.tsx`
(end screen and the weeks-left pill). Tests: `__tests__/demo-edition.test.tsx`.

## Try it locally

```
ESM_EDITION=demo npm run dev
```

On Windows PowerShell: `$env:ESM_EDITION="demo"; npm run dev`. The main menu
shows a "Free demo" tag. To check the end screen quickly, start a career and
use Continue until week 13.

## Steamworks setup (owner, once)

A demo is its own Steam app, free, attached to App 4326170. It needs no
Steam Direct fee.

1. **Create the demo app.** Steamworks, App 4326170, *All Associated
   Packages, DLC, Demos and Tools*, then **Add a demo** (or *Request a
   demo*). Steam gives the demo its own App ID and a free package. Note the
   **demo App ID**.
2. **Depot.** In the demo app: *SteamPipe, Depots*. Note the **demo depot
   ID** (usually the App ID plus one). Leave it for all operating systems
   and languages, or set Windows only, the same as the full game.
3. **Installation.** *Installation, General*: install folder
   `Esports Manager FPS Demo`, one launch option: executable
   `EsportsManager.exe`, operating system Windows, 64-bit.
4. **Leave off** for the demo: Steam Cloud, achievements, stats,
   leaderboards, Workshop. Rich Presence can stay off too.
5. **Publish** the demo app's pending changes (*Publish* tab).
6. **Build and upload** on the PC (from the repo folder):
   ```
   npm run dist:demo -- --app-id <demo App ID>
   npm run upload:demo -- --app-id <demo App ID> --depot-id <demo depot ID>
   ```
   The first command builds `dist-demo\win-unpacked`, the second writes the
   demo VDFs to `deployment\demo\` and runs SteamCMD (same login as for the
   full game).
7. **Set the build live.** Demo app, *SteamPipe, Builds*: set the new build
   live on the **default** branch.
8. **Store presence.** The demo appears as a *Download demo* button on the
   full game's page. Fill the demo's *Store page* basics if Steamworks asks
   (name "Esports Manager: FPS Demo", short description, capsule), using
   the full game's art.
9. **Review and release.** Submit the demo's build and store presence for
   review in its *App Admin* checklist. After approval, press **Release**.

Build the demo from the same commit as the live full-game build, so a demo
save always opens in the full game. After a full-game update, rebuild and
upload the demo too.

## Patch notes line

"A free demo is now on Steam: play the opening weeks of a career, and carry
the save into the full game."
