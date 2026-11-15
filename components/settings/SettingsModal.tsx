"use client"

import { useFocusTrap } from "@/lib/accessibility"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccessibilitySettings, AudioSettings, ControlsSettings, DisplaySettings, GameplaySettings, LanguageSettings } from "./SettingsSections"
import { getLocale, subscribeLocale, t } from "@/lib/i18n"

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
    /** Tab to open on (the page passes pendingSettingsReopen() after a language change). */
    initialTab?: Tab
}

export type Tab = "display" | "audio" | "game" | "controls"

/**
 * A language change remounts the whole shell (GameShell keys on the locale),
 * which unmounts the page hosting this dialog (I18N-12). While the dialog is
 * open it notes the change here, so the remounted page can open it again on
 * the same tab. The note is short-lived: a page mounted later never reopens it.
 */
let reopen: { tab: Tab; at: number } | null = null
const REOPEN_WINDOW_MS = 5000

/** The tab to reopen the dialog on after a language change, or null. Does not clear the note (StrictMode runs initialisers twice). */
export function pendingSettingsReopen(): Tab | null {
    return reopen && Date.now() - reopen.at < REOPEN_WINDOW_MS ? reopen.tab : null
}

const TABS: { id: Tab; label: string }[] = [
    { id: "display", label: "settings.panel.display" },
    { id: "audio", label: "settings.panel.audio" },
    { id: "game", label: "settings.panel.gameplay" },
    { id: "controls", label: "settings.panel.controls" },
]

/**
 * Settings dialog for the main menu (no career loaded). Every control applies
 * live, so the footer only closes.
 */
export function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? "display")
    const dialogRef = useFocusTrap(isOpen, onClose)
    const tabRef = useRef(activeTab)
    tabRef.current = activeTab

    useEffect(() => {
        if (!isOpen) return
        reopen = null
        const locale = getLocale()
        return subscribeLocale(() => {
            if (getLocale() !== locale) reopen = { tab: tabRef.current, at: Date.now() }
        })
    }, [isOpen])

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="settings-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="fixed inset-0 z-modal flex items-center justify-center bg-ink/80 p-4"
                    onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
                >
                    <div
                        ref={dialogRef}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="modal-title-settings"
                        className="flex max-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[10px] border border-line-strong bg-panel outline-none"
                    >
                        <header className="flex shrink-0 items-center justify-between gap-4 px-6 pt-4">
                            <h2 id="modal-title-settings" className="font-display text-2xl font-bold uppercase leading-none tracking-[0.01em] text-ink-1">{t("settings.title")}</h2>
                            <button type="button" onClick={onClose} aria-label={t("settings.close")} className="-mr-1.5 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-raised hover:text-ink-1">
                                <X size={18} />
                            </button>
                        </header>

                        <div className="shrink-0 border-b border-line px-6">
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
                                <TabsList aria-label={t("settings.sections")} className="border-b-0!">
                                    {TABS.map(tab => <TabsTrigger key={tab.id} value={tab.id}>{t(tab.label)}</TabsTrigger>)}
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                            {activeTab === "display" && <><LanguageSettings /><div className="border-t border-line"><DisplaySettings /></div><div className="border-t border-line"><AccessibilitySettings /></div></>}
                            {activeTab === "audio" && <AudioSettings />}
                            {activeTab === "game" && <GameplaySettings />}
                            {activeTab === "controls" && <ControlsSettings />}
                        </div>

                        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
                            <p className="text-xs text-ink-3">{t("settings.footer")}</p>
                            <Button variant="outline" onClick={onClose}>{t("settings.done")}</Button>
                        </footer>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
