"use client"

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
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
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        if (process.env.NODE_ENV === 'development') {
            console.error('ErrorBoundary caught an error:', error, errorInfo)
        }
        captureComponentError(error, errorInfo)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null })
        this.props.onReset?.()
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
                    <p className="text-sm text-muted-foreground mb-6 max-w-md">
                        {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
                    </p>
                    <div className="flex gap-3">
                        <Button
                            onClick={this.handleReset}
                            variant="default"
                            className="bg-red-500 hover:bg-red-600 text-white border-none"
                        >
                            <RefreshCw size={14} className="mr-2" />
                            Try Again
                        </Button>
                        <Button
                            onClick={() => window.location.reload()}
                            variant="outline"
                            className="border-white/10 hover:bg-white/5"
                        >
                            Reload Page
                        </Button>
                        <Button
                            onClick={() => window.location.href = '/'}
                            variant="ghost"
                            className="hover:bg-white/5"
                        >
                            Go Home
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
