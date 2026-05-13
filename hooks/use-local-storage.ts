import { useState, useEffect } from 'react'

/**
 * useLocalStorage Hook
 * Persist state to localStorage
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T
): [T, (value: T) => void] {
    // Get from local storage or use initial value
    const [storedValue, setStoredValue] = useState<T>(() => {
        if (typeof window === 'undefined') {
            return initialValue
        }

        try {
            const item = window.localStorage.getItem(key)
            return item ? JSON.parse(item) : initialValue
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`Error reading localStorage key "${key}":`, error)
            }
            return initialValue
        }
    })

    // Update local storage when value changes
    const setValue = (value: T) => {
        try {
            setStoredValue(value)

            if (typeof window !== 'undefined') {
                window.localStorage.setItem(key, JSON.stringify(value))
            }
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error(`Error setting localStorage key "${key}":`, error)
            }
        }
    }

    return [storedValue, setValue]
}
