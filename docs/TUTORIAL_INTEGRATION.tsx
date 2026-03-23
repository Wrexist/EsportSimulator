/**
 * Tutorial Integration Example
 * Shows how to integrate the tutorial system into the app
 */

"use client"

import { useState, useEffect } from 'react'
import { Tutorial, newGameTutorial } from '@/components/ui/tutorial'
import { useLocalStorage } from '@/hooks/use-local-storage'

/**
 * Tutorial Manager Hook
 * Handles tutorial display logic
 */
export function useTutorialManager() {
    const [hasSeenTutorial, setHasSeenTutorial] = useLocalStorage('has-seen-tutorial', false)
    const [showTutorial, setShowTutorial] = useState(false)

    useEffect(() => {
        // Show tutorial for new users
        if (!hasSeenTutorial) {
            // Delay slightly to let the app load
            const timer = setTimeout(() => {
                setShowTutorial(true)
            }, 1000)

            return () => clearTimeout(timer)
        }
    }, [hasSeenTutorial])

    const handleComplete = () => {
        setShowTutorial(false)
        setHasSeenTutorial(true)
    }

    const handleSkip = () => {
        setShowTutorial(false)
        setHasSeenTutorial(true)
    }

    const replay = () => {
        setShowTutorial(true)
    }

    return {
        showTutorial,
        handleComplete,
        handleSkip,
        replay
    }
}

/**
 * Example: Integrate into New Game Page
 */
export function NewGamePage() {
    const { showTutorial, handleComplete, handleSkip } = useTutorialManager()

    return (
        <div>
            {/* Your new game content */}
            <h1>Start New Game</h1>

            {/* Tutorial */}
            {showTutorial && (
                <Tutorial
                    steps={newGameTutorial}
                    onComplete={handleComplete}
                    onSkip={handleSkip}
                />
            )}
        </div>
    )
}

/**
 * Example: Add tutorial button to settings
 */
export function SettingsPage() {
    const { replay } = useTutorialManager()

    return (
        <div>
            <h2>Settings</h2>

            <button onClick={replay} className="btn">
                Replay Tutorial
            </button>
        </div>
    )
}

/**
 * Example: Feature-specific tutorial
 */
const marketTutorial = [
    {
        id: 'market-intro',
        title: 'Transfer Market',
        content: (
            <div>
                <p>Welcome to the transfer market!</p>
                <p>Here you can buy and sell players.</p>
            </div>
        )
    },
    {
        id: 'market-search',
        title: 'Finding Players',
        content: (
            <div>
                <p>Use filters to find the perfect player for your team.</p>
                <ul>
                    <li>Filter by role</li>
                    <li>Filter by rating</li>
                    <li>Filter by price</li>
                </ul>
            </div>
        )
    }
]

export function MarketTutorial() {
    const [show, setShow] = useState(true)

    return show ? (
        <Tutorial
            steps={marketTutorial}
            onComplete={() => setShow(false)}
            onSkip={() => setShow(false)}
        />
    ) : null
}
