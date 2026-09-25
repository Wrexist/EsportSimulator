# Esport Simulator — Premium Steam UI Rebuild for Astra

## Outcome

Rebuild the existing Esport Simulator desktop interface into a cohesive, premium, high-readability 16:9 Steam management-game UI. Preserve all existing data, simulation rules, routes, actions, save-state behavior and keyboard/mouse interactions. Replace only visual presentation, layout and interaction polish unless a visual change needs a small adapter.

The target feeling is an approachable, polished next-generation RPG interface applied to an esports management game: cinematic and tactile, never generic SaaS or loud cyberpunk.

## Source-of-truth references

Use these generated design references as the visual north star:

| Screen | Reference |
|---|---|
| Club overview | `reference-ui/club-overview.png` |
| Match command | `reference-ui/match-command.png` |
| Player profile | `reference-ui/player-profile.png` |
| Scouting | `reference-ui/scouting-network.png` |
| Club campus | `reference-ui/club-campus.png` |

## Master prompt — copy this entire block into Astra

```text
You are the lead UI engineer and art-direction implementer for Esport Simulator, a desktop Steam esports management game. Your task is to rebuild the existing production interface into the premium 16:9 desktop visual system defined below, while preserving the game’s current mechanics, routes, data, state, accessibility and working actions.

First, inspect the repository. Read project instructions, package configuration, app entry points, route structure, shared UI primitives, theme tokens, page components, asset loading, game state, existing tests and screenshot/test commands. Do not change anything until you have mapped the existing UI shell and verified how state/actions are wired.

## Non-negotiable outcome

Deliver a cohesive PC/Steam interface, not a responsive web dashboard and not a mobile app. The game must feel like a polished, immersive esports headquarters and tournament world. It should borrow the qualities of a clean, modern, softly layered next-generation RPG interface, but must remain original and must not copy any third-party UI, logos, characters, text or assets.

## Preserve

- Preserve every existing gameplay system, simulation formula, save migration, navigation target, modal outcome, filter, sort, input, CTA, keyboard shortcut and test hook unless replacement is necessary for visual consistency.
- Preserve the game’s original team/player data and do not silently invent production gameplay values.
- Preserve desktop usability at 1280x720, 1440x900 and 1920x1080. Design primarily for 1920x1080.
- Preserve all current functional pages. Do not restrict the rewrite to the five showcase pages.

## Do not do

- Do not use a generic SaaS admin-dashboard appearance.
- Do not create a second app shell or duplicate routes.
- Do not use pure black slabs, rainbow RGB, aggressive neon, fake unreadable text, decorative clutter, huge empty regions or glossy effects that reduce readability.
- Do not rely on generated images for small UI icons, typography, charts, radar plots, tables, buttons, tooltips, borders or interaction states. Build those in code as scalable SVG/CSS/canvas where appropriate.
- Do not replace working gameplay with mock data.
- Do not introduce large dependencies without a concrete need.

## Art direction

### Visual personality

Premium esports operations center. Calm midnight navy foundation, soft acrylic panels, light atmospheric depth, subtle cyan interactions, green success/economy feedback, amber progression and tactical warnings, restrained red danger. The UI must have one strong focal area per page, then quiet supporting information.

### Global shell

1. A persistent left rail, 184–220 px wide, with small icons and readable labels. It is grouped into Overview, Team, Recruitment, Competition and Business. The selected row has a translucent blue surface, hairline outline and subtle cyan edge light. It never resembles a mobile rail.
2. A compact top status bar with club crest/name, funds, world rank, in-game date, Daily control, primary Next Day / Play Match action and settings. Use 56–68 px height.
3. Main content sits in a 12-column desktop grid with 24–32 px outer padding, 16–24 px gaps and a max content width that remains readable on ultrawide screens.
4. Backdrops are low-contrast environmental plates behind translucent UI layers. Backgrounds never carry important readable information.
5. Panels use 16–22 px corner radius, a 1 px low-opacity cool border, two shadow layers, a restrained 6–16 px backdrop blur if performance allows, and a dark blue translucent fill. Do not make every object glow.

### Colour tokens

Use semantic tokens, not hard-coded repeated literals. Tune as needed for contrast.

- `--bg-950: #08111F`
- `--bg-900: #0D1A2D`
- `--surface-900: rgba(17, 33, 57, 0.88)`
- `--surface-800: rgba(28, 48, 78, 0.78)`
- `--surface-hover: rgba(51, 82, 123, 0.55)`
- `--border-subtle: rgba(165, 202, 255, 0.14)`
- `--border-strong: rgba(123, 205, 255, 0.42)`
- `--text-strong: #F4F8FF`
- `--text: #C4D0E2`
- `--text-muted: #7F91AA`
- `--cyan: #36D7FF`
- `--cyan-strong: #1BA7FF`
- `--green: #43DE9A`
- `--amber: #F4B83F`
- `--red: #FF6877`
- `--violet: #B085FF`

