"use client"

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Clipboard, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { captureComponentError } from '@/lib/error-tracking'
import { logger } from '@/lib/logger'
import { t } from '@/lib/i18n'

interface ErrorBoundaryProps {
    children: ReactNode
    fallback?: ReactNode
    onReset?: () => void
    section?: string // Name of the section for better error messages
}

interface ErrorBoundaryState {
    hasError: boolean
    error: Error | null
    errorInfo: React.ErrorInfo | null
    copied: boolean
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null, errorInfo: null, copied: false }
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
        this.setState({ hasError: false, error: null, errorInfo: null, copied: false })
        this.props.onReset?.()
    }

    handleReturnToMenu = () => {
        if (typeof window !== 'undefined') {
            window.location.href = '/main-menu'
        }
    }

    handleCopyDetails = async () => {
        const { error, errorInfo } = this.state
        const details = [
            `Section: ${this.props.section || 'Unknown'}`,
            `Time: ${new Date().toISOString()}`,
            `Message: ${error?.message ?? 'Unknown error'}`,
            `Route: ${typeof window !== 'undefined' ? window.location.pathname : 'N/A'}`,
            '',
            'Stack:',
            error?.stack ?? '(no stack)',
            '',
            'Component Stack:',
            errorInfo?.componentStack ?? '(no component stack)',
        ].join('\n')

        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(details)
                this.setState({ copied: true })
                setTimeout(() => this.setState({ copied: false }), 2000)
            }
        } catch {
            // Clipboard may be unavailable in some Electron contexts — fall
            // back to the logger so the payload is at least captured for
            // the in-game debug panel.
            logger.error('Failed to copy error details', details)
        }
    }

    render() {
        if (this.state.hasError) {
            // Custom fallback provided
            if (this.props.fallback) {
                return this.props.fallback
            }

            // Default error UI
            return (
                <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-line-strong bg-panel p-8 text-center">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-negative/40 bg-negative/10">
                        <AlertTriangle className="text-negative" size={24} aria-hidden="true" />
                    </div>
                    <h3 className="mb-2 font-display text-2xl font-bold uppercase leading-none text-ink-1">
                        {t("eb.title")}
                    </h3>
                    {this.state.error?.message && (
                        <p className="mb-2 max-w-md break-words font-mono text-xs text-ink-2">
                            {this.state.error.message}
                        </p>
                    )}
                    <p className="mb-6 max-w-md text-xs text-ink-3">
                        {t("eb.body")}
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <Button
                            onClick={this.handleReset}
                            variant="default"
                        >
                            <RefreshCw size={14} className="mr-2" />
                            {t("eb.retry")}
                        </Button>
                        <Button
                            onClick={this.handleCopyDetails}
                            variant="outline"
                        >
                            {this.state.copied ? (
                                <>
                                    <Check size={14} className="mr-2 text-positive" />
                                    {t("eb.copied")}
                                </>
                            ) : (
                                <>
                                    <Clipboard size={14} className="mr-2" />
                                    {t("eb.copy")}
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={this.handleReturnToMenu}
                            variant="ghost"
                        >
                            <Home size={14} className="mr-2" />
                            {t("eb.menu")}
                        </Button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
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
