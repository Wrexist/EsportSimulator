"use client"

/**
 * Career Legacy — the cross-save Manager Career Profile (AUDIT_UX_2026-06 C3).
 * Named tiers (Newcomer → G.O.A.T.) are driven by the most S-tier majors won
 * in a single career. All values are all-time peaks across every save; the
 * tier is a title only and unlocks nothing.
 */

import { useEffect, useState } from "react"
import { Panel } from "@/src/components/ui/Panel"
import { Meter } from "@/src/components/ui/Meter"
import { loadCareerProfile, createEmptyCareerProfile, type ManagerCareerProfile } from "@/engine/manager-career-profile"

const LEGACY_TIERS = [
    { name: "Newcomer", majors: 0 },
    { name: "Contender", majors: 1 },
    { name: "Dynasty", majors: 3 },
    { name: "Era-Defining", majors: 6 },
    { name: "G.O.A.T.", majors: 12 },
] as const

function resolveTier(majors: number) {
    let currentIndex = 0
    for (let i = 0; i < LEGACY_TIERS.length; i++) if (majors >= LEGACY_TIERS[i].majors) currentIndex = i
    return { current: LEGACY_TIERS[currentIndex], next: LEGACY_TIERS[currentIndex + 1] ?? null }
}

export function CareerLegacyCard() {
    const [profile, setProfile] = useState<ManagerCareerProfile>(() => createEmptyCareerProfile())

    useEffect(() => {
        loadCareerProfile().then(setProfile).catch(() => { })
    }, [])

    const { current, next } = resolveTier(profile.bestCareerMajors)
    const towardNext = next ? Math.min(100, ((profile.bestCareerMajors - current.majors) / (next.majors - current.majors)) * 100) : 100

    const stats: { label: string; value: string }[] = [
        { label: "Peak level", value: `${profile.peakLevel}` },
        { label: "Best majors", value: `${profile.bestCareerMajors}` },
        { label: "Best rank", value: profile.bestWorldRanking > 0 ? `#${profile.bestWorldRanking}` : "—" },
        { label: "Most seasons", value: `${profile.mostSeasonsManaged}` },
        { label: "Careers", value: `${profile.campaignsStarted}` },
        { label: "Clubs", value: `${profile.teamsManaged.length}` },
    ]

    return (
        <Panel
            title="Legacy across all saves"
            actions={<span className="inline-flex items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-1">{current.name}</span>}
        >
            {next ? (
                <div>
                    <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-3">Next title: {next.name}</span>
                        <span className="tabular-nums text-ink-2">{profile.bestCareerMajors} / {next.majors} majors in one career</span>
                    </div>
                    <Meter value={towardNext} label={`Progress to ${next.name}`} tone="neutral" showValue={false} className="mt-2" trackClassName="w-full" />
                </div>
            ) : <p className="text-xs text-ink-3">Highest title reached.</p>}
            <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded border border-line sm:grid-cols-6">
                {stats.map(s => (
                    <div key={s.label} className="px-3 py-2.5">
                        <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{s.label}</dt>
                        <dd className="mt-1 font-display text-2xl font-bold leading-none tabular-nums text-ink-1">{s.value}</dd>
                    </div>
                ))}
            </dl>
        </Panel>
    )
}
