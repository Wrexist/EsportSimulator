"use client"

/**
 * Settings sections shared by the Settings page and the main-menu Settings
 * dialog. Every control writes straight to its store and applies live, so
 * there is nothing to "apply" or "cancel". Only settings that change the game
 * are listed (career difficulty was removed: nothing reads it).
 */

import { useEffect, type ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { useSettingsStore, type GameSpeed, type RenderingMode, type Resolution, type WindowMode } from "@/lib/settings-store"
import { soundManager } from "@/lib/sound-manager"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { useGameStore } from "@/store/game-store"
import { cn } from "@/lib/utils"

// ── Primitives ─────────────────────────────────────────────────────────────

export function SettingRow({ label, hint, id, children, className }: { label: string; hint?: ReactNode; id?: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex items-center justify-between gap-6 px-4 py-3", className)}>
            <div className="min-w-0">
                <label htmlFor={id} className="block text-sm font-semibold text-ink-1">{label}</label>
                {hint != null && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    )
}

export function SettingSelect<T extends string | number>({ id, value, onChange, options, disabled, label }: {
    id: string
    value: T
    onChange: (value: T) => void
    options: { value: T; label: string }[]
    disabled?: boolean
    label: string
}) {
    return (
        <select
            id={id}
            aria-label={label}
            value={value}
            disabled={disabled}
            onChange={(e) => {
                const raw = e.target.value
                const match = options.find(o => String(o.value) === raw)
                if (match) onChange(match.value)
            }}
            className="h-9 w-52 rounded-md border border-line bg-shell px-3 text-sm! text-ink-1 outline-none transition-colors hover:border-line-strong focus-visible:border-gold disabled:opacity-40"
        >
            {options.map(o => <option key={String(o.value)} value={o.value} className="bg-panel">{o.label}</option>)}
        </select>
    )
}

function SettingSlider({ label, value, onChange, min, max, step, suffix = "%" }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string }) {
    return (
        <div className="flex w-52 items-center gap-3">
            <Slider
                aria-label={label}
                aria-valuetext={`${value}${suffix}`}
                value={[value]}
                onValueChange={(vals) => onChange(vals[0])}
                min={min}
                max={max}
                step={step}
                className="flex-1 **:data-[slot=slider-range]:bg-ink-2 **:data-[slot=slider-thumb]:border-ink-1 **:data-[slot=slider-thumb]:bg-ink-1 **:data-[slot=slider-track]:bg-hover"
            />
            <span className="w-10 text-right text-sm tabular-nums text-ink-2">{value}{suffix}</span>
        </div>
    )
}

// ── Sections ───────────────────────────────────────────────────────────────

const WINDOW_MODES: { value: WindowMode; label: string }[] = [
    { value: "windowed", label: "Windowed" },
    { value: "fullscreen", label: "Fullscreen" },
    { value: "borderless", label: "Borderless fullscreen" },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
    { value: "1920x1080", label: "1920 × 1080" },
    { value: "1600x900", label: "1600 × 900" },
    { value: "1280x720", label: "1280 × 720" },
    { value: "1024x768", label: "1024 × 768" },
]

const RENDERING_MODES: { value: RenderingMode; label: string }[] = [
    { value: "compatibility", label: "Software (default)" },
    { value: "performance", label: "GPU" },
]

export function DisplaySettings() {
    const s = useSettingsStore(useShallow(state => ({
        windowMode: state.windowMode, setWindowMode: state.setWindowMode,
        resolution: state.resolution, setResolution: state.setResolution,
        renderingMode: state.renderingMode, setRenderingMode: state.setRenderingMode,
        uiScale: state.uiScale, setUiScale: state.setUiScale,
        reducedMotion: state.reducedMotion, setReducedMotion: state.setReducedMotion,
        applyWindowSettings: state.applyWindowSettings,
    })))

    // Show the mode the desktop app is actually running in, not a stale stored choice.
    useEffect(() => {
        const gpu = (window as typeof window & { electron?: { gpu?: { getMode?: () => Promise<RenderingMode> } } }).electron?.gpu
        gpu?.getMode?.().then(mode => useSettingsStore.setState({ renderingMode: mode })).catch(() => {})
    }, [])

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-window-mode" label="Window mode" hint="Borderless and fullscreen both cover the whole screen.">
                <SettingSelect id="set-window-mode" label="Window mode" value={s.windowMode} options={WINDOW_MODES}
                    onChange={(mode) => { s.setWindowMode(mode); s.applyWindowSettings() }} />
            </SettingRow>
            <SettingRow id="set-resolution" label="Resolution" hint="Window size in windowed mode.">
                <SettingSelect id="set-resolution" label="Resolution" value={s.resolution} options={RESOLUTIONS} disabled={s.windowMode !== "windowed"}
                    onChange={(res) => { s.setResolution(res); s.applyWindowSettings() }} />
            </SettingRow>
            <SettingRow id="set-rendering" label="Rendering" hint="Desktop app only. Takes effect after a restart. If the window stays blank on GPU, switch back to software.">
                <SettingSelect id="set-rendering" label="Rendering" value={s.renderingMode} options={RENDERING_MODES} onChange={s.setRenderingMode} />
            </SettingRow>
            <SettingRow label="UI scale" hint="Text and spacing across the whole interface.">
                <SettingSlider label="UI scale" value={s.uiScale} onChange={s.setUiScale} min={80} max={120} step={5} />
            </SettingRow>
            <SettingRow id="set-reduced-motion" label="Reduced motion" hint="Turns off transitions and decorative animation.">
                <Switch id="set-reduced-motion" checked={s.reducedMotion} onCheckedChange={s.setReducedMotion} />
            </SettingRow>
        </div>
    )
}

