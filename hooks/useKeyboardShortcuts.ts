"use client"

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useGameStore } from '@/store/game-store'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import logger from '@/lib/logger'

export type ShortcutKey = string // e.g., 'ctrl+s', 'space', '1', 'esc'
export type ShortcutAction = () => void | Promise<void>

interface ShortcutConfig {
    [key: string]: {
        action: ShortcutAction
        description: string
        global?: boolean // Works even in input fields
    }
}

/**
 * Keyboard Shortcuts Hook
 * Provides app-wide keyboard navigation and actions
 * 
 * @example
 * useKeyboardShortcuts()
 * 
 * Available shortcuts:
 * - Ctrl+S: Save game
 * - Space: Advance week
 * - Esc: Close modal
 * - 1-9: Navigate sections
 */
export function useKeyboardShortcuts(customShortcuts?: ShortcutConfig) {
    const router = useRouter()
    const { saveGame, advanceWeek, isLoading, playerTeamId } = useGameStore(useShallow(state => ({
        saveGame: state.saveGame,
        advanceWeek: state.advanceWeek,
        isLoading: state.isLoading,
        playerTeamId: state.playerTeamId,
    })))
    const canAdvanceTime = !isLoading && Boolean(playerTeamId)

    // Default shortcuts
    const defaultShortcuts: ShortcutConfig = {
        'ctrl+s': {
            action: async () => {
                await saveGame?.()
                toast.success('Game saved', { icon: '💾' })
            },
            description: 'Save game',
            global: true
        },
        'space': {
            action: async () => {
                if (canAdvanceTime) {
                    await advanceWeek?.()
                    toast.info('Advanced 1 week')
                } else {
                    toast.error('Cannot advance time right now')
                }
            },
            description: 'Advance 1 week'
        },
        '1': {
            action: () => router.push('/squad'),
            description: 'Go to Squad'
        },
        '2': {
            action: () => router.push('/transfers'),
            description: 'Go to Transfers'
        },
        '3': {
            action: () => router.push('/staff'),
            description: 'Go to Staff'
        },
        '4': {
            action: () => router.push('/schedule'),
            description: 'Go to Schedule'
        },
        '5': {
            action: () => router.push('/finances'),
            description: 'Go to Finances'
        },
        '6': {
            action: () => router.push('/training'),
            description: 'Go to Training'
        },
        '7': {
            action: () => router.push('/scouting'),
            description: 'Go to Scouting'
        },
        '8': {
            action: () => router.push('/desktop'),
            description: 'Go to Desktop'
        },
        '9': {
            action: () => router.push('/settings'),
            description: 'Go to Settings'
        },
        '?': {
            action: () => {
                // Show shortcuts help
                const shortcuts = Object.entries({ ...defaultShortcuts, ...customShortcuts })
                    .map(([key, config]) => `${key}: ${config.description}`)
                    .join('\n')
                toast.info('Keyboard Shortcuts', {
                    description: shortcuts,
                    duration: 10000
                })
            },
            description: 'Show this help',
            global: true
        }
    }

    const shortcuts = { ...defaultShortcuts, ...customShortcuts }

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Build key string (e.g., 'ctrl+s', 'shift+?', 'space')
        const parts: string[] = []
        if (e.ctrlKey || e.metaKey) parts.push('ctrl')
        if (e.shiftKey) parts.push('shift')
        if (e.altKey) parts.push('alt')

        const key = e.key.toLowerCase()
        parts.push(key === ' ' ? 'space' : key)

        const keyCombo = parts.join('+')
        const shortcut = shortcuts[keyCombo]

        if (!shortcut) return

        // Check if we should ignore this (e.g., typing in input)
        const target = e.target as HTMLElement
        const isInputField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.isContentEditable

        if (isInputField && !shortcut.global) return

        // Execute shortcut
        e.preventDefault()
        logger.debug(`Keyboard shortcut triggered: ${keyCombo}`)
        shortcut.action()
    }, [shortcuts])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    return {
        shortcuts,
        showHelp: () => shortcuts['?'].action()
    }
}

/**
 * Modal-specific keyboard shortcuts
 * Automatically closes on Escape
 */
export function useModalShortcuts(onClose: () => void, onConfirm?: () => void) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            } else if (e.key === 'Enter' && e.ctrlKey && onConfirm) {
                onConfirm()
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose, onConfirm])
}
