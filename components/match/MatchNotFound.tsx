"use client"

import Link from "next/link"
import { Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/src/components/ui/EmptyState"
import { t } from "@/lib/i18n"

/**
 * A stale match link (history, an old inbox item, Escape back): the same card
 * on match prep, veto and live as on the result screen (CROSSCUT-06,
 * 2026-11-17), with an h1 and one way out, back to the schedule.
 */
export function MatchNotFound({ title, body }: { title?: string; body?: string }) {
    return (
        <div role="alert" className="flex min-h-[60vh] items-center justify-center">
            <div className="w-full max-w-xl px-6">
                <EmptyState icon={Swords} titleAs="h1" title={title ?? t("prep.notFound")} description={body ?? t("prep.notFoundBody")}>
                    <div className="flex justify-center">
                        <Button asChild size="sm">
                            <Link href="/schedule">{t("prep.backToSchedule")}</Link>
                        </Button>
                    </div>
                </EmptyState>
            </div>
        </div>
    )
}
