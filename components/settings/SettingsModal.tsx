"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Monitor, Volume2, Gamepad2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
    useSettingsStore,
    WindowMode,
    Resolution,
    GameSpeed
} from "@/lib/settings-store"
import { cn } from "@/lib/utils"

interface SettingsModalProps {
    isOpen: boolean
    onClose: () => void
}

type Tab = 'display' | 'audio' | 'game'

const TABS = [
    { id: 'display' as Tab, label: 'Display', icon: Monitor },
    { id: 'audio' as Tab, label: 'Audio', icon: Volume2 },
    { id: 'game' as Tab, label: 'Game', icon: Gamepad2 },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
    { value: '1920x1080', label: '1920 × 1080 (Full HD)' },
    { value: '1600x900', label: '1600 × 900' },
    { value: '1280x720', label: '1280 × 720 (HD)' },
    { value: '1024x768', label: '1024 × 768' },
]

const WINDOW_MODES: { value: WindowMode; label: string }[] = [
    { value: 'fullscreen', label: 'Fullscreen' },
    { value: 'windowed', label: 'Windowed' },
    { value: 'borderless', label: 'Borderless Windowed' },
]

const GAME_SPEEDS: { value: GameSpeed; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' },
    { value: 'very-fast', label: 'Very Fast' },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('display')
    const settings = useSettingsStore()

    const handleApply = () => {
        settings.applyWindowSettings()
        onClose()
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 top-16 bg-black/85 backdrop-blur-md z-modal"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 top-16 flex items-center justify-center z-modal p-4"
                    >
                        <div role="dialog" aria-modal="true" aria-labelledby="modal-title-settings" className="w-full max-w-2xl bg-gradient-to-br from-[#0f1318] to-[#0a0d10] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                                <h2 id="modal-title-settings" className="text-xl font-bold text-white">Settings</h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClose}
                                    className="w-8 h-8 p-0 rounded-lg text-white/40 hover:text-white hover:bg-white/5"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-white/5">
                                {TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                      flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium transition-all
                                        ${activeTab === tab.id
                                                ? 'text-white bg-white/5 border-b-2 border-emerald-500 shadow-[0_4px_12px_-4px_rgba(16,185,129,0.3)]'
                                                : 'text-white/40 hover:text-white/60 hover:bg-white/[0.02]'
                                            }
                    `}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Content */}
                            <div className="p-6 min-h-[320px]">
                                {activeTab === 'display' && (
                                    <DisplaySettings settings={settings} />
                                )}
                                {activeTab === 'audio' && (
                                    <AudioSettings settings={settings} />
                                )}
                                {activeTab === 'game' && (
                                    <GameSettings settings={settings} />
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 bg-white/[0.02]">
                                <Button
                                    variant="ghost"
                                    onClick={onClose}
                                    className="text-white/40 hover:text-white hover:bg-white/5 transition-all"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleApply}
                                    className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 hover:border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)] transition-all gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    Apply
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

// Display Settings Tab
function DisplaySettings({ settings }: { settings: ReturnType<typeof useSettingsStore.getState> }) {
    return (
        <div className="space-y-6">
            <SettingRow label="Window Mode">
                <select
                    value={settings.windowMode}
                    onChange={(e) => settings.setWindowMode(e.target.value as WindowMode)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-48"
                >
                    {WINDOW_MODES.map((mode) => (
                        <option key={mode.value} value={mode.value} className="bg-[#1a1f2e]">
                            {mode.label}
                        </option>
                    ))}
                </select>
            </SettingRow>

            <SettingRow label="Resolution">
                <select
                    value={settings.resolution}
                    onChange={(e) => settings.setResolution(e.target.value as Resolution)}
                    disabled={settings.windowMode === 'fullscreen'}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 w-48 disabled:opacity-50"
                >
                    {RESOLUTIONS.map((res) => (
                        <option key={res.value} value={res.value} className="bg-[#1a1f2e]">
                            {res.label}
                        </option>
                    ))}
                </select>
            </SettingRow>

            <SettingRow label="VSync">
                <ToggleSwitch
                    enabled={settings.vsync}
                    onChange={settings.setVsync}
                />
            </SettingRow>

            <SettingRow label="FPS Limit">
                <select
                    value={settings.fpsLimit}
                    onChange={(e) => settings.setFpsLimit(Number(e.target.value))}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-48"
                >
                    <option value={0} className="bg-[#1a1f2e]">Unlimited</option>
                    <option value={30} className="bg-[#1a1f2e]">30 FPS</option>
                    <option value={60} className="bg-[#1a1f2e]">60 FPS</option>
                    <option value={120} className="bg-[#1a1f2e]">120 FPS</option>
                </select>
            </SettingRow>
        </div>
    )
}

// Audio Settings Tab
function AudioSettings({ settings }: { settings: ReturnType<typeof useSettingsStore.getState> }) {
    return (
        <div className="space-y-8">
            <VolumeSlider
                label="Master Volume"
                value={settings.masterVolume}
                onChange={settings.setMasterVolume}
            />
            <VolumeSlider
                label="Music Volume"
                value={settings.musicVolume}
                onChange={settings.setMusicVolume}
            />
            <VolumeSlider
                label="SFX Volume"
                value={settings.sfxVolume}
                onChange={settings.setSfxVolume}
            />
        </div>
    )
}

// Game Settings Tab
function GameSettings({ settings }: { settings: ReturnType<typeof useSettingsStore.getState> }) {
    return (
        <div className="space-y-6">
            <SettingRow label="Auto-Save">
                <ToggleSwitch
                    enabled={settings.autoSave}
                    onChange={settings.setAutoSave}
                />
            </SettingRow>

            <SettingRow label="Auto-Save Interval">
                <select
                    value={settings.autoSaveInterval}
                    onChange={(e) => settings.setAutoSaveInterval(Number(e.target.value))}
                    disabled={!settings.autoSave}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 w-48 disabled:opacity-50"
                >
                    <option value={5} className="bg-[#1a1f2e]">Every 5 minutes</option>
                    <option value={10} className="bg-[#1a1f2e]">Every 10 minutes</option>
                    <option value={30} className="bg-[#1a1f2e]">Every 30 minutes</option>
                </select>
            </SettingRow>

            <SettingRow label="Game Speed">
                <select
                    value={settings.gameSpeed}
                    onChange={(e) => settings.setGameSpeed(e.target.value as GameSpeed)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-48"
                >
                    {GAME_SPEEDS.map((speed) => (
                        <option key={speed.value} value={speed.value} className="bg-[#1a1f2e]">
                            {speed.label}
                        </option>
                    ))}
                </select>
            </SettingRow>

            <SettingRow label="Notifications">
                <ToggleSwitch
                    enabled={settings.notifications}
                    onChange={settings.setNotifications}
                />
            </SettingRow>
        </div>
    )
}

// Reusable Components
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">{label}</span>
            {children}
        </div>
    )
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={cn(
                "relative w-12 h-6 rounded-full transition-all duration-300 outline-none",
                enabled
                    ? "bg-emerald-500/20 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                    : "bg-white/5 border border-white/10"
            )}
        >
            <motion.div
                className={cn(
                    "absolute top-0.5 w-4.5 h-4.5 rounded-full shadow-lg transition-colors",
                    enabled ? "bg-emerald-400 shadow-emerald-500/50" : "bg-white/20"
                )}
                animate={{ left: enabled ? 26 : 3 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
        </button>
    )
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (val: number) => void }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">{label}</span>
                <span className="text-sm text-white/50 tabular-nums w-12 text-right">{value}%</span>
            </div>
            <Slider
                value={[value]}
                onValueChange={(vals) => onChange(vals[0])}
                min={0}
                max={100}
                step={1}
                className="w-full [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500 [&_[data-slot=slider-thumb]]:bg-emerald-400"
            />
        </div>
    )
}
