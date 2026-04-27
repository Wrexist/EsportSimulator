# Changelog

All notable changes to Esports Manager: FPS will be documented in this file.

## [1.0.0] - 2026-03-18

### Added
- Complete esports manager simulation with 200+ teams and players
- Full tournament system: Majors, A-Tier, B-Tier, C-Tier with circuit points
- Match simulation engine with round-by-round tactical simulation
- Live match viewer with radar visualization
- Player development: training, role specialization, weapon mastery, talent trees
- Transfer market with negotiations, buyout clauses, free agent signing
- Academy system for developing youth prospects
- Fantasy Pro League (FPL) system
- Staff management: coaches, analysts, psychologists with talent trees
- Equipment shop: monitors, keyboards, mice, chairs, headsets
- Financial management: sponsors, merchandise, fan income, facilities
- Schedule system with bootcamps, scrims, staff meetings, and marketing campaigns
- Promotion/relegation between league tiers
- Hall of Fame with legendary player induction
- Desktop OS simulation with 9 apps (Mail, Social, Market, Calendar, News, Shop, Facilities, Finance, Academy)
- Steam achievements (30+ achievements across win, tournament, competitive, management, and milestone categories)
- Steam Cloud save synchronization
- Steam Rich Presence integration
- Auto-save with 3-backup rotation and corruption recovery
- Keyboard shortcuts (Space=advance week, Ctrl+S=save, 1-9=navigation, ?=help)
- Tutorial/onboarding system for new players
- Credits page
- Error boundary with crash recovery UI
- Debug tools (development mode only)

### Technical
- Next.js 14 + Electron + Steam SDK (steamworks.js)
- Zustand state management with Immer
- Deterministic simulation with seeded RNG
- IndexedDB storage with debounced writes
- Procedurally generated audio (Web Audio API)
- i18n infrastructure (English, ready for translations)
- 33+ automated tests (Jest)
