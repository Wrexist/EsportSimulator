"use client"

import { useState, useEffect } from 'react'
import { WEEKLY_ACTIVITIES, WeeklyActivityType, weeklyActivityXpBonus } from '@/types/activities'
import { Button } from '@/components/ui/button'
import { HelpCircle, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LOSS_XP_BASE, WIN_XP_BASE } from '@/engine/processors/match-manager-xp'
import { t } from '@/lib/i18n'
import { Trans } from '@/lib/trans'

type Category = 'gameplay' | 'management' | 'tactics' | 'progression' | 'competition'

interface HelpTopic {
    id: string
    title: string
    description: string
    content: React.ReactNode
    category: Category
}

const TAGS = {
    b: (text: string) => <strong>{text}</strong>,
    i: (text: string) => <em>{text}</em>,
    kbd: (text: string) => <kbd className="px-1 rounded bg-hover">{text}</kbd>,
}

/** One paragraph, heading or list item of a topic: a key, or a key with values. */
type Line = string | [string, Record<string, string | number>]
type Block = { p: Line } | { h: string } | { ul: Line[] } | { note: Line }

const say = (line: Line) => typeof line === "string" ? <Trans k={line} tags={TAGS} /> : <Trans k={line[0]} params={line[1]} tags={TAGS} />

function TopicBody({ blocks }: { blocks: Block[] }) {
    return (
        <div className="space-y-3">
            {blocks.map((b, i) =>
                "p" in b ? <p key={i}>{say(b.p)}</p>
                    : "h" in b ? <h4 key={i} className="font-bold">{t(b.h)}</h4>
                        : "note" in b ? <p key={i} className="text-xs text-ink-3">{say(b.note)}</p>
                            : <ul key={i} className="list-disc pl-5 text-sm space-y-1">{b.ul.map((l, j) => <li key={j}>{say(l)}</li>)}</ul>,
            )}
        </div>
    )
}

/** A topic whose title, description and content are read in the active language when shown. */
function topic(id: string, key: string, category: Category, blocks: () => Block[]): HelpTopic {
    return {
        id, category,
        get title() { return t(`help.${key}.title`) },
        get description() { return t(`help.${key}.desc`) },
        get content() { return <TopicBody blocks={blocks()} /> },
    }
}

const TIERS = ["newcomer", "contender", "dynasty", "eraDefining", "goat"] as const

export const helpTopics: HelpTopic[] = [
    topic("reading-stats", "stats", "gameplay", () => [
        { p: "help.stats.p1" }, { p: "help.stats.p2" }, { p: "help.stats.p3" }, { p: "help.stats.p4" }, { p: "help.stats.p5" },
    ]),
    topic("team-chemistry", "chem", "gameplay", () => [
        { p: "help.chem.p1" },
        { h: "help.chem.h1" }, { ul: ["help.chem.l1", "help.chem.l2", "help.chem.l3"] },
        { h: "help.chem.h2" }, { ul: ["help.chem.l4", "help.chem.l5"] },
    ]),
    topic("player-development", "dev", "progression", () => [
        { p: "help.dev.p1" },
        { h: "help.dev.h1" }, { ul: ["help.dev.l1", "help.dev.l2", "help.dev.l3"] },
        { h: "help.dev.h2" }, { ul: ["help.dev.l4", "help.dev.l5", "help.dev.l6"] },
    ]),
    topic("finances", "fin", "management", () => [
        { p: "help.fin.p1" },
        { h: "help.fin.h1" }, { ul: ["help.fin.l1", "help.fin.l2", "help.fin.l3"] },
        { h: "help.fin.h2" }, { ul: ["help.fin.l4", "help.fin.l5", "help.fin.l6", "help.fin.l7"] },
    ]),
    topic("match-tactics", "buy", "tactics", () => [
        { p: "help.buy.p1" },
        { h: "help.buy.h1" }, { ul: ["help.buy.l1", "help.buy.l2", "help.buy.l3", "help.buy.l4"] },
        { note: "help.buy.note" },
    ]),
    topic("world-ranking", "rank", "competition", () => [
        { p: "help.rank.p1" }, { ul: ["help.rank.l1", "help.rank.l2", "help.rank.l3"] },
    ]),
    topic("circuit-points", "circuit", "competition", () => [
        { p: "help.circuit.p1" }, { ul: ["help.circuit.l1", "help.circuit.l2", "help.circuit.l3"] },
    ]),
    topic("rmr", "rmr", "competition", () => [
        { p: "help.rmr.p1" }, { ul: ["help.rmr.l1", "help.rmr.l2", "help.rmr.l3"] },
    ]),
    topic("condition", "cond", "gameplay", () => [
        { ul: ["help.cond.l1", "help.cond.l2", "help.cond.l3"] },
    ]),
    topic("board", "board", "management", () => [
        { p: "help.board.p1" }, { ul: ["help.board.l1", "help.board.l2", "help.board.l3"] },
    ]),
    topic("runway", "runway", "management", () => [
        { p: "help.runway.p1" }, { ul: ["help.runway.l1", "help.runway.l2", "help.runway.l3"] },
    ]),
    topic("weekly-focus", "focus", "gameplay", () => [
        { p: "help.focus.p1" },
        {
            ul: [
                ["help.focus.training", { name: t(`wfocus.${WeeklyActivityType.TRAINING_ONLY}`) }],
                ["help.focus.streaming", { name: t(`wfocus.${WeeklyActivityType.STREAMING}`) }],
                ["help.focus.bonding", { name: t(`wfocus.${WeeklyActivityType.TEAM_BONDING}`) }],
                ["help.focus.media", { name: t(`wfocus.${WeeklyActivityType.MEDIA_CAMPAIGN}`) }],
                ["help.focus.bootcamp", { name: t(`wfocus.${WeeklyActivityType.BOOTCAMP}`), xp: weeklyActivityXpBonus(WEEKLY_ACTIVITIES[WeeklyActivityType.BOOTCAMP]) }],
            ],
        },
        { note: "help.focus.note" },
    ]),
    topic("manager-career", "career", "progression", () => [
        { p: ["help.career.p1", { win: WIN_XP_BASE, loss: LOSS_XP_BASE }] },
        { ul: ["help.career.l1", "help.career.l2", ["help.career.l3", { tiers: TIERS.map(k => t(`cl.tier.${k}`)).join(" → ") }]] },
    ]),
]

