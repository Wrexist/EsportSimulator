"use client"

import { t } from "@/lib/i18n"
import { LoadingSplash } from "@/components/brand/LoadingSplash"

// Branded splash while the career setup chunk loads.
export default function Loading() {
    return <LoadingSplash label={t("common.loadingCareer")} />
}