### Type and spacing

- Use the project’s existing shipped font if it is high quality. Otherwise choose one readable geometric sans for UI, using a maximum of two families total.
- Hero/page title: 32–42 px, 700–800 weight.
- Section title: 16–20 px, 650–750 weight.
- Body: 13–15 px. Never use low-contrast text below 12 px for important content.
- Meta labels: 10–12 px uppercase, restrained letter spacing.
- Build a 4 px spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.

### Motion and feedback

- 160–220 ms standard transition. 260–320 ms for panel entry/route change.
- Use ease-out/spring-like motion with opacity, 4–8 px translation and tiny scale changes.
- Hover: lift 1–2 px, brighten border or surface, never strong flashing.
- CTA press: scale to 0.98 then settle.
- Use short haptic-like visual confirmation for purchase, upgrade, scout send, day advance and match decision.
- Respect `prefers-reduced-motion`.

## Build shared primitives first

Create or improve reusable components and tokens before restyling pages. Maintain the existing framework patterns.

- `AppShell`: sidebar, top bar, scroll handling, background region.
- `SidebarNav`: grouped items, active state, badge/count support, collapse behavior only if the existing app already supports it.
- `TopStatusBar`: club identity, economy, rank, date, calendar actions.
- `PageHeader`: eyebrow, title, subtitle, action area.
- `GlassPanel`: standard, elevated, muted, selected, danger and tactical variants.
- `MetricTile`: icon, label, value, delta, context.
- `Pill` and `RoleBadge`: semantic status styles.
- `PrimaryButton`, `SecondaryButton`, `DangerButton`, `IconButton` with loading/disabled/focus states.
- `SegmentedControl`, `FilterChip`, search input, range input and data table.
- `PlayerAvatar`, `TeamCrest`, `EquipmentTile`, `FacilityTile` with robust fallbacks.
- `EmptyState`, `LoadingState`, `InlineNotice`, toast, confirmation dialog and tooltip.
- Code-built `RadarChart`, `ProgressLine`, `Timeline`, `WinProbabilityBar`, `EconomyBar`.

## Required page transformations

### 1. Club Overview

Make this the emotional home screen. Use one large Next Match hero card containing two team crests, event/map metadata, opponent, match time and one dominant Prepare Match CTA. To its right place This Week tasks and Weekly Focus choices. Below show Season Progress, Recent Form and Financial Hub as compact supporting panels. Do not stack several cards with equal visual importance.

### 2. Match Command

Keep the current live match functionality. Promote the score/map/timer to one clear scoreboard. Use left/right roster strips showing portrait, role, loadout/economy and K/D/A. The tactical map is the center of gravity. Put tactical decision cards (Save, Force Buy, Full Buy, Call Timeout) at the bottom with clear selected/disabled states. Include live feed, win probability and next-round economy without overwhelming the map.

### 3. Player Profile

