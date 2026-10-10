"use client"

import React from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"

const CREDITS: { category: string; entries: { role: string; name: string }[] }[] = [
    {
        category: "Game design and development",
        entries: [
            { role: "Creator and lead developer", name: "IsacC" },
        ],
    },
    {
        category: "Data",
        entries: [
            { role: "Players and teams", name: "Original fictional roster generator" },
            { role: "Tournament structure", name: "Inspired by professional tactical FPS circuits" },
            { role: "World rankings model", name: "Inspired by professional ranking methods" },
        ],
    },
    {
        category: "Technology",
        entries: [
            { role: "Framework", name: "Next.js" },
            { role: "Desktop runtime", name: "Electron" },
            { role: "Steam integration", name: "steamworks.js" },
            { role: "Interface", name: "Radix UI and Tailwind CSS" },
            { role: "State", name: "Zustand with Immer" },
            { role: "Animation", name: "Framer Motion" },
            { role: "Fonts", name: "Inter and Barlow Condensed (SIL OFL)" },
        ],
    },
    {
        category: "Audio",
        entries: [
            { role: "Sound effects", name: "Generated in the game (Web Audio API)" },
            { role: "Ambient music", name: "Generated in the game" },
        ],
    },
    {
        category: "Special thanks",
        entries: [
            { role: "Tactical FPS community", name: "For decades of competitive play" },
            { role: "Esports organizations", name: "For inspiring the management side" },
            { role: "Open-source contributors", name: "For the tools this is built on" },
            { role: "Playtesters and bug reporters", name: "Your feedback shaped this game" },
        ],
    },
]

export default function CreditsPage() {
    const router = useRouter()

    return (
        <div className="mx-auto max-w-[880px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Esports Manager · v${process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}`}
                title="Credits"
                aside={
                    <Button variant="ghost" onClick={() => router.back()} className="gap-2">
                        <ArrowLeft size={16} /> Back
                    </Button>
                }
            />

            <div className="gap-4 md:columns-2">
                {CREDITS.map(section => (
                    <Panel key={section.category} title={section.category} padded={false} className="mb-4 break-inside-avoid">
                        <dl className="divide-y divide-line">
                            {section.entries.map(entry => (
                                <div key={entry.role} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                                    <dt className="text-sm text-ink-3">{entry.role}</dt>
                                    <dd className="text-right text-sm font-semibold text-ink-1">{entry.name}</dd>
                                </div>
                            ))}
                        </dl>
                    </Panel>
                ))}
            </div>

            <p className="text-xs leading-relaxed text-ink-3">
                This game is a work of fiction. Team names, player likenesses and tournament structures are used for simulation only, and no endorsement is implied.
                © {new Date().getFullYear()} IsacC. All rights reserved.
            </p>
        </div>
    )
}
