"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameSave } from '@/engine/save-types'
import logger from '@/lib/logger'

interface SaveSlot {
    id: string
    name: string
    lastPlayed: string
    currentWeek: number
    teamName: string
    managerName: string
    thumbnail?: string
}

interface SaveSlotStore {
    slots: SaveSlot[]
    currentSlot: string | null
    maxSlots: number

    createSlot: (save: Partial<GameSave>) => Promise<string>
    loadSlot: (slotId: string) => Promise<boolean>
    deleteSlot: (slotId: string) => Promise<boolean>
    renameSlot: (slotId: string, newName: string) => void
    getSlot: (slotId: string) => SaveSlot | undefined
    hasAvailableSlot: () => boolean
}

/**
 * Save Slot Management System
 * Manages multiple game saves
 */
export const useSaveSlots = create<SaveSlotStore>()(
    persist(
        (set, get) => ({
            slots: [],
            currentSlot: null,
            maxSlots: 5,

            createSlot: async (save: Partial<GameSave>) => {
                const { slots, maxSlots } = get()

                if (slots.length >= maxSlots) {
                    throw new Error(`Maximum ${maxSlots} save slots reached`)
                }

                const slotId = `slot_${Date.now()}`
                const newSlot: SaveSlot = {
                    id: slotId,
                    name: save.saveName || `Save ${slots.length + 1}`,
                    lastPlayed: new Date().toISOString(),
                    currentWeek: save.currentWeek || 0,
                    teamName: save.playerTeamId || 'Unknown Team',
                    managerName: save.managerDetails?.name || 'Manager'
                }

                set({
                    slots: [...slots, newSlot],
                    currentSlot: slotId
                })

                logger.info('Created save slot:', slotId)
                return slotId
            },

            loadSlot: async (slotId: string) => {
                const slot = get().getSlot(slotId)

                if (!slot) {
                    logger.error('Save slot not found:', slotId)
                    return false
                }

                set({ currentSlot: slotId })

                // Update last played
                set(state => ({
                    slots: state.slots.map(s =>
                        s.id === slotId
                            ? { ...s, lastPlayed: new Date().toISOString() }
                            : s
                    )
                }))

                logger.info('Loaded save slot:', slotId)
                return true
            },

            deleteSlot: async (slotId: string) => {
                const { slots, currentSlot } = get()

                set({
                    slots: slots.filter(s => s.id !== slotId),
                    currentSlot: currentSlot === slotId ? null : currentSlot
                })

                logger.info('Deleted save slot:', slotId)
                return true
            },

            renameSlot: (slotId: string, newName: string) => {
                set(state => ({
                    slots: state.slots.map(s =>
                        s.id === slotId ? { ...s, name: newName } : s
                    )
                }))
            },

            getSlot: (slotId: string) => {
                return get().slots.find(s => s.id === slotId)
            },

            hasAvailableSlot: () => {
                const { slots, maxSlots } = get()
                return slots.length < maxSlots
            }
        }),
        {
            name: 'save-slots-storage'
        }
    )
)

/**
 * Save Slot Selector Component
 */
export function SaveSlotSelector({
    onSelect
}: {
    onSelect: (slotId: string) => void
}) {
    const { slots, currentSlot, deleteSlot } = useSaveSlots()

    return (
        <div className="space-y-2">
            <h3 className="font-bold text-lg mb-4">Load Game</h3>

            {slots.length === 0 ? (
                <div className="glass-panel p-8 text-center text-muted-foreground">
                    No saved games found
                </div>
            ) : (
                slots.map(slot => (
                    <div
                        key={slot.id}
                        className={`glass-panel p-4 cursor-pointer transition-colors hover:bg-white/10 ${currentSlot === slot.id ? 'ring-2 ring-primary' : ''
                            }`}
                        onClick={() => onSelect(slot.id)}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <h4 className="font-bold">{slot.name}</h4>
                                <div className="text-sm text-muted-foreground">
                                    {slot.teamName} • Week {slot.currentWeek}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    Last played: {new Date(slot.lastPlayed).toLocaleDateString()}
                                </div>
                            </div>

                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    if (confirm(`Delete "${slot.name}"?`)) {
                                        deleteSlot(slot.id)
                                    }
                                }}
                                className="text-red-500 hover:text-red-400 px-3 py-1"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    )
}
