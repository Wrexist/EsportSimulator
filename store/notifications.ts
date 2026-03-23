"use client"

import { create } from 'zustand'
import { Bell, Trophy, DollarSign, Users, TrendingUp, AlertCircle, Info, CheckCircle, Swords } from 'lucide-react'
import { LucideIcon } from 'lucide-react'

export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'trophy' | 'money' | 'player' | 'tournament'

export interface Notification {
    id: string
    type: NotificationType
    title: string
    message: string
    timestamp: number
    read: boolean
    action?: {
        label: string
        onClick: () => void
    }
    // Tournament-specific fields
    tournamentId?: string
    tournamentLogoPath?: string
    tournamentColor?: string
    linkUrl?: string
}

interface NotificationStore {
    notifications: Notification[]
    unreadCount: number
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
    markAsRead: (id: string) => void
    markAllAsRead: () => void
    removeNotification: (id: string) => void
    clearAll: () => void
}

/**
 * Notification Store
 * Manages in-game notifications
 */
export const useNotifications = create<NotificationStore>((set) => ({
    notifications: [],
    unreadCount: 0,

    addNotification: (notification) => set((state) => {
        const newNotif: Notification = {
            ...notification,
            id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            timestamp: Date.now(),
            read: false
        }

        const updated = [newNotif, ...state.notifications].slice(0, 50) // Keep last 50

        return {
            notifications: updated,
            unreadCount: updated.filter(n => !n.read).length
        }
    }),

    markAsRead: (id) => set((state) => {
        const updated = state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n
        )

        return {
            notifications: updated,
            unreadCount: updated.filter(n => !n.read).length
        }
    }),

    markAllAsRead: () => set((state) => ({
        notifications: state.notifications.map(n => ({ ...n, read: true })),
        unreadCount: 0
    })),

    removeNotification: (id) => set((state) => {
        const updated = state.notifications.filter(n => n.id !== id)
        return {
            notifications: updated,
            unreadCount: updated.filter(n => !n.read).length
        }
    }),

    clearAll: () => set({
        notifications: [],
        unreadCount: 0
    })
}))

/**
 * Get icon for notification type
 */
export function getNotificationIcon(type: NotificationType): LucideIcon {
    switch (type) {
        case 'success':
            return CheckCircle
        case 'trophy':
            return Trophy
        case 'money':
            return DollarSign
        case 'player':
            return Users
        case 'warning':
            return AlertCircle
        case 'error':
            return AlertCircle
        case 'tournament':
            return Swords
        default:
            return Info
    }
}

/**
 * Get color for notification type
 */
export function getNotificationColor(type: NotificationType, customColor?: string): string {
    // Use custom tournament color if provided (inline styles needed since Tailwind purges dynamic classes)
    if (type === 'tournament' && customColor) {
        return `text-purple-500 bg-purple-500/10 border-purple-500/20`
    }

    switch (type) {
        case 'success':
            return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
        case 'trophy':
            return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        case 'money':
            return 'text-green-500 bg-green-500/10 border-green-500/20'
        case 'player':
            return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
        case 'warning':
            return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
        case 'error':
            return 'text-red-500 bg-red-500/10 border-red-500/20'
        case 'tournament':
            return 'text-purple-500 bg-purple-500/10 border-purple-500/20'
        default:
            return 'text-blue-500 bg-blue-500/10 border-blue-500/20'
    }
}

/**
 * Notification helpers
 */
export const notify = {
    success: (title: string, message: string) => {
        useNotifications.getState().addNotification({ type: 'success', title, message })
    },

    trophy: (title: string, message: string, action?: Notification['action']) => {
        useNotifications.getState().addNotification({ type: 'trophy', title, message, action })
    },

    money: (title: string, message: string) => {
        useNotifications.getState().addNotification({ type: 'money', title, message })
    },

    player: (title: string, message: string, action?: Notification['action']) => {
        useNotifications.getState().addNotification({ type: 'player', title, message, action })
    },

    warning: (title: string, message: string) => {
        useNotifications.getState().addNotification({ type: 'warning', title, message })
    },

    error: (title: string, message: string) => {
        useNotifications.getState().addNotification({ type: 'error', title, message })
    },

    info: (title: string, message: string, action?: Notification['action']) => {
        useNotifications.getState().addNotification({ type: 'info', title, message, action })
    },

    tournament: (
        title: string,
        message: string,
        options?: {
            tournamentId?: string
            tournamentLogoPath?: string
            tournamentColor?: string
            action?: Notification['action']
        }
    ) => {
        useNotifications.getState().addNotification({
            type: 'tournament',
            title,
            message,
            tournamentId: options?.tournamentId,
            tournamentLogoPath: options?.tournamentLogoPath,
            tournamentColor: options?.tournamentColor,
            linkUrl: options?.tournamentId ? `/tournaments/${options.tournamentId}` : undefined,
            action: options?.action
        })
    }
}