/**
 * Help System Component
 * Contextual help and documentation
 */
export function HelpSystem() {
    const [isOpen, setIsOpen] = useState(false)
    const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
    // One-time discoverability pulse on the help FAB until the player opens it
    // once (the guide is the canonical reference but the "?" was easy to miss).
    const [showPulse, setShowPulse] = useState(false)
    useEffect(() => {
        try {
            if (typeof window !== "undefined" && !localStorage.getItem("esim_help_opened")) setShowPulse(true)
        } catch { /* localStorage unavailable — just skip the pulse */ }
    }, [])

    const openHelp = () => {
        setIsOpen(true)
        setShowPulse(false)
        try { localStorage.setItem("esim_help_opened", "1") } catch { /* ignore */ }
    }

    const categories: Category[] = ['gameplay', 'competition', 'management', 'tactics', 'progression']

    const current = helpTopics.find(h => h.id === selectedTopic)

    return (
        <>
            <Button
                variant="ghost"
                size="icon"
                onClick={openHelp}
                aria-label={t("help.open")}
                title={t("help.title")}
                // Rendered in the top bar next to Settings (TopBar.tsx): a
                // floating corner button covered page content (CROSSCUT-03).
                className="relative h-9 w-9 shrink-0 rounded text-ink-3 hover:bg-raised hover:text-ink-1"
            >
                {/* Not opened yet: a static gold dot instead of an animated halo. */}
                {showPulse && (
                    <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold" aria-hidden="true" />
                )}
                <HelpCircle className="h-[18px] w-[18px]" aria-hidden="true" />
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
                                        ← {t("help.back")}
                                    </Button>
                                    <span>{current?.title}</span>
                                </>
                            ) : (
                                t("help.title")
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1">
                        {selectedTopic ? (
                            <div className="p-4">
                                {current?.content}
                            </div>
                        ) : (
                            <div className="space-y-6 p-4">
                                {categories.map(key => {
                                    const categoryTopics = helpTopics.filter(h => h.category === key)

                                    if (categoryTopics.length === 0) return null

                                    return (
                                        <div key={key}>
                                            <h3 className="font-bold text-sm uppercase text-muted-foreground mb-3">
                                                {t(`help.cat.${key}`)}
                                            </h3>
                                            <div className="space-y-2">
                                                {categoryTopics.map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => setSelectedTopic(item.id)}
                                                        className="w-full rounded-lg border border-line bg-panel p-3 text-left hover:bg-raised transition-colors flex items-center justify-between group"
                                                    >
                                                        <div>
                                                            <div className="font-medium">{item.title}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {item.description}
                                                            </div>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}

                                <div className="mt-8 p-4 rounded-lg bg-raised border border-line">
                                    <h4 className="font-bold mb-2">{t("help.tips.title")}</h4>
                                    <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
                                        <li><Trans k="help.tips.shortcuts" tags={TAGS} /></li>
                                        <li>{t("help.tips.guide")}</li>
                                        <li>{t("help.tips.autosave")}</li>
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
        <div className="p-3 rounded-lg bg-raised border border-line">
            <h4 className="font-bold text-sm mb-2">{helpTopic.title}</h4>
            {helpTopic.content}
        </div>
    )
}
