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
import { t } from "@/lib/i18n"
import { loadCareerProfile, createEmptyCareerProfile, type ManagerCareerProfile } from "@/engine/manager-career-profile"

const LEGACY_TIERS = [
    { id: "newcomer", majors: 0 },
    { id: "contender", majors: 1 },
    { id: "dynasty", majors: 3 },
    { id: "eraDefining", majors: 6 },
    { id: "goat", majors: 12 },
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
        { label: t("cl.peakLevel"), value: `${profile.peakLevel}` },
        { label: t("cl.bestMajors"), value: `${profile.bestCareerMajors}` },
        { label: t("cl.bestRank"), value: profile.bestWorldRanking > 0 ? `#${profile.bestWorldRanking}` : "—" },
        { label: t("cl.mostSeasons"), value: `${profile.mostSeasonsManaged}` },
        { label: t("cl.careers"), value: `${profile.campaignsStarted}` },
        { label: t("cl.clubs"), value: `${profile.teamsManaged.length}` },
    ]

    return (
        <Panel
            title={t("cl.title")}
            actions={<span className="inline-flex items-center rounded-sm border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-1">{t(`cl.tier.${current.id}`)}</span>}
        >
            {next ? (
                <div>
                    <div className="flex items-baseline justify-between text-xs">
                        <span className="text-ink-3">{t("cl.nextTitle", { title: t(`cl.tier.${next.id}`) })}</span>
                        <span className="tabular-nums text-ink-2">{t("cl.majorsInCareer", { n: profile.bestCareerMajors, target: next.majors })}</span>
                    </div>
                    <Meter value={towardNext} label={t("cl.progressAria", { title: t(`cl.tier.${next.id}`) })} tone="neutral" showValue={false} className="mt-2" trackClassName="w-full" />
                </div>
            ) : <p className="text-xs text-ink-3">{t("cl.highest")}</p>}
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
