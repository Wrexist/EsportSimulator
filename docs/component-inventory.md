# Component Inventory

_Generated snapshot of every screen and every reusable React component in the repo. Use this as a navigation aid and as the source of truth for consolidation work in Phase 5 (UI Consistency & Polish)._

## Screens (Next.js App Router routes)

| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard — news, upcoming matches, finances overview |
| `/squad` | `app/squad/page.tsx` | Roster management and player evaluation |
| `/player/[id]` | `app/player/[id]/page.tsx` | Player detail (stats, history, skills) |
| `/staff` | `app/staff/page.tsx` | Staff management and hiring |
| `/schedule` | `app/schedule/page.tsx` | Weekly match and activity scheduling |
| `/schedule/staff-meeting` | `app/schedule/staff-meeting/page.tsx` | Coach/staff team meetings |
| `/match/[id]/live` | `app/match/[id]/live/page.tsx` | Live match simulation viewer |
| `/match/[id]/tactics` | `app/match/[id]/tactics/page.tsx` | Pre-match tactical setup |
| `/match/[id]/veto` | `app/match/[id]/veto/page.tsx` | Map veto / ban phase |
| `/match/[id]/result` | `app/match/[id]/result/page.tsx` | Post-match results and stats |
| `/tournaments` | `app/tournaments/page.tsx` | Tournament listings |
| `/tournaments/[id]` | `app/tournaments/[id]/page.tsx` | Tournament details, bracket, standings |
| `/training` | `app/training/page.tsx` | Player skill training |
| `/transfers` | `app/transfers/page.tsx` | Transfer market |
| `/stats` | `app/stats/page.tsx` | Team and player statistics |
| `/rankings` | `app/rankings/page.tsx` | Global team / player rankings |
| `/sponsorships` | `app/sponsorships/page.tsx` | Sponsor deals and contracts |
| `/equipment` | `app/equipment/page.tsx` | Equipment / gear management |
| `/finances` | `app/finances/page.tsx` | Budget, salaries, economy |
| `/basecamp` | `app/basecamp/page.tsx` | Team morale and facilities |
| `/career` | `app/career/page.tsx` | Career milestones |
| `/academy` | `app/academy/page.tsx` | Youth academy management |
| `/scouting` | `app/scouting/page.tsx` | Player scouting |
| `/trophies` | `app/trophies/page.tsx` | Trophy cabinet |
| `/hall-of-fame` | `app/hall-of-fame/page.tsx` | Legends and records |
| `/settings` | `app/settings/page.tsx` | Game settings |
| `/settings/community-import` | `app/settings/community-import/page.tsx` | Import community teams |
| `/fpl` | `app/fpl/page.tsx` | Fantasy player league |
| `/new-game` | `app/new-game/page.tsx` | New-game setup |
| `/new-game/create-team` | `app/new-game/create-team/page.tsx` | Team creation wizard |
| `/main-menu` | `app/main-menu/page.tsx` | Main menu / save file browser |
| `/load-game` | `app/load-game/page.tsx` | Load saved game |
| `/desktop` | `app/desktop/page.tsx` | In-game desktop / OS environment |
| `/dev` | `app/dev/page.tsx` | Dev tools, integrity checker |
| `/animations` | `app/animations/page.tsx` | Animation showcase (debug) |
| `/credits` | `app/credits/page.tsx` | Credits |

## Reusable components

### `components/celebration/`
| Component | File | Purpose |
|---|---|---|
| `LegendPickModal` | `celebration/LegendPickModal.tsx` | Legend-selection modal with trophy awards |
| `TournamentWinCelebration` | `celebration/TournamentWinCelebration.tsx` | Victory celebration animation |
| `SeasonRecapModal` | `celebration/SeasonRecapModal.tsx` | End-of-season summary / awards |
| `HLTVAwardsModal` | `celebration/HLTVAwardsModal.tsx` | HLTV-style awards ceremony |

### `components/dashboard/`
| Component | File | Purpose |
|---|---|---|
| `NewsFeed` | `dashboard/NewsFeed.tsx` | Home news / event timeline |
| `WeeklyFocusWidget` | `dashboard/WeeklyFocusWidget.tsx` | Weekly focus / objectives widget |

### `components/debug/`
| Component | File | Purpose |
|---|---|---|
| `AnimationShowcase` | `debug/AnimationShowcase.tsx` | Demo of all animations |
| `DevTools` | `debug/DevTools.tsx` | Development utilities |

