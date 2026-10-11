"use client"

// Catches errors that escape the root `app/layout.tsx` itself — e.g. provider
// crashes, font-loader failures, or anything thrown above <ErrorBoundary>.
// Next.js requires this file to render its own <html>/<body>.

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { errorTracker } from "@/lib/error-tracking"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Last-resort boundary — report the crash, but guard the reporter
        // itself since this renders even when the app is badly broken.
        try {
            errorTracker.captureException(error, {
                tags: { type: "global-error-boundary" },
                context: { digest: error.digest },
            })
        } catch {
            /* reporting must never throw from the global boundary */
        }
        if (process.env.NODE_ENV !== "production") {
            console.error("[Global Error]", error)
        }
    }, [error])

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    padding: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#07090C",
                    color: "#F2F4F7",
                    fontFamily: "\"Inter Variable\", \"Segoe UI\", system-ui, sans-serif",
                }}
            >
                <div style={{ maxWidth: 480, textAlign: "center", padding: 32, backgroundColor: "#12161C", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10 }}>
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 6,
                            border: "1px solid rgba(255, 84, 104, 0.4)",
                            backgroundColor: "rgba(255, 84, 104, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 20px",
                        }}
                    >
                        <AlertTriangle color="#FF5468" size={24} aria-hidden="true" />
                    </div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                        The game crashed
                    </h1>
                    <p style={{ fontSize: 14, lineHeight: "22px", color: "#AEB6C2", marginBottom: 24 }}>
                        Something went wrong above the React tree. Your save data on disk is safe — restart the app to recover.
                    </p>
                    {process.env.NODE_ENV !== "production" && (
                        <pre
                            style={{
                                backgroundColor: "#0D1015",
                                border: "1px solid rgba(255,255,255,0.07)",
                                borderRadius: 8,
                                padding: 16,
                                textAlign: "left",
                                fontSize: 12,
                                color: "#FF5468",
                                marginBottom: 24,
                                maxHeight: 128,
                                overflowY: "auto",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {error.message}
                            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
                        </pre>
                    )}
                    <button
                        onClick={reset}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            height: 40,
                            padding: "0 20px",
                            backgroundColor: "#F2B53A",
                            color: "#15100A",
                            border: "1px solid #F2B53A",
                            borderRadius: 4,
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: "pointer",
                        }}
                    >
                        <RefreshCw size={15} aria-hidden="true" />
                        Try again
                    </button>
                </div>
            </body>
        </html>
    )
}
