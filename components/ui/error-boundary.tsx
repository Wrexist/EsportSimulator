"use client"

import React, { Component, ReactNode, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CrashCard, crashDetails } from '@/components/ui/crash-card'
import { captureComponentError } from '@/lib/error-tracking'
import { logger } from '@/lib/logger'
import { t } from '@/lib/i18n'

interface ErrorBoundaryProps {
    children: ReactNode
    /** Replaces the default crash card; as a function it gets the error and a reset. */
    fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
    onReset?: () => void
    section?: string // Name of the section for better error messages
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null }
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        logger.error('ErrorBoundary caught an error', error, errorInfo)
        this.setState({ errorInfo })
        captureComponentError(error, errorInfo)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null })
        this.props.onReset?.()
    }

    render() {
        if (this.state.hasError) {
            const { fallback } = this.props
            if (typeof fallback === 'function') return fallback(this.state.error ?? new Error('Unknown error'), this.handleReset)
            if (fallback) return fallback

            // Default: the shared crash card.
            return (
                <CrashCard
                    title={t("eb.title")}
                    body={t("eb.body")}
                    message={this.state.error?.message}
                    details={() => crashDetails(this.state.error, this.props.section, this.state.errorInfo?.componentStack)}
                    actions={
                        <>
                            <Button onClick={this.handleReset}>
                                <RefreshCw aria-hidden="true" />
                                {t("eb.retry")}
                            </Button>
                            <MainMenuAction onArrive={this.handleReset} />
                        </>
                    }
                />
            )
        }

        return this.props.children
    }
}

/**
 * "Main menu" on the crash card: navigates in the app (a full reload would
 * drop the career in memory, CROSSCUT-16) and clears the boundary once the
 * menu is shown. On the menu itself, or without the router, it reloads.
 */
function MainMenuAction({ onArrive }: { onArrive: () => void }) {
    const router = useRouter()
    const pathname = usePathname()
    const requested = useRef(false)
    useEffect(() => {
        if (requested.current && pathname === '/main-menu') {
            requested.current = false
            onArrive()
        }
    }, [pathname, onArrive])
    const go = () => {
        if (pathname === '/main-menu') { window.location.href = '/main-menu'; return }
        requested.current = true
        try { router.push('/main-menu') } catch { window.location.href = '/main-menu' }
    }
    return (
        <Button onClick={go} variant="outline">
            <Home aria-hidden="true" />
            {t("eb.menu")}
        </Button>
    )
}

/**
 * Inline Error Fallback - For smaller sections
 */
export function InlineErrorFallback({
    message,
    onRetry,
}: {
    message?: string
    onRetry?: () => void
}) {
    return (
        <div className="flex items-center gap-3 p-3 bg-negative/5 border border-negative/30 rounded-lg text-sm">
            <AlertTriangle className="shrink-0 text-negative" size={16} aria-hidden="true" />
            <span className="text-negative">{message ?? t("eb.inline")}</span>
            {onRetry && (
                <Button
                    onClick={onRetry}
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-negative hover:text-negative hover:bg-negative/10 h-7 px-2"
                >
                    <RefreshCw size={12} className="mr-1" />
                    {t("eb.inlineRetry")}
                </Button>
            )}
        </div>
    )
}
