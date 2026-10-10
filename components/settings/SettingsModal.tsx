"use client"

import { useFocusTrap } from "@/lib/accessibility"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AccessibilitySettings, AudioSettings, ControlsSettings, DisplaySettings, GameplaySettings } from "./SettingsSections"

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

type Tab = "display" | "audio" | "game" | "controls"

const TABS: { id: Tab; label: string }[] = [
    { id: "display", label: "Display" },
    { id: "audio", label: "Audio" },
    { id: "game", label: "Gameplay" },
    { id: "controls", label: "Controls" },
]

/**
 * Settings dialog for the main menu (no career loaded). Every control applies
 * live, so the footer only closes.
 */
export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>("display")
    const dialogRef = useFocusTrap(isOpen, onClose)

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
                            <h2 id="modal-title-settings" className="font-display text-2xl font-bold uppercase leading-none tracking-[0.01em] text-ink-1">Settings</h2>
                            <button type="button" onClick={onClose} aria-label="Close settings" className="-mr-1.5 rounded-md p-1.5 text-ink-3 transition-colors hover:bg-raised hover:text-ink-1">
                                <X size={18} />
                            </button>
                        </header>

                        <div className="shrink-0 border-b border-line px-6">
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
                                <TabsList aria-label="Settings sections" className="border-b-0!">
                                    {TABS.map(tab => <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>)}
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                            {activeTab === "display" && <><DisplaySettings /><div className="border-t border-line"><AccessibilitySettings /></div></>}
                            {activeTab === "audio" && <AudioSettings />}
                            {activeTab === "game" && <GameplaySettings />}
                            {activeTab === "controls" && <ControlsSettings />}
                        </div>

                        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-6 py-4">
                            <p className="text-xs text-ink-3">Changes apply immediately and stay on this device.</p>
                            <Button variant="outline" onClick={onClose}>Done</Button>
                        </footer>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
