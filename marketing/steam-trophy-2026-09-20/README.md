# Current trophy artwork pack

App ID: 4326170. Prepared September 20, 2026. **Local exports only — not uploaded.**

Open `index.html` to review the complete pack. This pack supersedes earlier marketing packs for the active brand. Earlier files are retained as history, not silently overwritten.

## Where each image goes

| Folder | Steamworks destination | Contents |
|---|---|---|
| `01-STORE` | Butiksresurser / Store Assets | Main, header, small and vertical capsules; subtle page background |
| `02-LIBRARY` | Biblioteksresurser / Library Assets | Library capsule, header, transparent logo, unbranded hero |
| `03-ABOUT-ONLY` | About This Game / description extra images | Eight gameplay/coach composites; compact versions; three editorial feature panels |
| `04-APP-ICONS` | Application / client icon settings | 256 and 512 PNGs, 184 JPG, seven-frame ICO, original logo |
| `05-EVENTS` | Optional announcement/event artwork | 800×450 cover and 1920×622 header; no release date or live-event claims |
| `06-SCREENSHOTS` | Skärmbildsresurser / Screenshot Assets | Eight original gameplay captures, with no added artwork |

The full-size original logo is a retained master, not a dimension-matched upload field. No broadcast is scheduled; no broadcast assets are required by this pack.

Steam's Library Hero uses the separate Library Logo overlay, so the trophy is intentionally not baked into that background. Screenshot Assets likewise retain authentic gameplay rather than added branding. Composites are explicitly identified and belong in About This Game.

Specifications checked against https://partner.steamgames.com/doc/store/assets on September 20, 2026. Export dimensions and SHA-256 hashes are in `UPLOAD-READY/asset-manifest.json`.

## Production and preservation

The owner authorized exact local logo/text compositing on September 20. Every logo placement derives from `../approved-brand/ESM_LOGO.png`; the source remains unchanged. Typography is outlined from the retained Barlow Condensed ExtraBold font with its OFL notice. No font installation is needed to render the generated SVGs.

The coach was created using the built-in image_gen tool. Its master and prompt are retained in `sources/`. The coach is promotional artwork, not an in-game interface feature. Original gameplay captures were recovered from the eight owner attachments after the former gameplay-gallery folder was found missing. Their text/data were not regenerated; promotional versions crop/scale those captures and add separate layers. The screenshot exports preserve decoded image pixels.

Rebuild from the repository root:

    python marketing/steam-trophy-2026-09-20/build-type.py
    node marketing/steam-trophy-2026-09-20/export.cjs

## Next release steps

Upload the matching folders to Steamworks, inspect the store preview, and publish the approved store changes. Rebuild Windows to include the installed trophy icon in the executable. This artwork task does not establish packaged gameplay acceptance or complete the remaining release checks.
