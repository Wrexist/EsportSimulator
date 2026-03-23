"use client"

import { useEffect } from "react"

/**
 * ConsoleToTerminal - Forwards browser console errors/warnings to the terminal
 * Add this component to your root layout for development debugging
 */
export function ConsoleToTerminal() {
    useEffect(() => {
        if (process.env.NODE_ENV !== "development") return

        // Store original console methods
        const originalError = console.error
        const originalWarn = console.warn

        // Override console.error
        console.error = (...args: unknown[]) => {
            originalError.apply(console, args)
            sendToTerminal("ERROR", args)
        }

        // Override console.warn
        console.warn = (...args: unknown[]) => {
            originalWarn.apply(console, args)
            sendToTerminal("WARN", args)
        }

        // Catch unhandled errors
        const handleError = (event: ErrorEvent) => {
            sendToTerminal("UNCAUGHT", [
                `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
                event.error?.stack
            ])
        }

        // Catch unhandled promise rejections
        const handleRejection = (event: PromiseRejectionEvent) => {
            sendToTerminal("PROMISE_REJECT", [event.reason])
        }

        window.addEventListener("error", handleError)
        window.addEventListener("unhandledrejection", handleRejection)

        return () => {
            console.error = originalError
            console.warn = originalWarn
            window.removeEventListener("error", handleError)
            window.removeEventListener("unhandledrejection", handleRejection)
        }
    }, [])

    return null
}

// Send errors to terminal via API
async function sendToTerminal(type: string, args: unknown[]) {
    try {
        const message = args
            .map(arg => {
                if (arg instanceof Error) {
                    return `${arg.message}\n${arg.stack}`
                }
                if (typeof arg === "object") {
                    try {
                        return JSON.stringify(arg, null, 2)
                    } catch {
                        return String(arg)
                    }
                }
                return String(arg)
            })
            .join(" ")

        await fetch("/api/console-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, message }),
        })
    } catch {
        // Silently fail - don't cause infinite loops
    }
}
