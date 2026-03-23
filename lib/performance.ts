import React, { memo, useMemo, useCallback } from 'react'

/**
 * Performance Optimization Utilities
 * Reusable memoization helpers and HOCs
 */

/**
 * Memoize expensive calculations
 * @example
 * const chemistry = useMemoizedValue(() => calculateChemistry(roster), [roster])
 */
export function useMemoizedValue<T>(factory: () => T, deps: React.DependencyList): T {
    return useMemo(factory, deps)
}

/**
 * Memoize callbacks
 * @example
 * const handleClick = useMemoizedCallback(() => doSomething(id), [id])
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
    callback: T,
    deps: React.DependencyList
): T {
    return useCallback(callback, deps) as T
}

/**
 * Memoize component by props
 * @example
 * const MemoizedPlayerCard = memoComponent(PlayerCard, (prev, next) => 
 *   prev.player.id === next.player.id && prev.player.updatedAt === next.player.updatedAt
 * )
 */
export function memoComponent<P extends object>(
    Component: React.ComponentType<P>,
    propsAreEqual?: (prev: P, next: P) => boolean
): React.MemoExoticComponent<React.ComponentType<P>> {
    return memo(Component, propsAreEqual)
}

/**
 * Shallow comparison for memo
 */
export function shallowEqual<P extends object>(prev: P, next: P): boolean {
    const prevKeys = Object.keys(prev) as (keyof P)[]
    const nextKeys = Object.keys(next) as (keyof P)[]

    if (prevKeys.length !== nextKeys.length) return false

    for (const key of prevKeys) {
        if (prev[key] !== next[key]) return false
    }

    return true
}

/**
 * Deep comparison for specific keys
 */
export function deepEqualKeys<P extends object>(keys: (keyof P)[]) {
    return (prev: P, next: P): boolean => {
        for (const key of keys) {
            if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
                return false
            }
        }
        return true
    }
}

/**
 * Commonly used memoized components
 */

// Memoize by ID
export const memoById = <P extends { id: string }>(Component: React.ComponentType<P>) =>
    memo(Component, (prev, next) => prev.id === next.id)

// Memoize by ID and updatedAt
export const memoByIdAndTimestamp = <P extends { id: string; updatedAt?: string | number }>(
    Component: React.ComponentType<P>
) =>
    memo(Component, (prev, next) =>
        prev.id === next.id && prev.updatedAt === next.updatedAt
    )

/**
 * Batch updates helper
 */
export function batchUpdates<T>(
    items: T[],
    update: (item: T) => void,
    batchSize = 10,
    delay = 0
): Promise<void> {
    return new Promise((resolve) => {
        let index = 0

        const processBatch = () => {
            const batch = items.slice(index, index + batchSize)
            batch.forEach(update)
            index += batchSize

            if (index < items.length) {
                setTimeout(processBatch, delay)
            } else {
                resolve()
            }
        }

        processBatch()
    })
}

/**
 * Debounce helper
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout)
        timeout = setTimeout(() => func(...args), wait)
    }
}

/**
 * Throttle helper
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null
    let lastRan: number | null = null

    return (...args: Parameters<T>) => {
        if (!lastRan) {
            func(...args)
            lastRan = Date.now()
        } else {
            if (timeout) clearTimeout(timeout)
            timeout = setTimeout(() => {
                if (Date.now() - lastRan! >= wait) {
                    func(...args)
                    lastRan = Date.now()
                }
            }, wait - (Date.now() - lastRan))
        }
    }
}