Make the player feel like a living career asset. Use a wide dossier hero with portrait, name, role, team, OVR, level and experience. Below it: Player DNA radar; a readable technical/mental/traits area; key metric tiles; equipment loadout; last-five-match strip; career timeline; achievements. Use information hierarchy, not an endless wall of cards.

### 4. Scouting Network

Keep the existing database features, but make filters into a focused search cockpit. Use a high-readability table with sticky useful columns and a selected state. The right intelligence panel should make the selected player feel exciting: portrait, role, OVR range, potential uncertainty, scout confidence ring, traits, value, contract, scout notes and strong Scout/Shortlist actions. Keep all sorting and filtering functional.

### 5. Club Campus and Equipment

Unify facility upgrades and gear into an aspirational club-world page. The campus scene acts as an interactive overview with labelled hotspot overlays built in code. The selected facility shows interior art, level progression, current/next benefit, cost, upkeep and upgrade CTA. Equipment uses original card art with tier, stat effects, price, owned/equipped states and comparison. Preserve purchasing/economy behavior.

### 6. Remaining pages

Restyle Squad, Training, Staff, Transfers, Academy, Tournaments, Rankings, FPL, Statistics, Finances, Sponsors, Inbox, Schedule, Settings, Goals/Achievements and all modals using the shared primitives. Do not leave any legacy flat-card page behind.

## Use the supplied asset pack

Copy the asset pack into the project under the project’s established static asset convention, retaining names. Use image optimisation, lazy loading and low-cost CSS overlays. Do not render full-size 16:9 backgrounds unoptimised on every nested panel.

### Backdrops

- `backgrounds/club-overview-hq.png` — Club overview, finances and high-level dashboard backdrop.
- `backgrounds/match-command-arena.png` — Match command and tournament backdrop.
- `backgrounds/scouting-war-room.png` — Scouting, transfers and data-heavy recruitment backdrop.
- `backgrounds/club-campus-dusk.png` — Campus/facility overview backdrop.

### Portraits

- `portraits/roster-a-00.png` to `roster-a-05.png`
- `portraits/roster-b-00.png` to `roster-b-05.png`

Use `object-fit: cover`, low-radius square/circle containers and a shared portrait fallback. Do not assign generated faces to copyrighted real esports people. Map them only to fictional generated players or clearly configurable demo data.

### Equipment

- `equipment/gear-a-00.png` mouse
- `equipment/gear-a-01.png` keyboard
- `equipment/gear-a-02.png` headset
- `equipment/gear-a-03.png` monitor

### Facilities

- `facilities/facility-a-00.png` performance center
- `facilities/facility-a-01.png` strategy room
- `facilities/facility-a-02.png` wellness lounge
- `facilities/facility-a-03.png` creator studio

### Team crests

- `crests/crest-a-00.png` to `crest-a-07.png`

Use only for fictional teams or as a configurable fallback set. Keep the player’s existing club identity if the game already has a logo asset.

## Asset and rendering rules

- Keep source PNGs; create optimised WebP/AVIF variants only if the build pipeline already supports them.
- Do not generate UI text into images.
- Use visual backgrounds at 20–45% effective opacity under panels with a gradient/blur overlay. Test text contrast.
- Use CSS/SVG for all semantic UI and icons. Use generated art only for environmental, portrait, product and crest content.
- Ensure every image has a descriptive alt label or is marked decorative when appropriate.

## Implementation order

1. Inspect codebase; write a concise implementation note identifying UI shell, routes, state boundaries, tests and screenshot command.
2. Add the visual token layer and shared shell/primitives without breaking pages.
3. Wire/optimise supplied visual assets and add stable asset references.
4. Rebuild Club Overview, then Match Command, Player Profile, Scouting Network, Club Campus/Equipment in that order.
5. Bring all remaining pages and every modal/empty/loading/error state into the same system.
6. Verify interactions, keyboard focus, contrast, reduced motion and responsive desktop behavior.
7. Run the project’s tests/build/lint/typecheck and capture 1920x1080 screenshots for the five showcase pages.
8. Compare screenshots against the supplied reference direction. Iterate on any page that still feels like a dark generic dashboard, has inconsistent spacing/radii, lacks visual hierarchy or uses poor contrast.