export function AudioSettings() {
    const s = useSettingsStore(useShallow(state => ({
        masterVolume: state.masterVolume, setMasterVolume: state.setMasterVolume,
        musicVolume: state.musicVolume, setMusicVolume: state.setMusicVolume,
        sfxVolume: state.sfxVolume, setSfxVolume: state.setSfxVolume,
    })))
    const soundEnabled = useGameStore(state => state.soundEnabled)
    const setSoundEnabled = useGameStore(state => state.setSoundEnabled)

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-sound" label="Sound" hint="All game audio: interface sounds and music.">
                <Switch id="set-sound" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
            </SettingRow>
            <SettingRow label="Master volume">
                <SettingSlider label="Master volume" value={s.masterVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setMasterVolume(v); soundManager.setMasterVolume(v) }} />
            </SettingRow>
            <SettingRow label="Music volume">
                <SettingSlider label="Music volume" value={s.musicVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setMusicVolume(v); soundManager.setMusicVolume(v) }} />
            </SettingRow>
            <SettingRow label="Effects volume">
                <SettingSlider label="Effects volume" value={s.sfxVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setSfxVolume(v); soundManager.setSfxVolume(v) }} />
            </SettingRow>
        </div>
    )
}

const GAME_SPEEDS: { value: GameSpeed; label: string }[] = [
    { value: "normal", label: "1×" },
    { value: "fast", label: "2×" },
    { value: "very-fast", label: "4×" },
]

const AUTOSAVE_INTERVALS = [2, 5, 10, 15, 30].map(m => ({ value: m, label: `Every ${m} min` }))

