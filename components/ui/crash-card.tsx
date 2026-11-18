"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AlertTriangle, Check, Clipboard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logger } from "@/lib/logger"
import { t } from "@/lib/i18n"

/**
 * The one crash screen (CROSSCUT-16, 2026-11-17): the section boundary
 * (components/ui/error-boundary.tsx), the route error page (app/error.tsx) and
 * the match error page (components/match/MatchCrashCard.tsx) all render this
 * card. A plain heading and sentence for the player; the developer message is
 * shown in development builds only and is always in "Copy error details".
 */
export function CrashCard({
    title,
    body,
    message,
    details,
    actions,
}: {
    title: string
    body: string
    /** Raw error message: shown in development builds only. */
    message?: string
    /** Bug-report text for "Copy error details" (the button is shown when given). */
    details?: () => string
    /** The card's buttons, primary first. */
    actions: ReactNode
}) {
    const [copied, setCopied] = useState(false)
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (resetTimer.current) clearTimeout(resetTimer.current) }, [])

    const copy = async () => {
        if (!details) return
        const text = details()
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                if (resetTimer.current) clearTimeout(resetTimer.current)
                resetTimer.current = setTimeout(() => setCopied(false), 2000)
            }
        } catch {
            // Clipboard may be unavailable in some Electron contexts: keep the
            // payload in the log so the in-game debug panel still has it.
            logger.error("Failed to copy error details", text)
        }
    }

    return (
        <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-ink-1">
            <div className="w-full max-w-md rounded-[10px] border border-line-strong bg-panel p-8 text-center">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-negative/40 bg-negative/10">
                    <AlertTriangle className="text-negative" size={24} aria-hidden="true" />
                </div>
                <h1 className="mb-3 font-display text-3xl font-bold uppercase leading-none">{title}</h1>
                <p className="mb-6 text-sm leading-relaxed text-ink-2">{body}</p>
                {process.env.NODE_ENV !== "production" && message && (
                    <pre className="mb-6 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-shell p-4 text-left font-mono text-xs text-negative">
                        {message}
                    </pre>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                    {actions}
                    {details && (
                        <Button onClick={copy} variant="ghost">
                            {copied ? <Check className="text-positive" aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                            {copied ? t("eb.copied") : t("eb.copy")}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}

/** The bug-report text of a crash (Copy error details). */
export function crashDetails(error: Error | null | undefined, section?: string, componentStack?: string | null): string {
    return [
        `Section: ${section || "Unknown"}`,
        `Time: ${new Date().toISOString()}`,
        `Message: ${error?.message ?? "Unknown error"}`,
        `Route: ${typeof window !== "undefined" ? window.location.pathname : "N/A"}`,
        "",
        "Stack:",
        error?.stack ?? "(no stack)",
        "",
        "Component Stack:",
        componentStack ?? "(no component stack)",
    ].join("\n")
}
