"use client"

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home, Clipboard, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { captureComponentError } from '@/lib/error-tracking'

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
        if (process.env.NODE_ENV !== 'production') {
            console.error('ErrorBoundary caught an error:', error, errorInfo)
        }
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
            // Fallback: log to console in dev only — clipboard may be unavailable in some Electron contexts
            if (process.env.NODE_ENV !== 'production') {
                console.error('Failed to copy error details:', details)
            }
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
                <div className="flex flex-col items-center justify-center p-8 text-center bg-red-500/5 border border-red-500/20 rounded-xl min-h-[50vh]">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                        <AlertTriangle className="text-red-500" size={32} />
                    </div>
                    <h3 className="text-xl font-medium text-white mb-2">
                        {this.props.section ? `Error in ${this.props.section}` : 'Something went wrong'}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2 max-w-md">
                        {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mb-6 max-w-md">
                        Your game data is safe. You can try again, copy the error details for a bug report, or return to the main menu.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                        <Button
                            onClick={this.handleReset}
                            variant="default"
                            className="bg-red-500 hover:bg-red-600 text-white border-none"
                        >
                            <RefreshCw size={14} className="mr-2" />
                            Try Again
                        </Button>
                        <Button
                            onClick={this.handleCopyDetails}
                            variant="outline"
                            className="border-white/10 hover:bg-white/5"
                        >
                            {this.state.copied ? (
                                <>
                                    <Check size={14} className="mr-2 text-green-400" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Clipboard size={14} className="mr-2" />
                                    Copy Error Details
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={this.handleReturnToMenu}
                            variant="ghost"
                            className="hover:bg-white/5"
                        >
                            <Home size={14} className="mr-2" />
                            Return to Main Menu
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
    message = "Failed to load",
    onRetry,
}: {
    message?: string
    onRetry?: () => void
}) {
    return (
        <div className="flex items-center gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-sm">
            <AlertTriangle className="text-red-500 shrink-0" size={16} />
            <span className="text-red-400">{message}</span>
            {onRetry && (
                <Button
                    onClick={onRetry}
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                >
                    <RefreshCw size={12} className="mr-1" />
                    Retry
                </Button>
            )}
        </div>
    )
}
