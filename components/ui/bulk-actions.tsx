"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Square } from 'lucide-react'
import { logger } from "@/lib/logger"

interface BulkActionsBarProps<T> {
    items: T[]
    selectedItems: Set<string>
    onSelectItem: (id: string) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    getItemId: (item: T) => string
    actions: {
        label: string
        icon?: React.ComponentType<{ className?: string }>
        onClick: (selectedIds: string[]) => void | Promise<void>
        variant?: 'default' | 'destructive' | 'outline'
        confirm?: {
            title: string
            description: string
        }
    }[]
    className?: string
}

/**
 * Bulk Actions Component
 * Allows multi-select and batch operations
 * 
 * @example
 * const [selected, setSelected] = useState(new Set())
 * 
 * <BulkActions
 *   items={players}
 *   selectedItems={selected}
 *   onSelectItem={(id) => {
 *     const newSet = new Set(selected)
 *     if (newSet.has(id)) newSet.delete(id)
 *     else newSet.add(id)
 *     setSelected(newSet)
 *   }}
 *   onSelectAll={() => setSelected(new Set(players.map(p => p.id)))}
 *   onDeselectAll={() => setSelected(new Set())}
 *   getItemId={(p) => p.id}
 *   actions={[
 *     {
 *       label: 'Release',
 *       onClick: (ids) => bulkRelease(ids),
 *       variant: 'destructive',
 *       confirm: {
 *         title: 'Release players?',
 *         description: `Release ${ids.length} players?`
 *       }
 *     }
 *   ]}
 * />
 */
export function BulkActionsBar<T>({
    items,
    selectedItems,
    onSelectItem,
    onSelectAll,
    onDeselectAll,
    getItemId,
    actions,
    className
}: BulkActionsBarProps<T>) {
    const [loading, setLoading] = useState(false)

    const selectedCount = selectedItems.size
    const allSelected = items.length > 0 && selectedCount === items.length

    const handleAction = useCallback(async (action: typeof actions[0]) => {
        const selectedIds = Array.from(selectedItems)

        if (action.confirm) {
            const confirmed = window.confirm(
                `${action.confirm.title}\n\n${action.confirm.description.replace('{count}', selectedIds.length.toString())}`
            )
            if (!confirmed) return
        }

        setLoading(true)
        try {
            await action.onClick(selectedIds)
            onDeselectAll()
        } catch (error) {
            logger.error('Bulk action failed', error)
        } finally {
            setLoading(false)
        }
    }, [selectedItems, onDeselectAll])

    if (selectedCount === 0) return null

    return (
        <div className={`glass-panel p-4 flex items-center gap-4 ${className || ''}`}>
            <Button
                variant="ghost"
                size="sm"
                onClick={onDeselectAll}
                className="gap-2"
            >
                <Square className="w-4 h-4" />
                Clear Selection
            </Button>

            <Badge variant="secondary" className="text-sm">
                {selectedCount} selected
            </Badge>

            <div className="flex-1" />

            <div className="flex gap-2">
                {actions.map((action, idx) => {
                    const Icon = action.icon

                    return (
                        <Button
                            key={idx}
                            variant={action.variant || 'default'}
                            size="sm"
                            onClick={() => handleAction(action)}
                            disabled={loading}
                            className="gap-2"
                        >
                            {Icon && <Icon className="w-4 h-4" />}
                            {action.label}
                        </Button>
                    )
                })}
            </div>
        </div>
    )
}

/**
 * Bulk Selection hook
 * Manages selection state
 */
export function useBulkSelection<T>(items: T[], getId: (item: T) => string) {
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())

    const toggleItem = useCallback((id: string) => {
        setSelectedItems(prev => {
            const newSet = new Set(prev)
            if (newSet.has(id)) {
                newSet.delete(id)
            } else {
                newSet.add(id)
            }
            return newSet
        })
    }, [])

    const selectAll = useCallback(() => {
        setSelectedItems(new Set(items.map(getId)))
    }, [items, getId])

    const deselectAll = useCallback(() => {
        setSelectedItems(new Set())
    }, [])

    const isSelected = useCallback((id: string) => {
        return selectedItems.has(id)
    }, [selectedItems])

    return {
        selectedItems,
        toggleItem,
        selectAll,
        deselectAll,
        isSelected,
        selectedCount: selectedItems.size,
        allSelected: items.length > 0 && selectedItems.size === items.length
    }
}

/**
 * Bulk Selection Checkbox
 * Use in table headers or lists
 */
export function BulkSelectCheckbox({
    checked,
    indeterminate,
    onCheckedChange,
    label
}: {
    checked: boolean
    indeterminate?: boolean
    onCheckedChange: (checked: boolean) => void
    label?: string
}) {
    return (
        <div className="flex items-center gap-2">
            <Checkbox
                checked={checked}
                onCheckedChange={onCheckedChange}
                className={indeterminate ? 'data-[state=indeterminate]:bg-primary' : ''}
            />
            {label && <span className="text-sm">{label}</span>}
        </div>
    )
}
