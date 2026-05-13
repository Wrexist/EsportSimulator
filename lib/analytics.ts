/**
 * Analytics & Game Metrics
 * Track player behavior and game statistics
 */

interface AnalyticsEvent {
    name: string
    properties?: Record<string, any>
    timestamp: number
    sessionId: string
}

interface GameMetrics {
    // Player engagement
    matchesPlayed: number
    totalPlayTime: number
    averageSessionLength: number

    // Game progression
    currentWeek: number
    tournamentsWon: number
    playersAcquired: number

    // User behavior
    featuresUsed: Set<string>
    mostVisitedPage: string

    // Performance
    averageFPS: number
    loadTime: number
}

class Analytics {
    private events: AnalyticsEvent[] = []
    private sessionId: string
    private sessionStart: number
    private metrics: Partial<GameMetrics> = {}
    private enabled: boolean = true

    constructor() {
        this.sessionId = this.generateSessionId()
        this.sessionStart = Date.now()
        this.loadMetrics()
    }

    /**
     * Generate session ID
     */
    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Track an event
     */
    track(eventName: string, properties?: Record<string, any>) {
        if (!this.enabled) return

        const event: AnalyticsEvent = {
            name: eventName,
            properties,
            timestamp: Date.now(),
            sessionId: this.sessionId
        }

        this.events.push(event)

        // Store events
        this.storeEvents()

        // Log in development
        if (process.env.NODE_ENV !== 'production') {
            console.log('[Analytics]', eventName, properties)
        }
    }

    /**
     * Track page view
     */
    page(pageName: string, properties?: Record<string, any>) {
        this.track('page_view', {
            page: pageName,
            ...properties
        })

        // Update most visited page
        this.updateMetric('mostVisitedPage', pageName)
    }

    /**
     * Track game events
     */
    game = {
        matchStarted: (matchId: string, format: string) => {
            this.track('match_started', { matchId, format })
        },

        matchCompleted: (matchId: string, result: 'win' | 'loss', duration: number) => {
            this.track('match_completed', { matchId, result, duration })
            this.incrementMetric('matchesPlayed')
        },

        playerSigned: (playerId: string, salary: number) => {
            this.track('player_signed', { playerId, salary })
            this.incrementMetric('playersAcquired')
        },

        tournamentWon: (tournamentId: string, prize: number) => {
            this.track('tournament_won', { tournamentId, prize })
            this.incrementMetric('tournamentsWon')
        },

        saveGame: () => {
            this.track('game_saved')
        },

        loadGame: (saveId: string) => {
            this.track('game_loaded', { saveId })
        },

        weekAdvanced: (week: number) => {
            this.track('week_advanced', { week })
            this.updateMetric('currentWeek', week)
        }
    }

    /**
     * Track feature usage
     */
    feature(featureName: string, action: string, properties?: Record<string, any>) {
        this.track('feature_usage', {
            feature: featureName,
            action,
            ...properties
        })

        // Track features used
        if (!this.metrics.featuresUsed) {
            this.metrics.featuresUsed = new Set()
        }
        this.metrics.featuresUsed.add(featureName)
    }

    /**
     * Track performance
     */
    performance = {
        pageLoad: (page: string, duration: number) => {
            this.track('page_load_time', { page, duration })
            this.updateMetric('loadTime', duration)
        },

        fps: (fps: number) => {
            this.updateMetric('averageFPS', fps)
        },

        memoryUsage: (bytes: number) => {
            this.track('memory_usage', { bytes })
        }
    }

    /**
     * Update metric
     */
    private updateMetric(key: keyof GameMetrics, value: any) {
        this.metrics[key] = value as any
        this.storeMetrics()
    }

    /**
     * Increment metric
     */
    private incrementMetric(key: keyof GameMetrics) {
        const current = (this.metrics[key] as number) || 0
        this.metrics[key] = (current + 1) as any
        this.storeMetrics()
    }

    /**
     * Get metrics
     */
    getMetrics(): Partial<GameMetrics> {
        return {
            ...this.metrics,
            totalPlayTime: this.getTotalPlayTime(),
            averageSessionLength: this.getAverageSessionLength()
        }
    }

    /**
     * Get total play time
     */
    private getTotalPlayTime(): number {
        const stored = localStorage.getItem('total-play-time')
        const previous = stored ? parseInt(stored) : 0
        const current = Date.now() - this.sessionStart
        return previous + current
    }

    /**
     * Get average session length
     */
    private getAverageSessionLength(): number {
        const sessions = this.getStoredEvents()
            .filter(e => e.name === 'session_end')

        if (sessions.length === 0) return 0

        const total = sessions.reduce((sum, e) => sum + (e.properties?.duration || 0), 0)
        return total / sessions.length
    }

    /**
     * Store events
     */
    private storeEvents() {
        try {
            // Keep only last 1000 events
            const limited = this.events.slice(-1000)
            localStorage.setItem('analytics-events', JSON.stringify(limited))
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Failed to store analytics events:', error)
            }
        }
    }

    /**
     * Get stored events
     */
    private getStoredEvents(): AnalyticsEvent[] {
        try {
            const stored = localStorage.getItem('analytics-events')
            return stored ? JSON.parse(stored) : []
        } catch {
            return []
        }
    }

    /**
     * Load metrics
     */
    private loadMetrics() {
        try {
            const stored = localStorage.getItem('game-metrics')
            if (stored) {
                const parsed = JSON.parse(stored)
                // Reconstruct Set
                if (parsed.featuresUsed) {
                    parsed.featuresUsed = new Set(parsed.featuresUsed)
                }
                this.metrics = parsed
            }
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Failed to load metrics:', error)
            }
        }
    }

    /**
     * Store metrics
     */
    private storeMetrics() {
        try {
            // Convert Set to Array for storage
            const toStore = {
                ...this.metrics,
                featuresUsed: this.metrics.featuresUsed
                    ? Array.from(this.metrics.featuresUsed)
                    : []
            }
            localStorage.setItem('game-metrics', JSON.stringify(toStore))
        } catch (error) {
            if (process.env.NODE_ENV !== 'production') {
                console.error('Failed to store metrics:', error)
            }
        }
    }

    /**
     * Export analytics data
     */
    exportData() {
        return {
            events: this.getStoredEvents(),
            metrics: this.getMetrics(),
            sessionId: this.sessionId,
            timestamp: Date.now()
        }
    }

    /**
     * Clear analytics data
     */
    clearData() {
        this.events = []
        this.metrics = {}
        localStorage.removeItem('analytics-events')
        localStorage.removeItem('game-metrics')
    }

    /**
     * End session
     */
    endSession() {
        const duration = Date.now() - this.sessionStart
        this.track('session_end', { duration })

        // Update total play time
        const totalPlayTime = this.getTotalPlayTime()
        localStorage.setItem('total-play-time', totalPlayTime.toString())
    }
}

// Export singleton
export const analytics = new Analytics()

// Track session end on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        analytics.endSession()
    })
}
