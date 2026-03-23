"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light' | 'system'

interface ThemeStore {
    theme: Theme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

/**
 * Theme/Dark Mode Store
 * Manages application theme with persistence
 */
export const useTheme = create<ThemeStore>()(
    persist(
        (set, get) => ({
            theme: 'dark',

            setTheme: (theme: Theme) => {
                set({ theme })
                applyTheme(theme)
            },

            toggleTheme: () => {
                const current = get().theme
                const next = current === 'dark' ? 'light' : 'dark'
                get().setTheme(next)
            }
        }),
        {
            name: 'theme-storage'
        }
    )
)

/**
 * Apply theme to document
 */
function applyTheme(theme: Theme) {
    if (typeof window === 'undefined') return

    const root = window.document.documentElement

    // Remove existing theme classes
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
        root.classList.add(systemTheme)
    } else {
        root.classList.add(theme)
    }
}

/**
 * Initialize theme on app load
 */
export function initializeTheme() {
    const { theme } = useTheme.getState()
    applyTheme(theme)

    // Listen for system theme changes
    if (theme === 'system') {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        mediaQuery.addEventListener('change', (e) => {
            applyTheme('system')
        })
    }
}

/**
 * Theme Toggle Component
 */
export function ThemeToggle() {
    const { theme, setTheme } = useTheme()

    return (
        <div className="flex items-center gap-2 glass-panel p-2 rounded-lg">
            <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded transition-colors ${theme === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'
                    }`}
                aria-label="Light mode"
            >
                ☀️
            </button>
            <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded transition-colors ${theme === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'
                    }`}
                aria-label="Dark mode"
            >
                🌙
            </button>
            <button
                onClick={() => setTheme('system')}
                className={`p-2 rounded transition-colors ${theme === 'system' ? 'bg-primary text-primary-foreground' : 'hover:bg-white/10'
                    }`}
                aria-label="System theme"
            >
                💻
            </button>
        </div>
    )
}
