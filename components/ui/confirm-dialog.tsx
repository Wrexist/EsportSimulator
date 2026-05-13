"use client"

import React, { ReactNode, useState } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Trash2, UserX } from 'lucide-react'
import { toast } from 'sonner'

interface ConfirmDialogProps {
    children: ReactNode
    title: string
    description: string
    onConfirm: () => void | Promise<void>
    destructive?: boolean
    confirmText?: string
    cancelText?: string
    icon?: 'warning' | 'danger' | 'info'
}

const icons = {
    warning: AlertTriangle,
    danger: Trash2,
    info: UserX
}

/**
 * Confirmation Dialog Component
 * Prevents accidental destructive actions
 * 
 * @example
 * <ConfirmDialog
 *   title="Fire Staff Member?"
 *   description="This action cannot be undone."
 *   onConfirm={() => fireStaff(id)}
 *   destructive
 * >
 *   <Button variant="destructive">Fire</Button>
 * </ConfirmDialog>
 */
export function ConfirmDialog({
    children,
    title,
    description,
    onConfirm,
    destructive = false,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    icon = 'warning'
}: ConfirmDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const Icon = icons[icon]

    const [error, setError] = useState<string | null>(null)

    const handleConfirm = async () => {
        setLoading(true)
        setError(null)
        try {
            await onConfirm()
            setOpen(false)
        } catch (err) {
            // Bug fix: previously the dialog stayed open with no signal that
            // the action failed — users would re-click Confirm and trigger a
            // duplicate. Surface the error inline plus a toast, then let
            // them choose to retry or cancel.
            const message = err instanceof Error ? err.message : "Action failed"
            setError(message)
            toast.error(`${title}: ${message}`)
            if (process.env.NODE_ENV !== "production") {
                console.error("[ConfirmDialog] onConfirm failed:", err)
            }
        } finally {
            setLoading(false)
        }
    }

    return (
        <AlertDialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next)
                if (!next) setError(null)
            }}
        >
            <AlertDialogTrigger asChild>
                {children}
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <div className="flex items-center gap-3">
                        {Icon && (
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${destructive
                                    ? 'bg-red-500/20 border border-red-500/50'
                                    : 'bg-amber-500/20 border border-amber-500/50'
                                }`}>
                                <Icon className={`w-5 h-5 ${destructive ? 'text-red-500' : 'text-amber-500'}`} />
                            </div>
                        )}
                        <AlertDialogTitle className="text-xl">{title}</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="text-base pt-2">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {error && (
                    <div
                        role="alert"
                        className="mt-2 p-3 rounded-md border border-red-500/40 bg-red-500/10 text-sm text-red-300"
                    >
                        {error}
                    </div>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>
                        {cancelText}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault()
                            handleConfirm()
                        }}
                        disabled={loading}
                        className={destructive ? 'bg-red-600 hover:bg-red-700' : ''}
                    >
                        {loading ? 'Processing...' : confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

/**
 * Quick confirm for simple "Are you sure?" prompts
 */
export function useConfirm() {
    return (message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const confirmed = window.confirm(message)
            resolve(confirmed)
        })
    }
}
