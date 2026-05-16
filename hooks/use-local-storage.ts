import { useState } from 'react'
import { safeParse, safeStringify } from '@/lib/json-safe'
import { logger } from '@/lib/logger'

/**
 * useLocalStorage Hook
 * Persist state to localStorage
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T
): [T, (value: T) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        if (typeof window === 'undefined') {
            return initialValue
        }
        const raw = window.localStorage.getItem(key)
        const parsed = safeParse<T>(raw, null)
        return parsed === null ? initialValue : parsed
    })

    const setValue = (value: T) => {
        setStoredValue(value)
        if (typeof window === 'undefined') return
        const encoded = safeStringify(value)
        try {
            window.localStorage.setItem(key, encoded)
        } catch (err) {
            // Storage quota exceeded, private-mode restrictions, etc.
            logger.error(`[useLocalStorage] write failed for "${key}"`, err)
        }
    }

    return [storedValue, setValue]
}
