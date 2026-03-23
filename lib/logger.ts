/**
 * Application logging utility
 * Provides consistent logging with environment-based behavior
 * Automatically strips console.logs in production builds
 */

type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
    level: LogLevel
    message: string
    data?: unknown
    timestamp: string
}

class Logger {
    private isDevelopment = process.env.NODE_ENV === 'development'
    private logHistory: LogEntry[] = []
    private maxHistorySize = 100

    private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
        const timestamp = new Date().toISOString()
        const prefix = `[${level.toUpperCase()}] ${timestamp}`
        return `${prefix} ${message}`
    }

    private addToHistory(level: LogLevel, message: string, data?: unknown) {
        this.logHistory.push({
            level,
            message,
            data,
            timestamp: new Date().toISOString()
        })

        // Keep history size manageable
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift()
        }
    }

    /**
     * Standard log - Only in development
     */
    log(message: string, ...args: unknown[]) {
        if (this.isDevelopment) {
            console.log(this.formatMessage('log', message), ...args)
            this.addToHistory('log', message, args)
        }
    }

    /**
     * Info log - Only in development
     */
    info(message: string, ...args: unknown[]) {
        if (this.isDevelopment) {
            console.info(this.formatMessage('info', message), ...args)
            this.addToHistory('info', message, args)
        }
    }

    /**
     * Warning - Always logged
     */
    warn(message: string, ...args: unknown[]) {
        console.warn(this.formatMessage('warn', message), ...args)
        this.addToHistory('warn', message, args)
    }

    /**
     * Error - Always logged
     */
    error(message: string, error?: Error | unknown, ...args: unknown[]) {
        console.error(this.formatMessage('error', message), error, ...args)
        this.addToHistory('error', message, { error, args })

        // Could integrate with error tracking service here
        // e.g., Sentry.captureException(error)
    }

    /**
     * Debug - Only in development with verbose flag
     */
    debug(message: string, ...args: unknown[]) {
        if (this.isDevelopment && process.env.VERBOSE_LOGGING === 'true') {
            console.debug(this.formatMessage('debug', message), ...args)
            this.addToHistory('debug', message, args)
        }
    }

    /**
     * Get recent log history
     */
    getHistory(limit = 50): LogEntry[] {
        return this.logHistory.slice(-limit)
    }

    /**
     * Clear log history
     */
    clearHistory() {
        this.logHistory = []
    }

    /**
     * Performance measurement
     */
    time(label: string) {
        if (this.isDevelopment) {
            console.time(label)
        }
    }

    timeEnd(label: string) {
        if (this.isDevelopment) {
            console.timeEnd(label)
        }
    }

    /**
     * Group logs together
     */
    group(label: string) {
        if (this.isDevelopment) {
            console.group(label)
        }
    }

    groupEnd() {
        if (this.isDevelopment) {
            console.groupEnd()
        }
    }
}

// Export singleton instance
export const logger = new Logger()

// Also export as default for convenience
export default logger
