"use client"

import { useEffect, useRef, useState, useCallback } from 'react'

interface VirtualizedListProps<T> {
    items: T[]
    height: number
    itemHeight: number
    renderItem: (item: T, index: number) => React.ReactNode
    overscan?: number
    className?: string
}

/**
 * Virtualized List Component
 * Only renders visible items for better performance with large lists
 * 
 * @example
 * <VirtualizedList
 *   items={players}
 *   height={600}
 *   itemHeight={80}
 *   renderItem={(player) => <PlayerCard player={player} />}
 * />
 */
export function VirtualizedList<T>({
    items,
    height,
    itemHeight,
    renderItem,
    overscan = 3,
    className
}: VirtualizedListProps<T>) {
    const [scrollTop, setScrollTop] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const totalHeight = items.length * itemHeight
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
        items.length - 1,
        Math.ceil((scrollTop + height) / itemHeight) + overscan
    )

    const visibleItems = items.slice(startIndex, endIndex + 1)
    const offsetY = startIndex * itemHeight

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop)
    }, [])

    return (
        <div
            ref={containerRef}
            onScroll={handleScroll}
            className={className}
            style={{
                height,
                overflow: 'auto',
                position: 'relative'
            }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                    {visibleItems.map((item, index) => (
                        <div key={startIndex + index} style={{ height: itemHeight }}>
                            {renderItem(item, startIndex + index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * Simple virtualized grid
 */
export function VirtualizedGrid<T>({
    items,
    height,
    itemHeight,
    itemWidth,
    columns,
    renderItem,
    gap = 16,
    className
}: {
    items: T[]
    height: number
    itemHeight: number
    itemWidth: number
    columns: number
    renderItem: (item: T, index: number) => React.ReactNode
    gap?: number
    className?: string
}) {
    const [scrollTop, setScrollTop] = useState(0)

    const rowCount = Math.ceil(items.length / columns)
    const totalHeight = rowCount * (itemHeight + gap)

    const startRow = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - 1)
    const endRow = Math.min(
        rowCount - 1,
        Math.ceil((scrollTop + height) / (itemHeight + gap)) + 1
    )

    const visibleItems: T[] = []
    for (let row = startRow; row <= endRow; row++) {
        const startIdx = row * columns
        const endIdx = Math.min((row + 1) * columns, items.length)
        visibleItems.push(...items.slice(startIdx, endIdx))
    }

    const offsetY = startRow * (itemHeight + gap)

    return (
        <div
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            className={className}
            style={{ height, overflow: 'auto', position: 'relative' }}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                <div
                    style={{
                        transform: `translateY(${offsetY}px)`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, ${itemWidth}px)`,
                        gap
                    }}
                >
                    {visibleItems.map((item, index) => (
                        <div key={startRow * columns + index}>
                            {renderItem(item, startRow * columns + index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

/**
 * Hook for virtual scrolling
 */
export function useVirtualScroll(
    itemCount: number,
    itemHeight: number,
    containerHeight: number,
    overscan = 3
) {
    const [scrollTop, setScrollTop] = useState(0)

    const totalHeight = itemCount * itemHeight
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIndex = Math.min(
        itemCount - 1,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    )

    const offsetY = startIndex * itemHeight

    return {
        totalHeight,
        startIndex,
        endIndex,
        offsetY,
        onScroll: (e: React.UIEvent<HTMLDivElement>) => {
            setScrollTop(e.currentTarget.scrollTop)
        }
    }
}
