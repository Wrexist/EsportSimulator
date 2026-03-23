/**
 * Naming Conventions & Coding Standards
 * Consistent patterns across the codebase
 */

/**
 * FILE NAMING
 */
// Components: PascalCase
// ✅ components/ui/PlayerCard.tsx
// ✅ components/desktop-apps/StaffApp.tsx

// Utilities: kebab-case
// ✅ lib/utils.ts
// ✅ hooks/use-auto-save.ts

// Stores: kebab-case
// ✅ store/game-store.ts
// ✅ store/notifications.ts

/**
 * VARIABLE NAMING
 */

// Constants: SCREAMING_SNAKE_CASE
export const MAX_PLAYERS = 5
export const DEFAULT_SALARY = 3000
export const SAVE_INTERVAL_MS = 60000

// Functions: camelCase (verb + noun)
export function calculateChemistry() { }
export function validateContract() { }
export function exportPlayerStats() { }

// Booleans: is/has/should prefix
export const isLoading = false
export const hasError = true
export const shouldAutoSave = true

// Components: PascalCase (noun)
export function PlayerCard() { }
export function LoadingState() { }
export function ErrorBoundary() { }

// Hooks: camelCase with 'use' prefix
export function useAutoSave() { }
export function useKeyboardShortcuts() { }
export function useBreakpoint() { }

/**
 * TYPE NAMING
 */

// Interfaces: PascalCase
export interface Player { }
export interface GameState { }
export interface SaveSlot { }

// Types: PascalCase
export type Theme = 'light' | 'dark' | 'system'
export type Breakpoint = 'mobile' | 'tablet' | 'desktop'

// Enums: PascalCase
export enum MatchStatus {
    Scheduled = 'scheduled',
    InProgress = 'in-progress',
    Completed = 'completed'
}

/**
 * FUNCTION PATTERNS
 */

// Get/Set pattern
export function getPlayer(id: string) { }
export function setPlayerSalary(id: string, salary: number) { }

// Create pattern
export function createPlayer() { }
export function createContract() { }

// Update pattern
export function updatePlayerStats() { }
export function updateTeamChemistry() { }

// Delete/Remove pattern
export function deletePlayer(id: string) { }
export function removeContract(id: string) { }

// Validate pattern
export function validateEmail(email: string): boolean { }
export function validateSaveFile(data: unknown): boolean { }

// Format pattern
export function formatCurrency(amount: number): string { }
export function formatPercentage(value: number): string { }

/**
 * COMPONENT PATTERNS
 */

// Container components: [Feature]Container
export function DashboardContainer() { }
export function SquadContainer() { }

// Page components: [Feature]Page
export function DashboardPage() { }
export function SquadPage() { }

// UI components: descriptive noun
export function Button() { }
export function Dialog() { }
export function Tooltip() { }

/**
 * EVENT HANDLERS
 */

// Handler functions: handle + Event + Context
export function handleClickSave() { }
export function handleSubmitForm() { }
export function handleChangeInput() { }

/**
 * COMMON ABBREVIATIONS
 */

// DO use:
// - id (identifier)
// - src (source)
// - dest (destination)
// - err (error in catch blocks)
// - idx (index in loops)
// - btn (button)
// - nav (navigation)

// DON'T use:
// - e (use 'error' or 'event')
// - i (use 'index' or 'idx')
// - temp (use 'temporary' or specific name)

/**
 * PROP NAMING
 */

// Event handlers: on + Event
export interface ButtonProps {
    onClick?: () => void
    onHover?: () => void
    onFocus?: () => void
}

// Boolean props: is/has/should prefix
export interface CardProps {
    isLoading?: boolean
    hasError?: boolean
    isDisabled?: boolean
}

// Render props: render + Context
export interface ListProps {
    renderItem: (item: any) => React.ReactNode
    renderEmpty?: () => React.ReactNode
    renderHeader?: () => React.ReactNode
}

/**
 * STATE NAMING
 */

// State variables: noun or verb + noun
const [players, setPlayers] = useState([])
const [isLoading, setIsLoading] = useState(false)
const [selectedPlayer, setSelectedPlayer] = useState(null)

/**
 * CSS CLASS NAMING (BEM-inspired)
 */

// Block: component name
// Element: block__element
// Modifier: block--modifier

// Examples:
// .player-card
// .player-card__header
// .player-card__body
// .player-card--featured

/**
 * IMPORT ORDERING
 */

// 1. React imports
import React, { useState, useEffect } from 'react'

// 2. External libraries
import { motion } from 'framer-motion'
import { create } from 'zustand'

// 3. Internal utilities
import { cn } from '@/lib/utils'
import logger from '@/lib/logger'

// 4. Components
import { Button } from '@/components/ui/button'
import { PlayerCard } from '@/components/PlayerCard'

// 5. Types
import type { Player, Team } from '@/types'

// 6. Styles (if any)
import './styles.css'

/**
 * COMMENT STANDARDS
 */

// Function documentation
/**
 * Calculate team chemistry based on player compatibility
 * @param players - Array of players in the roster
 * @returns Chemistry value between 0-100
 */
export function calculateTeamChemistry(players: Player[]): number {
    // implementation
    return 0
}

// Inline comments - explain WHY, not WHAT
// ❌ Bad: Increment counter
// ✅ Good: Reset counter after 24 hours to prevent overflow

/**
 * CONSISTENCY CHECKLIST
 */

// ✅ All functions have JSDoc comments
// ✅ All constants are SCREAMING_SNAKE_CASE
// ✅ All booleans have is/has/should prefix
// ✅ All event handlers start with 'handle'
// ✅ All hooks start with 'use'
// ✅ All components are PascalCase
// ✅ All files follow naming convention
// ✅ Imports are ordered consistently