## Definition of done

- No working user flow regresses.
- All pages share one shell, token system and component language.
- The five showcase pages match the quality bar: Club Overview, Match Command, Player Profile, Scouting Network, Club Campus.
- Every primary and destructive action has visible hover, focus, pressed, disabled and loading states.
- 1280x720, 1440x900 and 1920x1080 have been checked. No horizontal clipping and no reliance on tiny text.
- The application builds with no new warnings/errors; relevant tests are green.
- Provide a final report with modified files, component inventory, tests/screenshots run, remaining known limitations and the next highest-impact visual task.

Work autonomously. Make measured, reversible changes. Do not stop after a plan: implement, verify and report.
```

## Asset manifest

| Group | Assets | Use |
|---|---:|---|
| Environmental backdrops | 4 | Whole-page low-contrast atmosphere, never text-bearing cards |
| Roster portraits | 12 | Fictional player cards, profile hero, scouting database |
| Facility interiors | 4 | Upgrade/facility cards and selected facility detail |
| Equipment renders | 4 | Equipment catalogue and player loadout |
| Team crests | 8 | Fictional competitors and configurable fallbacks |
| UI icons | Code | SVG icon system, not generated bitmap assets |
| Charts/radar/minimap | Code | Deterministic readable data visualisations |
| Panels/buttons/effects | Code | CSS/component primitives with accessibility states |

## Build checklist

### Foundation

- [ ] Read project instructions, app architecture and current UI implementation.
- [ ] Record existing routes, page owners, state/action boundaries and relevant test commands.
- [ ] Add semantic design tokens and remove repeated magic colours gradually.
- [ ] Build one desktop `AppShell`, one `SidebarNav` and one `TopStatusBar`.
- [ ] Implement shared panel, button, metric, badge, table, tab, toast, dialog and empty-state primitives.
- [ ] Add keyboard focus treatments, reduced-motion handling and contrast checks.

### Asset integration

- [ ] Copy visual assets to the game’s static asset directory.
- [ ] Add a central asset manifest/import module.
- [ ] Keep the generated assets mapped only to fictional entities.
- [ ] Add `object-fit`, image fallback, responsive sizing and lazy-loading rules.
- [ ] Add background overlay gradients so all UI copy passes contrast.

### Showcase screens

- [ ] Club Overview: event hero, weekly actions, focus, season, form, finance.
- [ ] Match Command: scoreboard, roster strips, tactical map, feed, economy and decisions.
- [ ] Player Profile: dossier, radar, technical/mental stats, journey, equipment and achievements.
- [ ] Scouting: filter cockpit, readable table, intelligence panel, confidence and shortlist.
- [ ] Club Campus: map/hotspots, facility upgrade card, gear catalogue and ownership states.

### Full-game consistency

- [ ] Restyle every remaining route and subroute.
- [ ] Restyle all dropdowns, drawers, tooltips, dialogs, confirmation flows, lists and empty states.
- [ ] Remove legacy UI patterns once replacement is verified.
- [ ] Verify loading, errors, no-data, locked content, insufficient cash and disabled action states.

### Verification

- [ ] Run formatter, lint, typecheck, unit/integration tests and production build.
- [ ] Capture screenshots at 1280x720, 1440x900 and 1920x1080.
- [ ] Inspect screenshots manually for clipping, density, typography, active states and contrast.
- [ ] Test an end-to-end flow: select club task → train/upgrade/buy → advance day → prepare a match → use tactical decision → inspect results.
- [ ] Deliver a short evidence-backed completion report.

## Quality bar

The visual standard is not “more glow” or “more cards”. It is clear player choices, strong focal hierarchy, environmental immersion, consistent materials, responsive feedback and zero generic-placeholder feeling. Keep the match and the manager’s club at the emotional center of the game.