### `components/desktop/` and `components/desktop-apps/`
| Component | File | Purpose |
|---|---|---|
| `DesktopBackground` | `desktop/DesktopBackground.tsx` | Desktop background / theming |
| `CalendarApp` | `desktop-apps/CalendarApp.tsx` | In-game calendar app |
| `FacilitiesApp` | `desktop-apps/FacilitiesApp.tsx` | Facilities management mini-app |
| `AcademyApp` | `desktop-apps/AcademyApp.tsx` | Academy window |
| `FinanceApp` | `desktop-apps/FinanceApp.tsx` | Financial dashboard mini-app |
| `MarketApp` | `desktop-apps/MarketApp.tsx` | Transfer market mini-app |
| `MailApp` | `desktop-apps/MailApp.tsx` | Email / messages app |
| `NewsApp` | `desktop-apps/NewsApp.tsx` | News reader |
| `ShopApp` | `desktop-apps/ShopApp.tsx` | Shop / equipment |
| `SocialApp` | `desktop-apps/SocialApp.tsx` | Social-media feed app |

### `components/layout/`
| Component | File | Purpose |
|---|---|---|
| `GameShell` | `layout/GameShell.tsx` | Root layout (sidebar + topbar) |
| `Sidebar` | `layout/Sidebar.tsx` | Main navigation sidebar |
| `TopBar` | `layout/TopBar.tsx` | Top header bar |
| `ExitConfirmDialog` | `layout/ExitConfirmDialog.tsx` | Exit / save confirmation |
| `MatchNavigationGuard` | `layout/MatchNavigationGuard.tsx` | Navigation protection during matches |
| `ErrorBoundary` | `layout/ErrorBoundary.tsx` | Re-export of `ui/error-boundary` |

### `components/match/`
| Component | File | Purpose |
|---|---|---|
| `LiveMatchControlBar` | `match/LiveMatchControlBar.tsx` | Match-speed controls |
| `LiveMatchScoreboard` | `match/LiveMatchScoreboard.tsx` | Live score / round display |
| `MapRadarPanel` | `match/MapRadarPanel.tsx` | Tactical radar / map view |
| `TacticalLoadoutEditor` | `match/TacticalLoadoutEditor.tsx` | Weapon / utility setup |

### `components/onboarding/`
| Component | File | Purpose |
|---|---|---|
| `RosterBuilderModal` | `onboarding/RosterBuilderModal.tsx` | Initial roster setup |

### `components/player/`
| Component | File | Purpose |
|---|---|---|
| `PlayerMatchHistory` | `player/PlayerMatchHistory.tsx` | Player match-history list |
| `RenewContractModal` | `player/RenewContractModal.tsx` | Contract-renewal dialog |
| `SkillTree` | `player/SkillTree.tsx` | Skill progression tree |
| `TransferListingModal` | `player/TransferListingModal.tsx` | Player transfer-listing modal |
| `PlayerDetail` | `player/player-detail.tsx` | Full player-detail view |

### `components/schedule/`
| Component | File | Purpose |
|---|---|---|
| `ActivityPickerModal` | `schedule/ActivityPickerModal.tsx` | Activity picker |
| `BookBootcampModal` | `schedule/BookBootcampModal.tsx` | Bootcamp booking |
| `BookMarketingModal` | `schedule/BookMarketingModal.tsx` | Marketing booking |
| `BookScrimModal` | `schedule/BookScrimModal.tsx` | Scrim booking |
| `ScheduleActivityCard` | `schedule/ScheduleActivityCard.tsx` | Activity card |
| `ScheduleMatchCard` | `schedule/ScheduleMatchCard.tsx` | Match card in schedule |
| `TeamMatchPopup` | `schedule/TeamMatchPopup.tsx` | Opponent preview popup |
| `TournamentDetailsModal` | `schedule/TournamentDetailsModal.tsx` | Tournament info modal |

### `components/settings/`
| Component | File | Purpose |
|---|---|---|
| `SettingsModal` | `settings/SettingsModal.tsx` | Game settings dialog |

### `components/sponsorships/`
| Component | File | Purpose |
|---|---|---|
| `ActiveSponsorCard` | `sponsorships/ActiveSponsorCard.tsx` | Active sponsor deal |
| `SponsorOfferCard` | `sponsorships/SponsorOfferCard.tsx` | Incoming offer |
| `EmptySponsorSlot` | `sponsorships/EmptySponsorSlot.tsx` | Empty sponsor slot |

### `components/squad/`
| Component | File | Purpose |
|---|---|---|
| `ChemistryMatrix` | `squad/ChemistryMatrix.tsx` | Team chemistry grid |
| `SynergyChart` | `squad/SynergyChart.tsx` | Synergy / composition analysis |
| `SystemBonuses` | `squad/SystemBonuses.tsx` | System-bonus display |
| `TrophyCabinet` | `squad/TrophyCabinet.tsx` | Trophy display |

### `components/staff/`
| Component | File | Purpose |
|---|---|---|
| `StaffDetailsModal` | `staff/StaffDetailsModal.tsx` | Staff profile |
| `StaffNegotiationModal` | `staff/StaffNegotiationModal.tsx` | Staff contract negotiation |
| `TalentTree` | `staff/TalentTree.tsx` | Staff skill progression |

