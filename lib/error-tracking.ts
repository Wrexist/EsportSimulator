/**
 * Error Tracking & Monitoring
 * Sentry-compatible error tracking system
 */

interface ErrorReport {
    message: string
    stack?: string
    level: 'fatal' | 'error' | 'warning' | 'info'
    tags?: Record<string, string>
    context?: Record<string, any>
    user?: {
        id?: string
        username?: string
    }
    timestamp: number
}

class ErrorTracker {
    private enabled: boolean = process.env.NODE_ENV === 'production'
    private reports: ErrorReport[] = []
    private maxReports: number = 100
    private errorHandler: ((event: ErrorEvent) => void) | null = null
    private rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null
    private originalConsoleError: ((...args: any[]) => void) | null = null

    /**
     * Initialize error tracking
     */
    init(options?: { enabled?: boolean; endpoint?: string }) {
        if (options?.enabled !== undefined) {
            this.enabled = options.enabled
        }

        if (this.enabled) {
            this.setupGlobalHandlers()
        }
    }

    /**
     * Setup global error handlers
     */
    private setupGlobalHandlers() {
        if (typeof window === 'undefined') return

        // Catch unhandled errors
        this.errorHandler = (event: ErrorEvent) => {
            this.captureException(event.error || new Error(event.message), {
                tags: { type: 'unhandled' }
            })
        }
        window.addEventListener('error', this.errorHandler)

        // Catch unhandled promise rejections
        this.rejectionHandler = (event: PromiseRejectionEvent) => {
            this.captureException(
                new Error(`Unhandled promise rejection: ${event.reason}`),
                { tags: { type: 'promise' } }
            )
        }
        window.addEventListener('unhandledrejection', this.rejectionHandler)

        // Catch React errors - only actual Error objects, not warnings
        this.originalConsoleError = console.error
        const tracker = this
        console.error = (...args) => {
            const first = args[0]
            if (first instanceof Error) {
                tracker.captureException(first, {
                    tags: { type: 'console' }
                })
            }
            tracker.originalConsoleError?.apply(console, args)
        }
    }

    /**
     * Cleanup global handlers to prevent memory leaks
     */
    cleanup() {
        if (typeof window === 'undefined') return
        if (this.errorHandler) {
            window.removeEventListener('error', this.errorHandler)
            this.errorHandler = null
        }
        if (this.rejectionHandler) {
            window.removeEventListener('unhandledrejection', this.rejectionHandler)
            this.rejectionHandler = null
        }
        if (this.originalConsoleError) {
            console.error = this.originalConsoleError
            this.originalConsoleError = null
        }
    }

    /**
     * Capture an exception
     */
    captureException(
        error: Error,
        options?: {
            tags?: Record<string, string>
            context?: Record<string, any>
            level?: ErrorReport['level']
        }
    ) {
        if (!this.enabled) return

        const report: ErrorReport = {
            message: error.message,
            stack: error.stack,
            level: options?.level || 'error',
            tags: options?.tags,
            context: options?.context,
            timestamp: Date.now()
        }

        this.reports.push(report)

        // Keep only last N reports
        if (this.reports.length > this.maxReports) {
            this.reports.shift()
        }

        // Log to console in development
        if (process.env.NODE_ENV !== 'production') {
            console.error('[Error Tracker]', report)
        }

        // In production, you'd send to your error tracking service
        this.sendToService(report)
    }

    /**
     * Capture a message
     */
    captureMessage(
        message: string,
        level: ErrorReport['level'] = 'info',
        context?: Record<string, any>
    ) {
        this.captureException(new Error(message), { level, context })
    }

    /**
     * Send to error tracking service
     */
    private async sendToService(report: ErrorReport) {
        try {
            // Write to Electron log file if available (persists to disk)
            if (typeof window !== 'undefined' && (window as any).electron?.log?.writeError) {
                (window as any).electron.log.writeError(report)
            }

            // Also store in localStorage as fallback
            const stored = this.getStoredErrors()
            stored.push(report)
            const limited = stored.slice(-50)
            localStorage.setItem('error-reports', JSON.stringify(limited))
        } catch (error) {
            console.error('Failed to store error report:', error)
        }
    }

    /**
     * Get stored errors
     */
    private getStoredErrors(): ErrorReport[] {
        try {
            const stored = localStorage.getItem('error-reports')
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    }

    /**
     * Get all error reports
     */
    getReports(): ErrorReport[] {
        return [...this.reports]
    }

    /**
     * Clear error reports
     */
    clearReports() {
        this.reports = []
        localStorage.removeItem('error-reports')
    }

    /**
     * Set user context
     */
    setUser(user: { id?: string; username?: string }) {
        // Store user context for all future errors
        if (typeof window !== 'undefined') {
            (window as any).__errorTrackerUser = user
        }
    }

    /**
     * Add breadcrumb (for debugging)
     */
    addBreadcrumb(message: string, category?: string, data?: any) {
        // Store breadcrumbs for context
        const breadcrumbs = this.getBreadcrumbs()
        breadcrumbs.push({
            message,
            category,
            data,
            timestamp: Date.now()
        })

        // Keep only last 50
        const limited = breadcrumbs.slice(-50)
        sessionStorage.setItem('error-breadcrumbs', JSON.stringify(limited))
    }

    /**
     * Get breadcrumbs
     */
    private getBreadcrumbs(): any[] {
        try {
            const stored = sessionStorage.getItem('error-breadcrumbs')
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    }
}

// Export singleton instance
export const errorTracker = new ErrorTracker()

/**
 * React Error Boundary integration
 */
export function captureComponentError(
    error: Error,
    errorInfo: React.ErrorInfo
) {
    errorTracker.captureException(error, {
        tags: { type: 'component' },
        context: {
            componentStack: errorInfo.componentStack
        }
    })
}

/**
 * Game-specific error tracking
 */
export const gameErrors = {
    matchSimulation: (error: Error) => {
        errorTracker.captureException(error, {
            tags: { feature: 'match-simulation' },
            level: 'error'
        })
    },

    saveLoad: (error: Error, saveId?: string) => {
        errorTracker.captureException(error, {
            tags: { feature: 'save-system' },
            context: { saveId },
            level: 'fatal'
        })
    },

    transfer: (error: Error, playerId?: string) => {
        errorTracker.captureException(error, {
            tags: { feature: 'transfers' },
            context: { playerId }
        })
    }
}

/**
 * Initialize on app start
 */
if (typeof window !== 'undefined') {
    errorTracker.init({
        enabled: process.env.NODE_ENV === 'production'
    })
}
