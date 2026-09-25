# CS2 local reference opportunities

Inspected the installed game folder and pak01_dir.vpk read-only on 2026-09-22. No weapon models, Panorama code, audio or textures were added to the shipping game.

| Found source | Useful next task | Boundaries |
|---|---|---|
| scripts/weapons.vdata_c | Compare damage, penetration, cycle time, movement-speed and accuracy fields against our weapon profiles | Values have inheritance and mode-specific variants; validate resolved values and measured behavior before changing simulation |
| scripts/items/items_game.txt | Check item/category/loadout relationships and attribute definitions | A schema field is not proof of a resolved weapon value; do not bundle the source database |
| cfg/gamemode_competitive.cfg and mode overrides | Audit buy time, freeze time, round limits, starting money and round rewards | Server/tournament overrides may differ; do not blindly replace game balance |
| scripts/surfaceproperties_game.txt | Research material distinctions for penetration and utility contacts | Requires correct collision materials and query masks; geometry-only raycasts are insufficient |
| Existing local .dem files | Measure movement, rotation times, engagement distances and utility timings | Parse locally, anonymize measurements, avoid shipping player identifiers or raw demos; check map/version before comparing |
| panorama/layout/buymenu.vxml_c and panorama/styles/buymenu.vcss_c | Understand what the existing interface supports | Build our own layout, code, icons and visual hierarchy; do not ship extracted Panorama files |
| Native navigation, entities, physics and ladders | Continue spawn grounding, floor transitions, collision categories and 3D trigger validation | Current editor drafts do not activate these systems in production careers |

## Buy screen proposal for this game
Build an original team-buy screen around all five players: available money, retained gear, role needs, armor/helmet/kit, utility limits, squad total, and projected next-round money. Provide Eco / Force / Full presets, per-player overrides, an item comparison, clear unaffordable states, and one reviewable Confirm team buy action. Wire it to the existing deterministic purchase/halftime/overtime engine, with no hidden charges or free retained-equipment repurchases. Use the game's navy/white/amber visual system and independent item illustrations.

## Weapon artwork
Valve's standard Steam Subscriber Agreement grants personal/non-commercial content use and restricts commercial exploitation and derivative use without applicable permission. Owning the installed game or editing/retexturing its model is not a redistribution license. For a commercial standalone game, obtain permission for Valve assets or use independently created/licensed weapon meshes, textures, icons and audio. A new color or minor shape edit does not establish permission. Workshop availability is not a blanket license for a separate commercial game. This is a release-planning interpretation of the published terms, not a title-specific license determination.

Source: https://store.steampowered.com/subscriber_agreement/ (sections 2A, 2C, 2D, 2F and 2G).

## Recommended order
1. Native collision masks, grounded spawn selection and exact plant-trigger acceptance.
2. Local demo measurements to test navigation/combat rather than relying on screenshots.
3. Versioned weapon/economy comparison report with explicit overrides.
4. Original squad-buy UI wired to existing purchases and round transitions.
5. Independent weapon asset set, delivered with provenance and small transparent renders.

## Visual evidence
See docs/previews/native-maps-2026-09-22/index.html. Map Studio screenshots show native drafts. The game radar capture is the actual MapRadarPanel driven by the existing mock preview round, not a validated physical replay or a live career. Its estimated shot/position display remains a known limitation. No claim of perfect CS2-equivalent simulation is made.
