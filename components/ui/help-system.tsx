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
    category: 'gameplay' | 'management' | 'tactics' | 'progression' | 'competition'
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
    },
    {
        id: 'world-ranking',
        title: 'World Ranking & Elo',
        description: 'How your global position is decided',
        category: 'competition',
        content: (
            <div className="space-y-3">
                <p>Every team carries a hidden <strong>Elo</strong> skill rating. Your <strong>world ranking</strong> is just everyone sorted by Elo.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Win and your Elo rises; beating a <em>stronger</em> team raises it more.</li>
                    <li>Elo sets match odds and decides tournament seeding.</li>
                    <li>Ranking moves week to week as every team&apos;s results come in — judge progress over a season, not a single week.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'circuit-points',
        title: 'Circuit Points & Majors',
        description: 'Qualifying for the biggest events',
        category: 'competition',
        content: (
            <div className="space-y-3">
                <p>Placing well at events earns <strong>circuit points</strong> across the season.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>More points = qualification and better seeding for Majors (S-Tier events).</li>
                    <li>Points decay over time, so you have to keep performing.</li>
                    <li>Winning a Major is the peak achievement and the biggest payout.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'rmr',
        title: 'RMR Qualifiers',
        description: 'The road to a Major',
        category: 'competition',
        content: (
            <div className="space-y-3">
                <p><strong>RMR</strong> (Regional Major Ranking) events are the qualifiers that decide which teams reach a Major.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Your region&apos;s top teams compete for a limited number of Major slots.</li>
                    <li>Finish high enough and you punch your ticket to the Major.</li>
                    <li>Treat them as high-stakes — prep matters more than in a regular event.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'condition',
        title: 'Morale, Form & Fatigue',
        description: 'Keeping players sharp and happy',
        category: 'gameplay',
        content: (
            <div className="space-y-3">
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li><strong>Form</strong> — your recent results trend. Hot form is a small momentum edge.</li>
                    <li><strong>Morale</strong> — player happiness. Low morale hurts performance and can trigger grievances; wins and good treatment raise it.</li>
                    <li><strong>Fatigue</strong> — builds from matches and drills. High fatigue raises injury risk and saps performance — manage it with rest and your Weekly Focus.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'board',
        title: 'Board Confidence',
        description: 'Keeping your job and your war-chest',
        category: 'management',
        content: (
            <div className="space-y-3">
                <p>The board sets a season <strong>expectation</strong> and tracks <strong>confidence</strong> in you.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Meet or beat expectations and confidence rises (and can pay a capped bonus).</li>
                    <li>Confidence sets your transfer war-chest — how much of the budget you can spend on one deal.</li>
                    <li>A bad season puts you <strong>on notice</strong>. Another one with bottomed confidence and you&apos;re sacked — but it&apos;s always telegraphed a season ahead.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'runway',
        title: 'Financial Runway',
        description: 'Reading your cash health',
        category: 'management',
        content: (
            <div className="space-y-3">
                <p><strong>Runway</strong> is how many weeks your cash lasts at your current weekly net.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Positive weekly net = runway grows; negative = it shrinks.</li>
                    <li>Low runway is your early warning — cut wages, sign a sponsor, or win prize money before you go insolvent.</li>
                    <li>Eight straight weeks of insolvency disbands the org (game over).</li>
                </ul>
            </div>
        )
    },
    {
        id: 'weekly-focus',
        title: 'Weekly Focus',
        description: 'Your recurring weekly decision',
        category: 'gameplay',
        content: (
            <div className="space-y-3">
                <p>Each week you pick a <strong>focus</strong> for the team — a trade-off, not a free bonus:</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li><strong>Training</strong> — the safe default.</li>
                    <li><strong>Streaming</strong> — earns cash but adds fatigue and dents morale.</li>
                    <li><strong>Team Bonding</strong> — spends cash for morale and chemistry.</li>
                    <li><strong>Media Campaign</strong> — spends cash for reputation and fans.</li>
                    <li><strong>Bootcamp</strong> — double XP, but heavy fatigue.</li>
                </ul>
                <p className="text-xs text-muted-foreground">Set it on the dashboard each week — it resets after every advance.</p>
            </div>
        )
    },
    {
        id: 'manager-career',
        title: 'Manager Career & Unlocks',
        description: 'Your long-term legacy',
        category: 'progression',
        content: (
            <div className="space-y-3">
                <p>You earn <strong>XP</strong> every match (win +100, loss +25) and level up as a manager.</p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                    <li>Higher manager level unlocks bigger clubs when you start a new career, plus more training slots and better job offers.</li>
                    <li>Your peak level and best results persist <em>across</em> campaigns — see the Career page&apos;s Legacy track.</li>
                    <li>Climb the tiers: Newcomer → Contender → Dynasty → Era-Defining → G.O.A.T.</li>
                </ul>
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
        competition: 'Competition',
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
                title="Help & Game Guide"
                // Stacked above the (conditional) bug-report button at bottom-6
                // so the two never overlap.
                className="fixed bottom-24 right-6 rounded-full w-11 h-11 bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur shadow-lg z-50"
            >
                <HelpCircle className="w-5 h-5" aria-hidden="true" />
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
                                        <li>• Replay the full tutorial from <span className="text-white/80 font-medium">Settings → Replay Tutorial</span></li>
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
