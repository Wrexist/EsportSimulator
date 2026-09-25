# Steam graphics — 25 September 2026

App 4326170, Esports Manager: FPS. New coherent navy/ivory/gold campaign with the owner's exact approved transparent trophy. Previous packs and game assets remain unchanged.

## Upload destinations

| Folder | Destination | Files |
|---|---|---:|
| 01-STORE | Store graphical assets, permanent base artwork | 5 |
| 02-LIBRARY | Library assets; anchor separate logo bottom-left | 4 |
| 03-ABOUT-ONLY | Description extra assets / About This Game | 3 |
| 04-SCREENSHOTS | Screenshot Assets, only after release-build visual check | 8 |
| 05-ICONS | App Admin > Client Images | 4 |
| 06-EVENTS | Optional announcement cover/header | 2 |
| 07-BROADCAST | Broadcast Assets, left/right panels | 2 |

`index.html` previews every export. `contact-sheet.png` shows campaign assets. Exact dimensions and hashes are in `UPLOAD-READY/manifest.json`.

The 8 screenshot files preserve archived genuine gameplay pixels. They are **not newly captured**, and do not represent the latest portrait/UI changes. Current release-build captures remain required before publication. Do not upload illustrated marketing compositions as screenshots. No trailer has been created by this image task.

## Artwork provenance

Four original promotional illustrations were generated with the built-in OpenAI image tool on 25 September 2026: arena landscape, arena portrait, club HQ and team practice. Fictional people, no intentional real-player likenesses or licensed team brands. Generated masters are retained in `sources`. Illustration is promotional art, not evidence of a rendered 3D gameplay mode.

Trophy source: `../approved-brand/ESM_LOGO.png`, unchanged. Typography: outlined Barlow Condensed from the September 20 source pack and its retained OFL record. Owner explicitly authorized local composition/export. No generated lettering is used for game title or feature headlines.

## Live Steam audit and blocker

Checked signed-in Steamworks on 25 September. Existing capsules/library have valid dimensions but no page background is installed. Screenshot editor still reports 1/5. Store has unpublished changes. No new graphics upload or publication is verified by this task.

The graphics drag/drop surface did not open a chooser; its file input is hidden. Client-icon choosers opened, but after setFiles the page inputs still contained zero files. Thus an attempted icon submit is NOT evidence of a successful upload. The Chrome file URL access setting must be enabled; then repeat uploads and verify actual previews/hashes. Browser connection subsequently reported debugger unattached while opening the game, so fresh gameplay capture could not complete.

## Rebuild

From project root: `node marketing/steam-graphics-2026-09-25/export.cjs`.

Sources for specifications: https://partner.steamgames.com/doc/store/assets and the live Store/Library/Broadcast/Client Images editors. Store screenshot rules were also explicitly present in the existing review feedback. This pack does not resolve build review or prove release readiness.
