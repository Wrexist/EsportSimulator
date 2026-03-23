"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChevronRight, X, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface TutorialStep {
    id: string
    title: string
    content: React.ReactNode
    target?: string // CSS selector for highlighting
    position?: 'top' | 'bottom' | 'left' | 'right'
}

interface TutorialProps {
    steps: TutorialStep[]
    onComplete: () => void
    onSkip: () => void
}

/**
 * Tutorial System
 * Interactive guided tutorials for new users
 */
export function Tutorial({ steps, onComplete, onSkip }: TutorialProps) {
    const [currentStep, setCurrentStep] = useState(0)
    const [isOpen, setIsOpen] = useState(true)

    const step = steps[currentStep]
    const isLastStep = currentStep === steps.length - 1

    const handleNext = () => {
        if (isLastStep) {
            onComplete()
            setIsOpen(false)
        } else {
            setCurrentStep(prev => prev + 1)
        }
    }

    const handlePrevious = () => {
        setCurrentStep(prev => Math.max(0, prev - 1))
    }

    const handleSkip = () => {
        onSkip()
        setIsOpen(false)
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="max-w-lg">
                <div className="space-y-4">
                    {/* Progress */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            Step {currentStep + 1} of {steps.length}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleSkip}>
                            Skip tutorial
                        </Button>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>

                    {/* Content */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="py-4"
                        >
                            <h3 className="text-xl font-bold mb-4">{step.title}</h3>
                            <div className="text-muted-foreground">{step.content}</div>
                        </motion.div>
                    </AnimatePresence>

                    {/* Actions */}
                    <div className="flex justify-between pt-4">
                        <Button
                            variant="ghost"
                            onClick={handlePrevious}
                            disabled={currentStep === 0}
                        >
                            Previous
                        </Button>

                        <Button onClick={handleNext} className="gap-2">
                            {isLastStep ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    Finish
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="w-4 h-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Tutorial steps for new game
 */
export const newGameTutorial: TutorialStep[] = [
    {
        id: 'welcome',
        title: 'Welcome to Esports Manager!',
        content: (
            <div className="space-y-3">
                <p>You're about to embark on a journey to esports glory!</p>
                <p>This quick tutorial will show you the basics of managing your team.</p>
            </div>
        )
    },
    {
        id: 'roster',
        title: 'Your Roster',
        content: (
            <div className="space-y-3">
                <p>Your starting roster consists of 5 players, each with unique stats and roles.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li><strong>AWPer:</strong> Sniper specialist</li>
                    <li><strong>Entry Fragger:</strong> First into bombsites</li>
                    <li><strong>IGL:</strong> Calls the strategies</li>
                    <li><strong>Support:</strong> Utilities expert</li>
                    <li><strong>Lurker:</strong> Flanking specialist</li>
                </ul>
            </div>
        )
    },
    {
        id: 'finances',
        title: 'Managing Finances',
        content: (
            <div className="space-y-3">
                <p>Keep an eye on your budget! You earn money through:</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Tournament prizes</li>
                    <li>Sponsor deals</li>
                    <li>Player transfers</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                    Tip: Don't overspend on salaries early on!
                </p>
            </div>
        )
    },
    {
        id: 'matches',
        title: 'Match Strategy',
        content: (
            <div className="space-y-3">
                <p>Before each match, choose your buy strategy based on economy:</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li><strong>Full Buy:</strong> When you have $4500+</li>
                    <li><strong>Eco:</strong> Save money for next round</li>
                    <li><strong>Force Buy:</strong> Risky all-in</li>
                </ul>
            </div>
        )
    },
    {
        id: 'ready',
        title: 'You\'re Ready!',
        content: (
            <div className="space-y-3">
                <p>That's all you need to get started!</p>
                <p>Remember:</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Press <kbd className="px-1 rounded bg-white/10">?</kbd> for keyboard shortcuts</li>
                    <li>Hover over stats for explanations</li>
                    <li>The game auto-saves every minute</li>
                </ul>
                <p className="font-bold">Good luck, coach!</p>
            </div>
        )
    }
]