### `components/stats/`
| Component | File | Purpose |
|---|---|---|
| `TacticalHeatmap` | `stats/TacticalHeatmap.tsx` | Tactical heatmap visualization |

### `components/tournament/`
| Component | File | Purpose |
|---|---|---|
| `TournamentBracket` | `tournament/TournamentBracket.tsx` | Bracket visualization |
| `TournamentStandings` | `tournament/TournamentStandings.tsx` | Standings table |
| `TournamentStats` | `tournament/TournamentStats.tsx` | Tournament-wide stats |
| `TournamentMatchContext` | `tournament/TournamentMatchContext.tsx` | Match-context wrapper |
| `AdvancementAnimation` | `tournament/AdvancementAnimation.tsx` | Advancement/elim animation |

### `components/training/`
| Component | File | Purpose |
|---|---|---|
| `RoleTrainingModal` | `training/RoleTrainingModal.tsx` | Role-specific training |
| `WeaponTrainingModal` | `training/WeaponTrainingModal.tsx` | Weapon-skill training |

### `components/transfer/`
| Component | File | Purpose |
|---|---|---|
| `NegotiationModal` | `transfer/NegotiationModal.tsx` | Player transfer negotiation |

### `components/ui/` — custom (non-shadcn) widgets
| Component | File | Purpose |
|---|---|---|
| `AppWindow` | `ui/AppWindow.tsx` | Desktop application window container |
| `BugReportButton` | `ui/BugReportButton.tsx` | In-game bug-report button |
| `ColorblindFilters` | `ui/ColorblindFilters.tsx` | Colorblind filter SVG defs |
| `CountryFlag` | `ui/CountryFlag.tsx` | Country flag image |
| `DesktopOverlay` | `ui/DesktopOverlay.tsx` | Desktop-environment overlay |
| `GlassTable` | `ui/GlassTable.tsx` | Glassmorphism table |
| `ImageUploader` | `ui/ImageUploader.tsx` | Image file upload |
| `KeyboardShortcutsModal` | `ui/KeyboardShortcutsModal.tsx` | Shortcut reference dialog |
| `SocialFeed` | `ui/SocialFeed.tsx` | Social-media feed |
| `Taskbar` | `ui/Taskbar.tsx` | Desktop taskbar |
| `TeamLogoDisplay` | `ui/TeamLogoDisplay.tsx` | Team logo w/ custom-team support |
| `ToastNotifications` | `ui/ToastNotifications.tsx` | Toast system |
| `TutorialOverlay` | `ui/TutorialOverlay.tsx` | Tutorial hint overlay |
| `WeekProcessingOverlay` | `ui/WeekProcessingOverlay.tsx` | Week-processing loading state |

### `components/ui/` — shadcn primitives (summarized)

| Category | Files |
|---|---|
| Forms | `button`, `input`, `textarea`, `checkbox`, `radio-group`, `select`, `toggle`, `toggle-group`, `slider`, `switch`, `input-otp`, `input-group`, `label`, `field`, `form` |
| Dialogs / overlays | `dialog`, `drawer`, `alert-dialog`, `confirm-dialog`, `popover`, `sheet` |
| Data display | `table`, `tabs`, `accordion`, `pagination`, `carousel`, `breadcrumb`, `collapsible` |
| Navigation | `navigation-menu`, `dropdown-menu`, `context-menu`, `menubar`, `sidebar` |
| Feedback / status | `progress`, `progress-indicators`, `skeleton`, `skeletons`, `loading`, `spinner`, `badge`, `alert`, `empty`, `empty-state` |
| Layout | `card`, `scroll-area`, `resizable`, `aspect-ratio`, `separator`, `item` |
| Tooltip / help | `tooltip`, `hover-card`, `stat-tooltip`, `help-system`, `tutorial` |
| Charts | `chart`, `charts`, `player-radar-chart`, `player-spider-chart`, `player-stat-meter` |
| Lists | `virtualized-list` |
| Animations | `feedback-animations`, `match-animations` |
| Toast | `sonner`, `toast`, `toaster` |
| Misc | `avatar`, `calendar`, `kbd`, `command`, `search-filter`, `bulk-actions`, `button-group`, `error-boundary`, `unified-portrait`, `asset-images`, `use-mobile` |

---

## Duplicate / overlapping implementations

Concepts implemented twice or more. Consolidation recommendations below should drive the Phase-5 cleanup.

### 1. Skeleton / loading
**Files**: `components/ui/loading.tsx`, `components/ui/skeletons.tsx`, `components/ui/skeleton.tsx`

