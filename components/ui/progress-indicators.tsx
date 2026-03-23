import React from 'react'
import { Progress } from '@/components/ui/progress'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProgressTrackerProps {
    steps: {
        label: string
        status: 'pending' | 'in-progress' | 'complete' | 'error'
    }[]
    currentStep: number
    className?: string
}

/**
 * Progress Tracker Component
 * Shows multi-step progress for long operations
 */
export function ProgressTracker({ steps, currentStep, className }: ProgressTrackerProps) {
    const progress = ((currentStep + 1) / steps.length) * 100

    return (
        <div className={cn('space-y-4', className)}>
            <Progress value={progress} className="h-2" />

            <div className="space-y-2">
                {steps.map((step, idx) => {
                    const isActive = idx === currentStep
                    const isComplete = step.status === 'complete'
                    const isError = step.status === 'error'

                    return (
                        <div
                            key={idx}
                            className={cn(
                                'flex items-center gap-3 p-2 rounded transition-colors',
                                isActive && 'bg-primary/10',
                                isComplete && 'opacity-50'
                            )}
                        >
                            {isComplete ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            ) : isActive ? (
                                <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                            ) : isError ? (
                                <div className="w-4 h-4 rounded-full bg-red-500 flex-shrink-0" />
                            ) : (
                                <div className="w-4 h-4 rounded-full bg-white/10 flex-shrink-0" />
                            )}

                            <span className={cn(
                                'text-sm',
                                isActive && 'font-medium text-white',
                                !isActive && 'text-muted-foreground'
                            )}>
                                {step.label}
                            </span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

/**
 * Simple Progress Bar with Label
 */
export function LabeledProgress({
    value,
    label,
    showPercentage = true,
    className
}: {
    value: number
    label?: string
    showPercentage?: boolean
    className?: string
}) {
    return (
        <div className={cn('space-y-2', className)}>
            <div className="flex justify-between items-center text-sm">
                {label && <span className="text-muted-foreground">{label}</span>}
                {showPercentage && <span className="font-medium">{Math.round(value)}%</span>}
            </div>
            <Progress value={value} />
        </div>
    )
}

/**
 * Circular Progress Indicator
 */
export function CircularProgress({
    value,
    size = 'md',
    showLabel = false,
    className
}: {
    value: number
    size?: 'sm' | 'md' | 'lg'
    showLabel?: boolean
    className?: string
}) {
    const sizeMap = {
        sm: 40,
        md: 60,
        lg: 80
    }

    const dimension = sizeMap[size]
    const strokeWidth = 4
    const radius = (dimension - strokeWidth) / 2
    const circumference = radius * 2 * Math.PI
    const offset = circumference - (value / 100) * circumference

    return (
        <div className={cn('relative inline-flex items-center justify-center', className)}>
            <svg width={dimension} height={dimension} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={dimension / 2}
                    cy={dimension / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    className="text-white/10"
                />
                {/* Progress circle */}
                <circle
                    cx={dimension / 2}
                    cy={dimension / 2}
                    r={radius}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="text-primary transition-all duration-300"
                />
            </svg>

            {showLabel && (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                    {Math.round(value)}%
                </span>
            )}
        </div>
    )
}
