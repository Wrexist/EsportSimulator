"use client"

import React from "react"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Panel } from "@/src/components/ui/Panel"
import { ScreenHeader } from "@/src/components/ui/ScreenHeader"
import { COMMUNITY_CREDITS } from "@/data/community-credits"
import { t } from "@/lib/i18n"

type CreditSection = { category: string; entries: { role: string; name: string }[] }

/** Built at render time so it follows the active language. Product and font names stay as they are. */
function credits(): CreditSection[] {
    return [
        {
            category: t("cr.cat.dev"),
            entries: [
                { role: t("cr.role.lead"), name: "Delta" },
                { role: t("cr.role.design"), name: "Delta" },
                { role: t("cr.role.engine"), name: "Delta" },
                { role: t("cr.role.art"), name: "Delta" },
                { role: t("cr.role.writing"), name: "Delta" },
                { role: t("cr.role.qa"), name: "Delta" },
            ],
        },
        {
            category: t("cr.cat.data"),
            entries: [
                { role: t("cr.role.players"), name: t("cr.name.roster") },
                { role: t("cr.role.tournaments"), name: t("cr.name.circuits") },
                { role: t("cr.role.rankings"), name: t("cr.name.rankingMethods") },
            ],
        },
        {
            category: t("cr.cat.tech"),
            entries: [
                { role: t("cr.role.framework"), name: "Next.js" },
                { role: t("cr.role.desktop"), name: "Electron" },
                { role: t("cr.role.steam"), name: "steamworks.js" },
                { role: t("cr.role.interface"), name: t("cr.name.radix") },
                { role: t("cr.role.state"), name: t("cr.name.zustand") },
                { role: t("cr.role.animation"), name: "Framer Motion" },
                { role: t("cr.role.fonts"), name: t("cr.name.fonts") },
            ],
        },
        {
            category: t("cr.cat.audio"),
            entries: [
                { role: t("cr.role.sfx"), name: t("cr.name.sfx") },
                { role: t("cr.role.music"), name: t("cr.name.music") },
            ],
        },
        ...(COMMUNITY_CREDITS.length > 0
            ? [{ category: t("cr.cat.community"), entries: COMMUNITY_CREDITS.map(c => ({ role: c.for, name: c.name })) }]
            : []),
        {
            category: t("cr.cat.thanks"),
            entries: [
                { role: t("cr.thanks.community"), name: t("cr.thanks.communityFor") },
                { role: t("cr.thanks.orgs"), name: t("cr.thanks.orgsFor") },
                { role: t("cr.thanks.oss"), name: t("cr.thanks.ossFor") },
                { role: t("cr.thanks.testers"), name: t("cr.thanks.testersFor") },
            ],
        },
    ]
}

export default function CreditsPage() {
    const router = useRouter()

    return (
        <div className="mx-auto max-w-[880px] space-y-5 pb-16">
            <ScreenHeader
                eyebrow={`Esports Manager · v${process.env.NEXT_PUBLIC_GAME_VERSION || "1.0.0"}`}
                title={t("cr.title")}
                aside={
                    <Button variant="ghost" onClick={() => router.back()} className="gap-2">
                        <ArrowLeft size={16} /> {t("cr.back")}
                    </Button>
                }
            />

            <div className="gap-4 md:columns-2">
                {credits().map(section => (
                    <Panel key={section.category} title={section.category} padded={false} className="mb-4 break-inside-avoid">
                        <dl className="divide-y divide-line">
                            {section.entries.map(entry => (
                                <div key={`${entry.role}-${entry.name}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                                    <dt className="text-sm text-ink-3">{entry.role}</dt>
                                    <dd className="text-right text-sm font-semibold text-ink-1">{entry.name}</dd>
                                </div>
                            ))}
                        </dl>
                    </Panel>
                ))}
            </div>

            <p className="text-xs leading-relaxed text-ink-3">
                {t("cr.legal", { year: new Date().getFullYear() })}
            </p>
        </div>
    )
}
