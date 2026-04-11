"use client"

import { AcademyApp } from "@/components/desktop-apps/AcademyApp"

export default function AcademyPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Academy</h1>
                <p className="text-sm text-muted-foreground">
                    Scout, develop, and graduate young talent for your roster
                </p>
            </div>
            <AcademyApp />
        </div>
    )
}
