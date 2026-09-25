"use client"

import { PageHeader } from "@/components/ui/PageHeader"
import { AcademyApp } from "@/components/desktop-apps/AcademyApp"

export default function AcademyPage() {
    return (
        <div className="space-y-6">
            <PageHeader eyebrow="Next generation" title="Academy" description="Scout, develop, and graduate young talent for your roster." />
            <AcademyApp />
        </div>
    )
}
