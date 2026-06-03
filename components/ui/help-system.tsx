"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HelpCircle, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface HelpTopic {
    id: string
    title: string
    description: string
    content: React.ReactNode
    category: 'gameplay' | 'management' | 'tactics' | 'progression'
}

const helpTopics: HelpTopic[] = [
    {
        id: 'team-chemistry',
        title: 'Team Chemistry',
        description: 'How roster compatibility affects performance',
        category: 'gameplay',
        content: (
            <div className="space-y-3">
                <p>Team chemistry measures how well your players work together.</p>
                <div className="space-y-2">
                    <h4 className="font-bold">Calculation:</h4>
                    <code className="block p-2 bg-black/40 rounded text-xs">
                        Chemistry = Average Compatibility × Roster Stability
                    </code>
                </div>
                <div className="space-y-2">
                    <h4 className="font-bold">Effects:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Higher chemistry = Better team coordination</li>
                        <li>Affects match outcomes  by up to 15%</li>
                        <li>Improves with time playing together</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'player-development',
        title: 'Player Development',
        description: 'How players improve over time',
        category: 'progression',
        content: (
            <div className="space-y-3">
                <p>Players develop based on age, potential, and training.</p>
                <div className="space-y-2">
                    <h4 className="font-bold">Peak Age: 22-25 years</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Under 22: Rapid improvement</li>
                        <li>22-25: Peak performance</li>
                        <li>Over 25: Gradual decline</li>
                    </ul>
                </div>
                <div className="space-y-2">
                    <h4 className="font-bold">Training Impact:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Better facilities = Faster development</li>
                        <li>Coach quality affects growth rate</li>
                        <li>Match experience builds skills</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'finances',
        title: 'Financial Management',
        description: 'Managing your budget effectively',
        category: 'management',
        content: (
            <div className="space-y-3">
                <p>Balance income and expenses to maintain healthy finances.</p>
                <div className="space-y-2">
                    <h4 className="font-bold">Income Sources:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Tournament prize money</li>
                        <li>Sponsor deals</li>
                        <li>Transfer fees from selling players</li>
                    </ul>
                </div>
                <div className="space-y-2">
                    <h4 className="font-bold">Expenses:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>Player salaries (weekly)</li>
                        <li>Staff salaries (weekly)</li>
                        <li>Facility upgrades</li>
                        <li>Transfer fees</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'match-tactics',
        title: 'Match Tactics',
        description: 'Pre-game strategy and loadouts',
        category: 'tactics',
        content: (
            <div className="space-y-3">
                <p>Choose the right strategy for each round based on economy.</p>
                <div className="space-y-2">
                    <h4 className="font-bold">Buy Strategies:</h4>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                        <li><strong>Full Buy:</strong> Full rifles, armor, utility</li>
                        <li><strong>Semi-Buy:</strong> SMGs or cheaper rifles</li>
                        <li><strong>Force Buy:</strong> Pistols + light armor</li>
                        <li><strong>Eco:</strong> Save money for next round</li>
                    </ul>
                </div>
                <p className="text-xs text-muted-foreground">
                    Tip: Win streaks give bonus money. Losing streaks increase loss bonus.
                </p>
            </div>
        )
    }
]

/**
 * Help System Component
 * Contextual help and documentation
 */
export function HelpSystem() {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

    const categories = {
        gameplay: 'Gameplay',
        management: 'Management',
        tactics: 'Tactics',
        progression: 'Progression'
    }

    const topic = helpTopics.find(t => t.id === selectedTopic)

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(true)}
                aria-label="Open help"
                title="Help (?)"
                className="fixed bottom-4 right-4 rounded-full w-12 h-12 shadow-lg z-50"
            >
                <HelpCircle className="w-6 h-6" aria-hidden="true" />
            </Button>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            {selectedTopic ? (
                                <>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSelectedTopic(null)}
                                    >
                                        ← Back
                                    </Button>
                                    <span>{topic?.title}</span>
                                </>
                            ) : (
                                'Help & Documentation'
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1">
                        {selectedTopic ? (
                            <div className="p-4">
                                {topic?.content}
                            </div>
                        ) : (
                            <div className="space-y-6 p-4">
                                {Object.entries(categories).map(([key, label]) => {
                                    const categoryTopics = helpTopics.filter(t => t.category === key)

                                    if (categoryTopics.length === 0) return null

                                    return (
                                        <div key={key}>
                                            <h3 className="font-bold text-sm uppercase text-muted-foreground mb-3">
                                                {label}
                                            </h3>
                                            <div className="space-y-2">
                                                {categoryTopics.map(topic => (
                                                    <button
                                                        key={topic.id}
                                                        onClick={() => setSelectedTopic(topic.id)}
                                                        className="w-full glass-panel p-3 text-left hover:bg-white/5 transition-colors flex items-center justify-between group"
                                                    >
                                                        <div>
                                                            <div className="font-medium">{topic.title}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {topic.description}
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}

                                <div className="mt-8 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                                    <h4 className="font-bold mb-2">Quick Tips</h4>
                                    <ul className="text-sm space-y-1 text-muted-foreground">
                                        <li>• Press <kbd className="px-1 rounded bg-white/10">?</kbd> anytime for keyboard shortcuts</li>
                                        <li>• Hover over stats for detailed explanations</li>
                                        <li>• Auto-save runs every minute</li>
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

/**
 * Quick help tooltip for inline use
 */
export function QuickHelp({ topic }: { topic: string }) {
    const helpTopic = helpTopics.find(t => t.id === topic)

    if (!helpTopic) return null

    return (
        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
            <h4 className="font-bold text-sm mb-2">{helpTopic.title}</h4>
            {helpTopic.content}
        </div>
    )
}