- `skeleton.tsx` — base shadcn `Skeleton` primitive (keep).
- `loading.tsx` — exports `Skeleton`, `CardSkeleton`, `TableSkeleton`, `LoadingState`.
- `skeletons.tsx` — exports `CardSkeleton`, `TableRowSkeleton`, `PlayerCardSkeleton`, `StatBoxSkeleton`, `PageSkeleton`, `MatchCardSkeleton`, `SidebarItemSkeleton`.

`CardSkeleton` is defined in both `loading.tsx` and `skeletons.tsx`; `Skeleton` base is duplicated between `loading.tsx` and `skeleton.tsx`.

**Recommendation: consolidate.** Canonical base = `skeleton.tsx`. Canonical variant library = `skeletons.tsx`. Move `LoadingState` out of `loading.tsx` into either `spinner.tsx` or its own `loading-state.tsx`, then delete `loading.tsx`.

### 2. Empty state
**Files**: `components/ui/empty-state.tsx`, `components/ui/empty.tsx`

- `empty-state.tsx` — monolithic `EmptyState` (title + description + icon + optional action).
- `empty.tsx` — composable primitives (`Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia`).

**Recommendation: keep distinct.** Different APIs (preset vs. composable) serving different callsites. Document the distinction in a short comment at the top of each file.

### 3. Portrait / logo components
**Files**: `components/ui/asset-images.tsx`, `components/ui/unified-portrait.tsx`

`PlayerPortrait`, `StaffPortrait`, and `TeamLogo` are defined in **both** files with different signatures. `asset-images.tsx` handles images directly with fallbacks; `unified-portrait.tsx` wraps a shared `UnifiedPortrait` base.

**Recommendation: consolidate.** Pick `unified-portrait.tsx` as the canonical source (the abstraction is better) and merge `asset-images.tsx`-specific fallback logic into `UnifiedPortrait`. Remove the duplicate exports from whichever file loses. Audit callsites before removing.

### 4. Error boundary
**Files**: `components/layout/ErrorBoundary.tsx`, `components/ui/error-boundary.tsx`

- `ui/error-boundary.tsx` — canonical implementation.
- `layout/ErrorBoundary.tsx` — thin re-export.

**Recommendation: acceptable as-is.** Re-export is intentional. If the re-export has no callsites, delete it; otherwise leave a one-line comment explaining the alias.

### 5. Chart wrappers
**Files**: `components/ui/chart.tsx`, `components/ui/charts.tsx`

Both exist side-by-side. Needs a closer look to confirm whether they wrap the same library or provide different abstractions.

**Recommendation: investigate.** If duplicates, consolidate onto one file; if different scopes (e.g., shadcn `chart` primitive vs. custom chart presets), rename the custom one to make scope explicit (e.g., `chart-presets.tsx`).

### 6. Negotiation modals (borderline)
**Files**: `components/transfer/NegotiationModal.tsx`, `components/staff/StaffNegotiationModal.tsx`

Different flows (player transfer vs. staff contract).

**Recommendation: keep distinct.** Extract any shared UI primitives (slider row, offer summary) into `components/ui/` if shared code emerges.

---

## Concepts NOT currently duplicated (but worth watching)

These concepts live in a single implementation today. Keep them that way during Phase-5 work.

- **Player card / row** — no `PlayerCard`, `PlayerRow`, or `PlayerListItem` component exists at a generic level. Player rendering is inlined inside feature screens (squad, transfers, scouting). Phase 5.x: consider extracting a canonical `PlayerCard` with variants.
- **Team card / tile** — same as above; no generic `TeamCard`. `TeamLogoDisplay` exists but is just the logo.
- **Match tile / card** — `ScheduleMatchCard` is feature-local; live-match has its own composition. No generic `MatchTile`.
- **Ranking / leaderboard row** — not found as a component. Rendered inline.
- **StatBar / attribute bar** — base progress primitives (`progress`, `progress-indicators`, `player-stat-meter`) exist; no unified "attribute bar with label + value + bar" component.

These five gaps are the most likely targets for new shared components in Phase 5.

---

## Legacy / potentially-unused

| Item | File | Note |
|---|---|---|
| `theme-provider` | `components/theme-provider.tsx` | next-themes re-export; verify it is actually mounted in `app/layout.tsx` |
| `console-to-terminal` | `components/console-to-terminal.tsx` | Dev-only log-forwarder; check whether any page still mounts it |

No files named `*-old.*`, `*-v2.*`, or `*-legacy.*` were found. No obviously orphaned feature components detected beyond the two above.

---

## Summary

- **Screens**: 36
- **Feature components**: ~90 across 17 subfolders
- **UI primitives (custom + shadcn)**: ~110
- **Duplicate groups to consolidate**: 3 (skeletons, portraits, maybe charts)
- **Duplicate groups to keep distinct**: 2 (empty-state vs. empty, negotiation modals)
- **Gaps worth filling with shared components**: `PlayerCard`, `TeamCard`, `MatchTile`, `RankingRow`, `StatBar`
