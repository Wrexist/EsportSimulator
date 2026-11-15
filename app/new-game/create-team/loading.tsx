"use client"

import { t } from "@/lib/i18n"
import { LoadingSplash } from "@/components/brand/LoadingSplash"

// Branded splash while the team creator chunk loads.
export default function Loading() {
    return <LoadingSplash label={t("common.loadingTeamCreator")} />
}
