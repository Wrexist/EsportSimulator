/**
 * Comprehensive Error Handling System
 * Game-specific error messages, suggestions, and recovery actions
 */

"use client"

import { AlertCircle, XCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface GameError {
    code: string
    title: string
    message: string
    suggestions?: string[]
    severity: 'error' | 'warning' | 'info'
    actions?: ErrorAction[]
}

export interface ErrorAction {
    label: string
    action: () => void
    variant?: 'default' | 'destructive' | 'outline'
}

/**
 * Game-specific errors
 */
export const GAME_ERRORS = {
    // Financial errors
    INSUFFICIENT_FUNDS: {
        code: 'INSUFFICIENT_FUNDS',
        title: 'Insufficient Funds',
        message: 'You don\'t have enough money for this action.',
        suggestions: [
            'Win more matches to earn prize money',
            'Sell a player to raise funds',
            'Wait for weekly sponsor payments',
            'Reduce player salaries in contracts'
        ],
        severity: 'error' as const
    },

    // Roster errors
    ROSTER_FULL: {
        code: 'ROSTER_FULL',
        title: 'Roster Full',
        message: 'Your roster is at maximum capacity (5 players).',
        suggestions: [
            'Release a player first',
            'Sell a player to another team',
            'Wait for contract expiration'
        ],
        severity: 'warning' as const
    },

    // Match errors
    MATCH_NOT_FOUND: {
        code: 'MATCH_NOT_FOUND',
        title: 'Match Not Found',
        message: 'The requested match could not be found.',
        suggestions: [
            'Check the schedule page',
            'Return to dashboard',
            'The match may have been rescheduled'
        ],
        severity: 'error' as const
    },

    // Save/Load errors
    SAVE_FAILED: {
        code: 'SAVE_FAILED',
        title: 'Save Failed',
        message: 'Failed to save your game progress.',
        suggestions: [
            'Check available disk space',
            'Try saving again',
            'Export save file manually',
            'Check browser storage permissions'
        ],
        severity: 'error' as const
    },

    LOAD_FAILED: {
        code: 'LOAD_FAILED',
        title: 'Load Failed',
        message: 'Failed to load game save.',
        suggestions: [
            'The save file may be corrupted',
            'Try loading a different save',
            'Start a new game'
        ],
        severity: 'error' as const
    },

    // Validation errors
    INVALID_CONTRACT: {
        code: 'INVALID_CONTRACT',
        title: 'Invalid Contract',
        message: 'The contract terms are invalid.',
        suggestions: [
            'Salary must be between $1,000 and $50,000',
            'Duration must be between 1 and 208 weeks',
            'Check bonus amounts'
        ],
        severity: 'warning' as const
    },

    INVALID_LINEUP: {
        code: 'INVALID_LINEUP',
        title: 'Invalid Lineup',
        message: 'Your lineup is invalid for this match.',
        suggestions: [
            'You need exactly 5 players',
            'All players must be healthy',
            'Check player energy levels'
        ],
        severity: 'error' as const
    },

    // Transfer errors
    PLAYER_ALREADY_IN_NEGOTIATIONS: {
        code: 'PLAYER_IN_NEGOTIATIONS',
        title: 'Player Unavailable',
        message: 'This player is already in transfer negotiations.',
        suggestions: [
            'Wait for current negotiations to complete',
            'Look for other players',
            'Check back later'
        ],
        severity: 'warning' as const
    },

    // Academy errors
    ACADEMY_FULL: {
        code: 'ACADEMY_FULL',
        title: 'Academy Full',
        message: 'Your academy is at maximum capacity.',
        suggestions: [
            'Promote a player to main roster',
            'Release an academy player',
            'Upgrade academy facilities for more slots'
        ],
        severity: 'warning' as const
    },

    // General errors
    NETWORK_ERROR: {
        code: 'NETWORK_ERROR',
        title: 'Network Error',
        message: 'A network error occurred.',
        suggestions: [
            'Check your internet connection',
            'Retry the operation',
            'The server may be temporarily unavailable'
        ],
        severity: 'error' as const
    },

    UNKNOWN_ERROR: {
        code: 'UNKNOWN_ERROR',
        title: 'Unknown Error',
        message: 'An unexpected error occurred.',
        suggestions: [
            'Try refreshing the page',
            'Check the console for details',
            'Contact support if the issue persists'
        ],
        severity: 'error' as const
    }
}

/**
 * Create error with optional actions
 */
export function createError(
    errorCode: keyof typeof GAME_ERRORS,
    options?: {
        actions?: ErrorAction[]
        additionalMessage?: string
    }
): GameError {
    const baseError = GAME_ERRORS[errorCode]

    return {
        ...baseError,
        message: options?.additionalMessage
            ? `${baseError.message} ${options.additionalMessage}`
            : baseError.message,
        actions: options?.actions
    }
}

/**
 * Error Display Component
 */
export function ErrorDisplay({
    error,
    onDismiss
}: {
    error: GameError
    onDismiss?: () => void
}) {
    const icons = {
        error: AlertCircle,
        warning: AlertTriangle,
        info: Info
    }

    const iconColors = {
        error: 'text-red-500',
        warning: 'text-amber-500',
        info: 'text-blue-500'
    }

    const Icon = icons[error.severity]
    const iconColor = iconColors[error.severity]

    return (
        <div className="glass-panel p-6 border-l-4 border-red-500">
            <div className="flex items-start gap-4">
                <Icon className={`w-6 h-6 ${iconColor} flex-shrink-0`} />

                <div className="flex-1">
                    <div className="flex items-start justify-between">
                        <h4 className="font-bold text-lg mb-2">{error.title}</h4>
                    </div>
                    <p className="text-muted-foreground mb-4">{error.message}</p>

                    {error.suggestions && error.suggestions.length > 0 && (
                        <div className="mb-4">
                            <p className="text-sm font-semibold mb-2">Suggestions:</p>
                            <ul className="list-disc pl-5 space-y-1 text-sm">
                                {error.suggestions.map((suggestion, idx) => (
                                    <li key={idx} className="text-muted-foreground">
                                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                                        {suggestion}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {error.actions && error.actions.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                            {error.actions.map((action, idx) => (
                                <Button
                                    key={idx}
                                    size="sm"
                                    variant={action.variant || 'default'}
                                    onClick={action.action}
                                >
                                    {action.label}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>

                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <XCircle className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
    )
}
