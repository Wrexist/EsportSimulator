"use client"

// Catches errors that escape the root `app/layout.tsx` itself — e.g. provider
// crashes, font-loader failures, or anything thrown above <ErrorBoundary>.
// Next.js requires this file to render its own <html>/<body>.

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
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
                    backgroundColor: "#0e1217",
                    color: "#fff",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                }}
            >
                <div style={{ maxWidth: 480, textAlign: "center", padding: 24 }}>
                    <div
                        style={{
                            width: 80,
                            height: 80,
                            borderRadius: "50%",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto 24px",
                        }}
                    >
                        <AlertTriangle color="#ef4444" size={40} />
                    </div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                        The game crashed
                    </h1>
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
                        Something went wrong above the React tree. Your save data on disk is safe — restart the app to recover.
                    </p>
                    {process.env.NODE_ENV !== "production" && (
                        <pre
                            style={{
                                backgroundColor: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 8,
                                padding: 16,
                                textAlign: "left",
                                fontSize: 12,
                                color: "#f87171",
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
                            padding: "8px 16px",
                            backgroundColor: "#0891b2",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        <RefreshCw size={14} />
                        Try Again
                    </button>
                </div>
            </body>
        </html>
    )
}
