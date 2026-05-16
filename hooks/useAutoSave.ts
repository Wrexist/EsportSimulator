"use client"

import { useEffect, useCallback, useRef } from 'react'
import { useGameStore } from '@/store/game-store'
import { toast } from "@/lib/toast"
import logger from '@/lib/logger'

interface AutoSaveOptions {
    /** Interval in milliseconds (default: 60000 = 1 minute) */
    interval?: number
    /** Enable auto-save (default: true) */
    enabled?: boolean
    /** Show toast notifications (default: true) */
    showToasts?: boolean
}

/**
 * Auto-Save Hook
 * Automatically saves game at regular intervals
 * Warns before closing with unsaved changes
 * 
 * @example
 * useAutoSave({ interval: 30000 }) // Save every 30 seconds
 */
export function useAutoSave(options: AutoSaveOptions = {}) {
    const {
        interval = 60000, // 1 minute default
        enabled = true,
        showToasts = true
    } = options

    const saveIntervalRef = useRef<ReturnType<typeof setInterval>>()
    const lastSaveRef = useRef<number>(Date.now())
    const lastSavedSignatureRef = useRef<string>("")

    // Get save function from store (you'll need to add this to game-store)
    const saveGame = useGameStore(state => state.saveGame)
    const dirtySignature = useGameStore(state =>
        `${state.saveId || "none"}|${state.currentWeek}|${state.lastRngSeed}|${state.completedMatches.length}|${state.eventsLog.length}|${state.financeLedger.length}|${state.transferHistory.length}|${state.newsFeed.length}`
    )
    const hasUnsavedChanges = Boolean(lastSavedSignatureRef.current) && dirtySignature !== lastSavedSignatureRef.current

    const performSave = useCallback(async () => {
        // Bug fix: skip if a weekly tick or other store-mutating action is in
        // flight. `advanceWeek` sets `isLoading: true` while it mutates the
        // engine save in place; if we serialize the store mid-tick we can
        // overwrite the on-disk save with a stale snapshot.
        if (useGameStore.getState().isLoading) {
            return
        }

        try {
            logger.info('Auto-saving game...')
            await saveGame?.()
            lastSaveRef.current = Date.now()
            lastSavedSignatureRef.current = dirtySignature

            if (showToasts) {
                toast.success('Game auto-saved', {
                    duration: 2000,
                    icon: '💾'
                })
            }
        } catch (error) {
            logger.error('Auto-save failed:', error)
            if (showToasts) {
                toast.error('Auto-save failed', {
                    description: 'Please save manually'
                })
            }
        }
    }, [dirtySignature, saveGame, showToasts])

    useEffect(() => {
        if (!lastSavedSignatureRef.current) {
            lastSavedSignatureRef.current = dirtySignature
        }
    }, [dirtySignature])

    // Set up auto-save interval
    useEffect(() => {
        if (!enabled || !saveGame) return

        saveIntervalRef.current = setInterval(() => {
            if (hasUnsavedChanges) {
                performSave()
            }
        }, interval)

        return () => {
            if (saveIntervalRef.current) {
                clearInterval(saveIntervalRef.current)
            }
        }
    }, [enabled, interval, hasUnsavedChanges, performSave, saveGame])

    // Warn before closing with unsaved changes
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault()
                e.returnValue = 'You have unsaved changes! Are you sure you want to leave?'
                return e.returnValue
            }
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [hasUnsavedChanges])

    // Return manual save trigger
    return {
        saveNow: performSave,
        lastSave: lastSaveRef.current,
        hasUnsavedChanges
    }
}

/**
 * Get time since last save in human-readable format
 */
export function useTimeSinceLastSave() {
    const { lastSave } = useAutoSave()

    const getTimeSince = useCallback(() => {
        const seconds = Math.floor((Date.now() - lastSave) / 1000)

        if (seconds < 60) return `${seconds}s ago`
        const minutes = Math.floor(seconds / 60)
        if (minutes < 60) return `${minutes}m ago`
        const hours = Math.floor(minutes / 60)
        return `${hours}h ago`
    }, [lastSave])

    return getTimeSince()
}
