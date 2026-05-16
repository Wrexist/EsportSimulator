/**
 * Toast adapter.
 *
 * Routes all toast styles in the codebase (the sonner-style API and the
 * shadcn `useToast({title, description, variant})` API) into the single
 * in-game toast system rendered by `components/ui/ToastNotifications.tsx`
 * (which reads from `state.toasts` in the game store).
 *
 * Background: before this adapter existed, two parallel toast libraries
 * had been wired in (sonner + shadcn) but neither `<Toaster />` was ever
 * mounted in the layout. ~25 `toast.success(...)` and `useToast().toast(...)`
 * calls scattered across the app silently produced nothing visible. The
 * working toast surface is the custom one inside the game shell.
 *
 * This module preserves the call-site shapes both libraries use so callers
 * can keep their existing `toast.success("Title", { description })` and
 * `toast({ title, description, variant: "destructive" })` patterns without
 * rewriting every line.
 */

import type * as React from "react"
import { useGameStore } from "@/store/game-store"

type ToastVariant = "default" | "destructive" | "success" | "info" | "warning"
type StoreToastType = "level_up" | "xp_gain" | "achievement" | "info" | "warning" | "error"

interface SonnerLikeOptions {
    description?: string
    duration?: number
    // Sonner accepts an icon override; our in-game toast picks an icon
    // by `type` so this field is currently accepted but ignored at the
    // adapter boundary. Kept in the type so callers using the sonner API
    // surface compile cleanly.
    icon?: React.ReactNode
}

interface ShadcnLikeOptions {
    title?: string
    description?: string
    variant?: ToastVariant
    duration?: number
}

function variantToStoreType(variant: ToastVariant | undefined, fallback: StoreToastType): StoreToastType {
    switch (variant) {
        case "destructive": return "error"
        case "success": return "achievement"
        case "warning": return "warning"
        case "info": return "info"
        default: return fallback
    }
}

function formatMessage(title: string | undefined, description: string | undefined): string {
    if (title && description) return `${title} — ${description}`
    return title || description || ""
}

function pushToast(message: string, type: StoreToastType, duration?: number): void {
    if (!message) return
    const addToast = useGameStore.getState().addToast
    if (!addToast) return
    addToast({ message, type, duration })
}

/**
 * Sonner-compatible toast surface.
 *
 * Supports:
 *   toast("Title")
 *   toast("Title", { description })
 *   toast.success("Title", { description })
 *   toast.error("Title", { description })
 *   toast.info("Title", { description })
 *   toast.warning("Title", { description })
 *
 * Also accepts the shadcn shape:
 *   toast({ title, description, variant: "destructive" })
 */
type ToastCallable = {
    (arg: string | ShadcnLikeOptions, options?: SonnerLikeOptions): void
    success: (title: string, options?: SonnerLikeOptions) => void
    error: (title: string, options?: SonnerLikeOptions) => void
    info: (title: string, options?: SonnerLikeOptions) => void
    warning: (title: string, options?: SonnerLikeOptions) => void
    dismiss: () => void
}

function callable(arg: string | ShadcnLikeOptions, options?: SonnerLikeOptions): void {
    if (typeof arg === "string") {
        pushToast(formatMessage(arg, options?.description), "info", options?.duration)
        return
    }
    pushToast(
        formatMessage(arg.title, arg.description),
        variantToStoreType(arg.variant, "info"),
        arg.duration,
    )
}

export const toast: ToastCallable = Object.assign(callable, {
    success: (title: string, options?: SonnerLikeOptions) =>
        pushToast(formatMessage(title, options?.description), "achievement", options?.duration),
    error: (title: string, options?: SonnerLikeOptions) =>
        pushToast(formatMessage(title, options?.description), "error", options?.duration),
    info: (title: string, options?: SonnerLikeOptions) =>
        pushToast(formatMessage(title, options?.description), "info", options?.duration),
    warning: (title: string, options?: SonnerLikeOptions) =>
        pushToast(formatMessage(title, options?.description), "warning", options?.duration),
    /** Dismiss is a no-op on the in-game toast system (auto-dismiss handles it). */
    dismiss: () => {},
})

/**
 * Shadcn-compatible `useToast()` hook surface.
 *
 * Returns an object with a `toast({ title, description, variant })` method.
 * Existing callers can keep using `const { toast } = useToast()`; the
 * underlying delivery is the in-game toast system.
 */
export function useToast() {
    return {
        toast: (options: ShadcnLikeOptions) => callable(options),
        dismiss: () => {},
        toasts: [] as const,
    }
}
