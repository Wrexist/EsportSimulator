"use client"

/**
 * Career Legacy card — surfaces the cross-save Manager Career Profile
 * (AUDIT_UX_2026-06 C3). Gives the player a long-horizon thing to climb that
 * persists across campaigns and never resets, with named tiers
 * (Newcomer → Contender → Dynasty → Era-Defining → G.O.A.T.) driven by the most
 * majors won in a single career. All values are all-time peaks across every save.
 */

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Crown, Trophy, Star, Globe, CalendarDays, Users } from "lucide-react"
import { loadCareerProfile, createEmptyCareerProfile, type ManagerCareerProfile } from "@/engine/manager-career-profile"

interface LegacyTier {
    name: string
    majors: number
    className: string
}

// Driven by the most S-Tier majors won in a single campaign — the clearest
// signal of greatness. Ascending; the current tier is the highest cleared.
const LEGACY_TIERS: LegacyTier[] = [
    { name: "Newcomer", majors: 0, className: "border-white/15 text-white/60 bg-white/5" },
    { name: "Contender", majors: 1, className: "border-cyan-400/30 text-cyan-300 bg-cyan-500/10" },
    { name: "Dynasty", majors: 3, className: "border-violet-400/30 text-violet-300 bg-violet-500/10" },
    { name: "Era-Defining", majors: 6, className: "border-amber-400/30 text-amber-300 bg-amber-500/10" },
    { name: "G.O.A.T.", majors: 12, className: "border-rose-400/40 text-rose-300 bg-rose-500/10" },
]

function resolveTier(majors: number): { current: LegacyTier; next: LegacyTier | null } {
    let currentIndex = 0
    for (let i = 0; i < LEGACY_TIERS.length; i++) {
        if (majors >= LEGACY_TIERS[i].majors) currentIndex = i
    }
    return { current: LEGACY_TIERS[currentIndex], next: LEGACY_TIERS[currentIndex + 1] ?? null }
}

export function CareerLegacyCard() {
    const [profile, setProfile] = useState<ManagerCareerProfile>(() => createEmptyCareerProfile())

    useEffect(() => {
        loadCareerProfile().then(setProfile).catch(() => { })
    }, [])

    const { current, next } = resolveTier(profile.bestCareerMajors)
    const towardNext = next
        ? Math.min(100, ((profile.bestCareerMajors - current.majors) / (next.majors - current.majors)) * 100)
        : 100

    const stats: { icon: typeof Crown; label: string; value: string }[] = [
        { icon: Star, label: "Peak Level", value: `${profile.peakLevel}` },
        { icon: Trophy, label: "Best Majors", value: `${profile.bestCareerMajors}` },
        { icon: Globe, label: "Best Rank", value: profile.bestWorldRanking > 0 ? `#${profile.bestWorldRanking}` : "—" },
        { icon: CalendarDays, label: "Seasons", value: `${profile.mostSeasonsManaged}` },
        { icon: Crown, label: "Campaigns", value: `${profile.campaignsStarted}` },
        { icon: Users, label: "Teams", value: `${profile.teamsManaged.length}` },
    ]

    return (
        <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
            <CardContent className="p-6 space-y-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-xl">
                            <Crown className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">Career Legacy</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All-time · across every campaign</p>
                        </div>
                    </div>
                    <Badge variant="outline" className={`h-7 px-3 gap-1.5 font-bold uppercase tracking-wide text-[11px] ${current.className}`}>
                        {current.name}
                    </Badge>
                </div>

                {next && (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>Progress to {next.name}</span>
                            <span>{profile.bestCareerMajors} / {next.majors} majors</span>
                        </div>
                        <Progress value={towardNext} className="h-2.5" />
                    </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                    {stats.map(s => (
                        <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                                <s.icon className="h-3.5 w-3.5" />
                                <span className="text-[9px] uppercase font-bold tracking-widest">{s.label}</span>
                            </div>
                            <p className="text-xl font-normal text-white tabular-nums">{s.value}</p>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
