# Esports Simulator Game

A CS2 esports team management simulation game built with Next.js 14, Electron, and Steam SDK. Manage your team, compete in tournaments, develop players, and climb the world rankings.

**Steam App ID:** 4326170

## How to Play & Ship

### Play Locally
Double-click **`PLAY_DEV.bat`** in the root folder.
This runs the game in development mode inside Electron.

### Build & Ship to Steam
Double-click **`SHIP_GAME.bat`** in the root folder.
This script will:
1. **Build**: Create a production Next.js build and package it with Electron into `SteamBuild/`.
2. **Upload**: Automatically upload to Steam using `steamcmd`.

## Features

### Core Gameplay
- **Team Management**: Build and manage a CS2 roster with 20+ player attributes
- **Match Simulation**: Deterministic round-by-round match engine with economy, kills, and utility
- **Tournament System**: Full tournament calendar with S/A/B/C tiers, Swiss format, and bracket stages
- **Transfer Market**: Scout, negotiate, and sign players from 100+ real teams
- **Training & Drills**: Weapon mastery, role training, tactical drills, and bootcamps
- **Staff System**: Hire coaches, analysts, and scouts with talent trees
- **Youth Academy**: Scout and develop prospects for your roster
- **Scouting**: Discover hidden talent across regions
- **Financial Management**: Sponsors, prize money, salary budgets, and financial health tracking
- **Manager Progression**: Level up, unlock skills, and receive job offers from bigger organizations
- **Schedule System**: Plan scrimmages, bootcamps, staff meetings, and tournament preparation
- **Rivalries**: Dynamic rivalry system that develops based on match history
- **Hall of Fame**: Historical records and legendary players

### Technical Features
- **Deterministic Simulation**: Seeded RNG ensures reproducible match results
- **Save System**: Versioned saves (v1-v4) with SHA-256 integrity, validation, and auto-repair
- **Auto-Save**: Saves on close (Electron IPC) and periodically every 2 minutes
- **Zustand + Immer**: Immutable state management for predictable game state
- **Sound System**: Ambient music, match sounds, and volume controls
- **Steam Integration**: Steamworks.js for achievements and platform features
- **Error Tracking**: Electron IPC-based disk logging for error diagnostics

## Project Structure

```
esports-simulator-game/
├── app/                          # Next.js 14 App Router pages
│   ├── page.tsx                  # Dashboard (home)
│   ├── squad/                    # Squad management
│   ├── transfers/                # Transfer market
│   ├── training/                 # Training & drills
│   ├── schedule/                 # Calendar & scheduling
│   ├── match/[id]/               # Match flow (tactics, veto, live, result)
│   ├── tournaments/              # Tournament overview & brackets
│   ├── finances/                 # Financial management
│   ├── scouting/                 # Player scouting
│   ├── stats/                    # Team analytics & match history
│   ├── rankings/                 # World rankings
│   ├── settings/                 # Game settings
│   └── ...
├── engine/                       # Core simulation engine
│   ├── match-simulation.ts       # SimulationEngineV2 (round-by-round)
│   ├── match-engine.ts           # Map pool, round logic, economy
│   ├── atomic-week-processor.ts  # Week progression engine
│   ├── ai-manager.ts             # AI team management
│   ├── player-lifecycle.ts       # Player aging, XP, development
│   ├── economy-engine.ts         # Financial calculations
│   ├── tournament-manager.ts     # Tournament bracket & scheduling
│   ├── league-engine.ts          # ELO & ranking system
│   ├── training-manager.ts       # Training system
│   ├── save-manager.ts           # Save/load with migrations
│   ├── rng.ts                    # Seeded random number generator
│   └── ...
├── store/
│   └── game-store.ts             # Zustand store (all game actions)
├── components/                   # React UI components
│   ├── layout/                   # Shell, sidebar, topbar
│   ├── match/                    # Match UI components
│   ├── player/                   # Player detail, skill tree
│   ├── squad/                    # Chemistry, synergy, trophies
│   ├── tournament/               # Brackets, details
│   ├── training/                 # Training modals
│   ├── transfer/                 # Negotiation modal
│   ├── schedule/                 # Booking modals
│   └── ui/                       # Shared UI primitives
├── types/                        # TypeScript type definitions
├── data/                         # Static game data & tournament calendar
├── hooks/                        # React hooks (useLiveMatch, etc.)
├── lib/                          # Utilities (sound, i18n, assets)
├── public/assets/                # Team logos, player portraits, flags
├── __tests__/                    # Jest unit tests
├── PLAY_DEV.bat                  # Launch in dev mode
├── SHIP_GAME.bat                 # Build & upload to Steam
└── electron/                     # Electron main process
```

## Architecture

### Match Engine

Round-by-round CS2 match simulation with economy, side selection, and player performance:

- Player ratings derived from 20+ attributes (rifle, AWP, pistol, grenades, clutch, etc.)
- Modified by form, morale, fatigue, and team chemistry
- Economy system with buy rounds, eco rounds, and force buys
- Map veto system with team-specific map pools
- BO1, BO3, and BO5 formats with fatigue scaling

### Week Progression

The atomic week processor handles all weekly game logic:
- AI team management (transfers, scouting, roster changes)
- Player development and aging
- Training effects and drill results
- Tournament scheduling and bracket advancement
- Financial processing (income, expenses, sponsors)
- Event generation (injuries, morale, news)

### State Management

Zustand with Immer middleware for immutable state updates. The game store contains all game actions and state in a single store for atomic consistency.

## Development

### Prerequisites
- Node.js 18+
- npm

### Setup
```bash
npm install
npm run dev
```

### Testing
```bash
npx jest
```

33 unit tests covering core systems: RNG determinism, economy calculations, ELO updates, age decline, and bug fix verification.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Desktop**: Electron
- **Steam**: steamworks.js
- **State**: Zustand 5 + Immer
- **UI**: Tailwind CSS + Radix UI + Framer Motion
- **Charts**: Recharts
- **Language**: TypeScript 5
- **Testing**: Jest + ts-jest
