# L23 source triage and UI follow-up

This inventory matches all 40 current page entry points to ROUTE-MATRIX.md. It records static signals and file hashes, not a completed visual audit. Refer to [machine-readable inventory](L23-route-inventory.json) and [150 unexecuted route/overlay cases](L23-ui-cases.csv). Every screenshot, keyboard interaction, resolution and OS-scaling acceptance case remains NOT_RUN. Development routes require gate checks, not player-facing screenshots.

| Route | Source signals | UI acceptance |
|---|---|---|
| `/academy` | local heading | NOT_RUN |
| `/animations` | viewport-height layout to review; production gate in parent layout | NOT_RUN |
| `/basecamp` | shared title | NOT_RUN |
| `/career` | shared title | NOT_RUN |
| `/credits` | local heading; viewport-height layout to review | NOT_RUN |
| `/desktop` | viewport-height layout to review | NOT_RUN |
| `/dev/map-builder` | local heading; viewport-height layout to review; production gate in parent layout | NOT_RUN |
| `/dev` | local heading; shared table; production gate in parent layout | NOT_RUN |
| `/dev/radar-preview` | local heading; production gate in parent layout | NOT_RUN |
| `/equipment` | shared title; viewport-height layout to review | NOT_RUN |
| `/finances` | shared title; native table: check horizontal/focus behavior | NOT_RUN |
| `/fpl` | shared title; shared table | NOT_RUN |
| `/hall-of-fame` | local heading | NOT_RUN |
| `/load-game` | local heading; viewport-height layout to review | NOT_RUN |
| `/main-menu` | local heading; viewport-height layout to review | NOT_RUN |
| `/map-editor/lab` | dedicated map component; shell chrome/scroll restoration excluded | NOT_RUN |
| `/map-editor` | dedicated map component; shell chrome/scroll restoration excluded | NOT_RUN |
| `/match/[id]/live` | viewport-height layout to review | NOT_RUN |
| `/match/[id]/result` | viewport-height layout to review; native table: check horizontal/focus behavior | NOT_RUN |
| `/match/[id]/tactics` | viewport-height layout to review | NOT_RUN |
| `/match/[id]/veto` | viewport-height layout to review; native table: check horizontal/focus behavior | NOT_RUN |
| `/new-game/create-team` | viewport-height layout to review | NOT_RUN |
| `/new-game` | local heading; viewport-height layout to review | NOT_RUN |
| `/` | local heading | NOT_RUN |
| `/player/[id]` | Dedicated route/component; shared shell applies | NOT_RUN |
| `/rankings` | shared title; shared table; career-scoped list controls | NOT_RUN |
| `/schedule` | local heading | NOT_RUN |
| `/schedule/staff-meeting` | shared title; viewport-height layout to review | NOT_RUN |
| `/scouting` | shared title; shared table | NOT_RUN |
| `/settings/community-import` | local heading | NOT_RUN |
| `/settings` | shared title | NOT_RUN |
| `/sponsorships` | shared title | NOT_RUN |
| `/squad` | shared title | NOT_RUN |
| `/staff` | shared title | NOT_RUN |
| `/stats` | local heading; shared table | NOT_RUN |
| `/tournaments/[id]` | local heading; viewport-height layout to review; native table: check horizontal/focus behavior | NOT_RUN |
| `/tournaments` | local heading; career-scoped list controls | NOT_RUN |
| `/training` | shared title | NOT_RUN |
| `/transfers` | shared title; shared table; career-scoped list controls | NOT_RUN |
| `/trophies` | shared title | NOT_RUN |

## Findings handled in this increment

- Shared dialogs had width bounds but no viewport height bound. Added a dynamic viewport cap with contained vertical scrolling and wrapping footer actions. Custom settings, staff negotiation and season recap had separate sizing paths; they now constrain their content to the viewport too.
- Keyboard shortcuts used a separate overlay and document Escape listener. It now uses the shared Radix dialog, including its focus lifecycle, close control and accessible title/description. Real keyboard/focus-return acceptance is still pending.
- Shared tables lacked a keyboard-focusable scroll region; GlassTable also added a second horizontal overflow wrapper and a blurred panel around dense content. One table scroll region now owns horizontal navigation, and the outer surface uses the existing non-blurred card. Headers use readable 12px defaults instead of 10px; rows use 12px padding instead of 16px.
- Shared tabs now permit horizontal overflow rather than stretching the page. Grid-based caller overrides remain; those need narrow-layout checks separately.
- Fifteen management routes use one compact page-title style. Basecamp's duplicate page padding is removed; Equipment and Trophies use less hero spacing. Dashboard, player profile, match result, Hall of Fame and map-specific layouts retain their prior tailored structure.
- Empty-state destinations use Next links. Their descriptions and headings use normal readable type. Loading copy no longer implies cloud retrieval or live match servers.
- Transfers, Rankings and Tournaments retain list controls for each career within this session. Main-panel scroll restoration uses the same bounded session cache; first visits start at the top, late content can restore within three seconds, and pointer/wheel/touch/key input gives control back to the user. Map Studio, setup/menu and Desktop use their own layout behavior and are excluded.

## Remaining source and interaction follow-up

1. Native tables in finances, tournament detail, match veto and match results do not automatically inherit the shared table region semantics. Review their existing wrappers and keyboard/column behavior before migrating them. Numerous local form fields and headings remain outside shared primitives.
2. Equipment, tournament detail, live/tactics/veto/result, staff meeting and load-game still include local viewport-height containers. Verify whether they create excess vertical space beneath the shell at supported resolutions. Avoid deleting layout constraints from tactical canvases without visual evidence.
3. Confirm restored filters, pagination and inner scroll through profile/detail links and browser Back/Forward, including slow data loads, changing roster size, career switches, interrupted restoration and browser reload. State is per route, not per individual browser-history entry, and intentionally resets on app restart. Desktop/Inbox query tabs retain their existing dedicated behavior; those need separate acceptance.
4. MapAnnotationEditor keeps its independent layout, project controls, undo/recovery and geometry. Review header wrapping, tool list, inspector, utility source/placement panel and spatial lab at all sizes. No project or drawing was edited. Pointer alternatives and color-independent map semantics belong in L24.
5. Check custom player/staff negotiation, settings, transfer listing, roster builder, awards/legend pick, tournament detail, tactical controls and exit/save recovery for focus trapping, Escape rules, action visibility and focus return. Constraining height is not proof of accessibility. The player offer action remains in its existing left-panel placement.
6. Development tools already use isDevToolsEnabled guards in app/dev/layout.tsx and app/animations/layout.tsx. Confirm production responses and direct-navigation gates on the built candidate. Do not assume Map Studio is a development-only route.
7. The existing canonical error boundary keeps retry, menu and copy-details actions. Its full-page menu navigation is intentional recovery, unlike ordinary in-app list links. Exercise failed retries and clipboard denial in the real runtime.

## Interface rules for subsequent work

Use page-title for management headings; keep decorative hero presentation in deliberate standalone contexts. Dense tables use the existing non-blurred glass-card surface, 12px header text and 12px cell padding unless the data needs a measured exception. Shared inputs/buttons retain their current tokens and focus treatment. Use labels, useful empty-state actions and truthful loading copy. Modal bodies must fit the dynamic viewport and expose scrolling; bespoke modal focus behavior still requires testing. Do not globally recolor status text, replace domain components or change simulation state for visual polish.
