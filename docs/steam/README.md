# Steam: what is current

Updated 24 October 2026. App **4326170**, depot **4326171**, store item 1072595.

| Need | Current source |
|---|---|
| Achievements, stats, leaderboards, Rich Presence to enter in Steamworks | [STEAMWORKS_CONFIG.md](STEAMWORKS_CONFIG.md) (generated from code) |
| Rich Presence localization files to upload | [`steamworks/rich-presence/`](../../steamworks/rich-presence/) |
| Store copy, tags, trailer, screenshots (staged, unpublished) | `marketing/store-page-2026-10-12/` and `marketing/steam-trailer-2026-10-12/` on the owner's PC (not in git) |
| Capsules and library art | `marketing/steam-graphics-2026-09-25/UPLOAD-READY/` |
| Steam Cloud settings | [../steam-cloud.md](../steam-cloud.md) |
| Steam Deck | [../steam-deck.md](../steam-deck.md) |
| Free demo: what it contains, build, upload, Steamworks setup | [DEMO.md](DEMO.md) |
| Release gates | [../launch-readiness/CHECKLIST.md](../launch-readiness/CHECKLIST.md) (L30 Steam features, L31 artifact, L32 store, L35 support) |

Superseded and kept only as history: `STEAM_STORE_LISTING.md`, `deployment/STORE_COPY.md`, `deployment/STEAMWORKS_COPY.md` and the tables in `docs/STEAMWORKS_SETUP_GUIDE.md`.

## Steamworks checklist (account side)

Everything here is done in the partner site by the account owner. Nothing in this list is published by a commit.

- [x] **Release model.** Early Access (owner, 24 Oct 2026). The staged page, Early Access questionnaire and trailer end card already say so.
- [x] **AI content disclosure.** None: the owner confirmed on 24 Oct 2026 that the game is not made with AI.
- [ ] **Tags.** Replace Tactical RPG, PvE and 3D. Proposed order: Management, Simulation, Sports, eSports, Strategy, Singleplayer, Economy, Tactical, Choices Matter, Replay Value, Realistic, Top-Down, Indie.
- [ ] **Screenshots.** At least 5 (14 staged). Mark at least four as suitable for all ages, or the game is left out of some Steam surfaces. Lead with the live radar, not the title screen.
- [ ] **Stats and achievements.** Enter every row of [STEAMWORKS_CONFIG.md](STEAMWORKS_CONFIG.md), upload 31 unlocked and 31 locked icons, then publish.
- [ ] **Rich Presence.** Upload `steamworks/rich-presence/english.vdf` and `swedish.vdf`.
- [ ] **Steam Cloud.** Byte quota 100 MB and 1,000 files, no Auto-Cloud paths ([details](../steam-cloud.md)).
- [ ] **Languages.** English: Interface only. Leave Full Audio and Subtitles unticked (there is no voice-over). List Swedish only for store text unless the interface is translated.
- [ ] **System requirements.** Fill from a measured run of the packaged build (L31.4), not from the old guessed numbers.
- [ ] **Controller.** Leave as no controller support unless Steam Input is configured and tested.
- [ ] **Price.** Last observed US$14.99. Use Valve's recommended regional prices, then check the few regions that come out unusually high or low.
- [ ] **Coming soon and wishlists.** Keep the page public and the release date as a season or "To be announced" until the build is accepted.
- [ ] **Demo and Next Fest.** February 2027 Next Fest runs 22 Feb to 1 Mar; registration closes 10 Jan 2027 and the demo plus store page need review by 18 Jan for press preview. The demo is a separate app with its own store page.
- [ ] **Publish.** Publish staged store changes together with the build they describe, then confirm the public page with `curl "https://store.steampowered.com/api/appdetails?appids=4326170"`.