export function GameplaySettings({ includeCareerOptions = true }: { includeCareerOptions?: boolean }) {
    const s = useSettingsStore(useShallow(state => ({
        gameSpeed: state.gameSpeed, setGameSpeed: state.setGameSpeed,
        autoSave: state.autoSave, setAutoSave: state.setAutoSave,
        autoSaveInterval: state.autoSaveInterval, setAutoSaveInterval: state.setAutoSaveInterval,
        notifications: state.notifications, setNotifications: state.setNotifications,
    })))
    const { showTutorialOnNewGame, setShowTutorialOnNewGame, showBugReportButton, setShowBugReportButton } = useGameStore(useShallow(state => ({
        showTutorialOnNewGame: state.showTutorialOnNewGame,
        setShowTutorialOnNewGame: state.setShowTutorialOnNewGame,
        showBugReportButton: state.showBugReportButton,
        setShowBugReportButton: state.setShowBugReportButton,
    })))
    // Interval options must include the stored value (older builds allowed others).
    const intervals = AUTOSAVE_INTERVALS.some(o => o.value === s.autoSaveInterval)
        ? AUTOSAVE_INTERVALS
        : [...AUTOSAVE_INTERVALS, { value: s.autoSaveInterval, label: `Every ${s.autoSaveInterval} min` }].sort((a, b) => a.value - b.value)

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-speed" label="Live match speed" hint="Playback speed a live match starts at. You can change it during the match.">
                <SettingSelect id="set-speed" label="Live match speed" value={s.gameSpeed} options={GAME_SPEEDS} onChange={s.setGameSpeed} />
            </SettingRow>
            <SettingRow id="set-autosave" label="Auto-save" hint="Saves the career in the background while you play.">
                <Switch id="set-autosave" checked={s.autoSave} onCheckedChange={s.setAutoSave} />
            </SettingRow>
            <SettingRow id="set-autosave-interval" label="Auto-save interval">
                <SettingSelect id="set-autosave-interval" label="Auto-save interval" value={s.autoSaveInterval} options={intervals} disabled={!s.autoSave} onChange={s.setAutoSaveInterval} />
            </SettingRow>
            <SettingRow id="set-notifications" label="Minor notifications" hint="Info and XP pop-ups. Important alerts always show.">
                <Switch id="set-notifications" checked={s.notifications} onCheckedChange={s.setNotifications} />
            </SettingRow>
            {includeCareerOptions && (
                <>
                    <SettingRow id="set-tutorial" label="First-session guide for new careers" hint="Shows the five-step checklist on Home when a career starts.">
                        <Switch id="set-tutorial" checked={showTutorialOnNewGame} onCheckedChange={setShowTutorialOnNewGame} />
                    </SettingRow>
                    <SettingRow id="set-bug-button" label="Bug report button" hint="Floating button for sending a bug report.">
                        <Switch id="set-bug-button" checked={showBugReportButton} onCheckedChange={setShowBugReportButton} />
                    </SettingRow>
                </>
            )}
        </div>
    )
}

const COLOR_MODES = [
    { value: "off", label: "Off" },
    { value: "colorblind-deuteranopia", label: "Deuteranopia (red-green)" },
    { value: "colorblind-protanopia", label: "Protanopia (red-blind)" },
    { value: "colorblind-tritanopia", label: "Tritanopia (blue-yellow)" },
    { value: "high-contrast", label: "High contrast" },
]

export function AccessibilitySettings() {
    const colorVisionMode = useSettingsStore(state => state.colorVisionMode)
    const setColorVisionMode = useSettingsStore(state => state.setColorVisionMode)
    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-color-mode" label="Colour vision" hint="Adjusts colours for colour vision deficiency, or switches to high contrast. Text size is UI scale under Display.">
                <SettingSelect id="set-color-mode" label="Colour vision" value={colorVisionMode as string} options={COLOR_MODES} onChange={(v) => setColorVisionMode(v as typeof colorVisionMode)} />
            </SettingRow>
        </div>
    )
}

function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-line-strong bg-shell px-1.5 py-0.5 font-mono text-xs text-ink-2">{children}</kbd>
}

export function ControlsSettings() {
    return (
        <div>
            <p className="px-4 pb-1 pt-3 text-xs text-ink-3">
                Keyboard and mouse. Press <Kbd>F1</Kbd> or <Kbd>?</Kbd> anywhere for this list. On macOS use <Kbd>⌘</Kbd> for <Kbd>Ctrl</Kbd>. Shortcuts can&apos;t be remapped yet, and there is no controller support.
            </p>
            {SHORTCUT_GROUPS.map(group => (
                <section key={group.label} className="px-4 pb-2 pt-3">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{group.label}</h3>
                    <ul className="divide-y divide-line">
                        {group.shortcuts.map(shortcut => (
                            <li key={shortcut.description + shortcut.keys.join("+")} className="flex items-center justify-between gap-4 py-1.5">
                                <span className="text-sm text-ink-2">{shortcut.description}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                    {shortcut.keys.map((key, i) => (
                                        <span key={i} className="flex items-center gap-1">
                                            <Kbd>{key}</Kbd>
                                            {i < shortcut.keys.length - 1 && <span className="text-xs text-ink-3">+</span>}
                                        </span>
                                    ))}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </div>
    )
}
