"use client"

/**
 * Accessibility Utilities
 * ARIA labels, keyboard navigation, and screen reader support
 */

import { useEffect } from 'react'

/**
 * Screen reader only text
 */
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
    return (
        <span className="sr-only">
            {children}
        </span>
    )
}

/**
 * Skip to main content link
 */
export function SkipToContent() {
    return (
        <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded"
        >
            Skip to main content
        </a>
    )
}

/**
 * Announce to screen readers
 */
export function useAnnounce() {
    const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const announcement = document.createElement('div')
        announcement.setAttribute('role', 'status')
        announcement.setAttribute('aria-live', priority)
        announcement.setAttribute('aria-atomic', 'true')
        announcement.className = 'sr-only'
        announcement.textContent = message

        document.body.appendChild(announcement)

        setTimeout(() => {
            document.body.removeChild(announcement)
        }, 1000)
    }

    return { announce }
}

/**
 * Focus trap for modals
 */
export function useFocusTrap(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return

        const focusableElements = document.querySelectorAll(
            'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )

        const firstElement = focusableElements[0] as HTMLElement
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    e.preventDefault()
                    lastElement?.focus()
                }
            } else {
                if (document.activeElement === lastElement) {
                    e.preventDefault()
                    firstElement?.focus()
                }
            }
        }

        document.addEventListener('keydown', handleTab)
        firstElement?.focus()

        return () => {
            document.removeEventListener('keydown', handleTab)
        }
    }, [enabled])
}

/**
 * Accessible button props
 */
export function getAccessibleButtonProps(label: string, disabled = false) {
    return {
        'aria-label': label,
        'aria-disabled': disabled,
        role: 'button',
        tabIndex: disabled ? -1 : 0
    }
}

/**
 * Accessible link props
 */
export function getAccessibleLinkProps(label: string, external = false) {
    return {
        'aria-label': label,
        ...(external && {
            'aria-label': `${label} (opens in new tab)`,
            target: '_blank',
            rel: 'noopener noreferrer'
        })
    }
}

/**
 * Keyboard navigation helper
 */
export function useKeyboardNavigation(
    items: any[],
    onSelect: (index: number) => void
) {
    useEffect(() => {
        let currentIndex = 0

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    currentIndex = Math.min(currentIndex + 1, items.length - 1)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    currentIndex = Math.max(currentIndex - 1, 0)
                    break
                case 'Enter':
                case ' ':
                    e.preventDefault()
                    onSelect(currentIndex)
                    break
                case 'Home':
                    e.preventDefault()
                    currentIndex = 0
                    break
                case 'End':
                    e.preventDefault()
                    currentIndex = items.length - 1
                    break
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [items, onSelect])
}

/**
 * ARIA live region for dynamic content
 */
export function LiveRegion({
    children,
    priority = 'polite'
}: {
    children: React.ReactNode
    priority?: 'polite' | 'assertive' | 'off'
}) {
    return (
        <div role="status" aria-live={priority} aria-atomic="true">
            {children}
        </div>
    )
}
