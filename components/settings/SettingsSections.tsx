"use client"

/**
 * Settings sections shared by the Settings page and the main-menu Settings
 * dialog. Every control writes straight to its store and applies live, so
 * there is nothing to "apply" or "cancel". Only settings that change the game
 * are listed (career difficulty was removed: nothing reads it).
 */

import { useEffect, useState, type ReactNode } from "react"
import { useShallow } from "zustand/react/shallow"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/toast"
import { Slider } from "@/components/ui/slider"
import { useSettingsStore, type GameSpeed, type RenderingMode, type Resolution, type WindowMode } from "@/lib/settings-store"
import { soundManager } from "@/lib/sound-manager"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { useGameStore } from "@/store/game-store"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import { Trans } from "@/lib/trans"
import { UI_LANGUAGES } from "@/lib/ui-languages"
import { effectiveUiScale, stableBaseViewportSize, UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from "@/lib/ui-scale"

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

function SettingSlider({ label, value, onChange, min, max, step, suffix = "%", commitOnRelease = false }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string; commitOnRelease?: boolean }) {
    // commitOnRelease: show the value while dragging, apply it on release (the UI scale
    // zooms the page, which would move the slider under the pointer mid-drag).
    const [pending, setPending] = useState<number | null>(null)
    const shown = pending ?? value
    return (
        <div className="flex w-52 items-center gap-3">
            <Slider
                aria-label={label}
                aria-valuetext={`${shown}${suffix}`}
                value={[shown]}
                onValueChange={(vals) => commitOnRelease ? setPending(vals[0]) : onChange(vals[0])}
                onValueCommit={commitOnRelease ? (vals) => { setPending(null); onChange(vals[0]) } : undefined}
                min={min}
                max={max}
                step={step}
                className="flex-1 **:data-[slot=slider-range]:bg-ink-2 **:data-[slot=slider-thumb]:border-ink-1 **:data-[slot=slider-thumb]:bg-ink-1 **:data-[slot=slider-track]:bg-hover"
            />
            <span className="w-10 text-right text-sm tabular-nums text-ink-2">{shown}{suffix}</span>
        </div>
    )
}

// ── Sections ───────────────────────────────────────────────────────────────

const WINDOW_MODES = (): { value: WindowMode; label: string }[] => [
    { value: "windowed", label: t("settings.window.windowed") },
    { value: "fullscreen", label: t("settings.window.fullscreen") },
]

const RESOLUTIONS: { value: Resolution; label: string }[] = [
    { value: "1920x1080", label: "1920 × 1080" },
    { value: "1600x900", label: "1600 × 900" },
    { value: "1280x720", label: "1280 × 720" },
    { value: "1024x768", label: "1024 × 768" },
]

const RENDERING_MODES = (): { value: RenderingMode; label: string }[] => [
    { value: "compatibility", label: t("settings.rendering.software") },
    { value: "performance", label: t("settings.rendering.gpu") },
]

export function DisplaySettings() {
    const s = useSettingsStore(useShallow(state => ({
        windowMode: state.windowMode, setWindowMode: state.setWindowMode,
        resolution: state.resolution, setResolution: state.setResolution,
        renderingMode: state.renderingMode, setRenderingMode: state.setRenderingMode,
        uiScale: state.uiScale, setUiScale: state.setUiScale,
        uiScaleAuto: state.uiScaleAuto, setUiScaleAuto: state.setUiScaleAuto,
        reducedMotion: state.reducedMotion, setReducedMotion: state.setReducedMotion,
        applyWindowSettings: state.applyWindowSettings,
    })))

    // While the scale is automatic the slider shows the size in force, which follows the window.
    const [viewport, setViewport] = useState(() => stableBaseViewportSize())
    useEffect(() => {
        const update = () => setViewport(stableBaseViewportSize())
        update()
        window.addEventListener("resize", update)
        return () => window.removeEventListener("resize", update)
    }, [])
    const shownScale = effectiveUiScale({ uiScale: s.uiScale, uiScaleAuto: s.uiScaleAuto }, viewport)

    // Show the mode the desktop app is actually running in, not a stale stored choice.
    useEffect(() => {
        const gpu = (window as typeof window & { electron?: { gpu?: { getMode?: () => Promise<RenderingMode> } } }).electron?.gpu
        gpu?.getMode?.().then(mode => useSettingsStore.setState({ renderingMode: mode })).catch(() => {})
    }, [])

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-window-mode" label={t("settings.windowMode")} hint={t("settings.windowModeHint")}>
                <SettingSelect id="set-window-mode" label={t("settings.windowMode")} value={s.windowMode} options={WINDOW_MODES()}
                    onChange={(mode) => { s.setWindowMode(mode); s.applyWindowSettings() }} />
            </SettingRow>
            <SettingRow id="set-resolution" label={t("settings.resolution")} hint={t("settings.resolutionHint")}>
                <SettingSelect id="set-resolution" label={t("settings.resolution")} value={s.resolution} options={RESOLUTIONS} disabled={s.windowMode !== "windowed"}
                    onChange={(res) => { s.setResolution(res); s.applyWindowSettings() }} />
            </SettingRow>
            <SettingRow id="set-rendering" label={t("settings.rendering")} hint={t("settings.renderingHint")}>
                <SettingSelect id="set-rendering" label={t("settings.rendering")} value={s.renderingMode} options={RENDERING_MODES()} onChange={s.setRenderingMode} />
            </SettingRow>
            <SettingRow label={t("settings.uiScale")} hint={t("settings.uiScaleHint")}>
                <SettingSlider label={t("settings.uiScale")} value={shownScale} onChange={s.setUiScale} commitOnRelease min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={UI_SCALE_STEP} />
            </SettingRow>
            <SettingRow id="set-ui-scale-auto" label={t("settings.uiScaleAuto")} hint={t("settings.uiScaleAutoHint")}>
                <Switch id="set-ui-scale-auto" checked={s.uiScaleAuto}
                    onCheckedChange={(on) => { if (on) s.setUiScaleAuto(true); else s.setUiScale(shownScale) }} />
            </SettingRow>
            <SettingRow id="set-reduced-motion" label={t("settings.reducedMotion")} hint={t("settings.reducedMotionHint")}>
                <Switch id="set-reduced-motion" checked={s.reducedMotion} onCheckedChange={s.setReducedMotion} />
            </SettingRow>
        </div>
    )
}

export function AudioSettings() {
    const s = useSettingsStore(useShallow(state => ({
        soundEnabled: state.soundEnabled, setSoundEnabled: state.setSoundEnabled,
        masterVolume: state.masterVolume, setMasterVolume: state.setMasterVolume,
        musicVolume: state.musicVolume, setMusicVolume: state.setMusicVolume,
        sfxVolume: state.sfxVolume, setSfxVolume: state.setSfxVolume,
        uiSounds: state.uiSounds, setUiSounds: state.setUiSounds,
        hoverSounds: state.hoverSounds, setHoverSounds: state.setHoverSounds,
        muteWhenUnfocused: state.muteWhenUnfocused, setMuteWhenUnfocused: state.setMuteWhenUnfocused,
    })))

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-sound" label={t("settings.sound")} hint={t("settings.soundHint")}>
                <Switch id="set-sound" checked={s.soundEnabled} onCheckedChange={s.setSoundEnabled} />
            </SettingRow>
            <SettingRow label={t("settings.masterVolume")}>
                <SettingSlider label={t("settings.masterVolume")} value={s.masterVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setMasterVolume(v); soundManager.setMasterVolume(v) }} />
            </SettingRow>
            <SettingRow label={t("settings.musicVolume")}>
                <SettingSlider label={t("settings.musicVolume")} value={s.musicVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setMusicVolume(v); soundManager.setMusicVolume(v) }} />
            </SettingRow>
            <SettingRow label={t("settings.effectsVolume")} hint={t("settings.effectsVolumeHint")}>
                <SettingSlider label={t("settings.effectsVolume")} value={s.sfxVolume} min={0} max={100} step={1}
                    onChange={(v) => { s.setSfxVolume(v); soundManager.setSfxVolume(v) }} />
            </SettingRow>
            <SettingRow id="set-ui-sounds" label={t("settings.uiSounds")} hint={t("settings.uiSoundsHint")}>
                <Switch id="set-ui-sounds" checked={s.uiSounds} onCheckedChange={(v) => { s.setUiSounds(v); soundManager.setUiSounds(v) }} />
            </SettingRow>
            <SettingRow id="set-hover-sounds" label={t("settings.hoverSounds")} hint={t("settings.hoverSoundsHint")}>
                <Switch id="set-hover-sounds" checked={s.hoverSounds} disabled={!s.uiSounds} onCheckedChange={(v) => { s.setHoverSounds(v); soundManager.setHoverSounds(v) }} />
            </SettingRow>
            <SettingRow id="set-mute-unfocused" label={t("settings.muteUnfocused")} hint={t("settings.muteUnfocusedHint")}>
                <Switch id="set-mute-unfocused" checked={s.muteWhenUnfocused} onCheckedChange={(v) => { s.setMuteWhenUnfocused(v); soundManager.setMuteWhenUnfocused(v) }} />
            </SettingRow>
        </div>
    )
}

const GAME_SPEEDS: { value: GameSpeed; label: string }[] = [
    { value: "normal", label: "1×" },
    { value: "fast", label: "2×" },
    { value: "very-fast", label: "4×" },
]

const AUTOSAVE_MINUTES = [2, 5, 10, 15, 30]

export function GameplaySettings({ includeCareerOptions = true }: { includeCareerOptions?: boolean }) {
    const s = useSettingsStore(useShallow(state => ({
        gameSpeed: state.gameSpeed, setGameSpeed: state.setGameSpeed,
        autoSave: state.autoSave, setAutoSave: state.setAutoSave,
        autoSaveInterval: state.autoSaveInterval, setAutoSaveInterval: state.setAutoSaveInterval,
        notifications: state.notifications, setNotifications: state.setNotifications,
        openWeekReport: state.openWeekReport, setOpenWeekReport: state.setOpenWeekReport,
    })))
    const { showTutorialOnNewGame, setShowTutorialOnNewGame, showBugReportButton, setShowBugReportButton, careerLoaded, guideFits, triggerTutorial } = useGameStore(useShallow(state => ({
        showTutorialOnNewGame: state.showTutorialOnNewGame,
        setShowTutorialOnNewGame: state.setShowTutorialOnNewGame,
        showBugReportButton: state.showBugReportButton,
        setShowBugReportButton: state.setShowBugReportButton,
        careerLoaded: state.isInitialized && !!state.playerTeamId,
        // The manager's checklist has no place in a pro career or a Draft Cup run.
        guideFits: !state.proCareer && !state.draftCup,
        triggerTutorial: state.triggerTutorial,
    })))
    // START-04: the replay the first-session guide's "Skip" promises.
    const canReplayGuide = careerLoaded && guideFits
    const replayGuide = () => {
        if (!canReplayGuide) return
        triggerTutorial()
        toast({ title: t("settings.toast.guideRestarted"), description: t("settings.toast.guideRestartedBody") })
    }
    // Interval options must include the stored value (older builds allowed others).
    const intervals = [...new Set([...AUTOSAVE_MINUTES, s.autoSaveInterval])].sort((a, b) => a - b)
        .map(m => ({ value: m, label: t("settings.everyMinutes", { count: m }) }))

    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-speed" label={t("settings.liveSpeed")} hint={t("settings.liveSpeedHint")}>
                <SettingSelect id="set-speed" label={t("settings.liveSpeed")} value={s.gameSpeed} options={GAME_SPEEDS} onChange={s.setGameSpeed} />
            </SettingRow>
            <SettingRow id="set-autosave" label={t("settings.autoSave")} hint={t("settings.autoSaveHint")}>
                <Switch id="set-autosave" checked={s.autoSave} onCheckedChange={s.setAutoSave} />
            </SettingRow>
            <SettingRow id="set-autosave-interval" label={t("settings.autoSaveInterval")}>
                <SettingSelect id="set-autosave-interval" label={t("settings.autoSaveInterval")} value={s.autoSaveInterval} options={intervals} disabled={!s.autoSave} onChange={s.setAutoSaveInterval} />
            </SettingRow>
            <SettingRow id="set-week-report" label={t("settings.weekReport")} hint={t("settings.weekReportHint")}>
                <Switch id="set-week-report" checked={s.openWeekReport} onCheckedChange={s.setOpenWeekReport} />
            </SettingRow>
            <SettingRow id="set-notifications" label={t("settings.notifications")} hint={t("settings.notificationsHint")}>
                <Switch id="set-notifications" checked={s.notifications} onCheckedChange={s.setNotifications} />
            </SettingRow>
            {includeCareerOptions && (
                <>
                    <SettingRow id="set-tutorial" label={t("settings.tutorial")} hint={t("settings.tutorialHint")}>
                        <Switch id="set-tutorial" checked={showTutorialOnNewGame} onCheckedChange={setShowTutorialOnNewGame} />
                    </SettingRow>
                    <SettingRow id="set-replay-guide" label={t("settings.replayGuide")}
                        hint={!careerLoaded ? t("settings.replayGuideNoCareer") : !guideFits ? t("settings.replayGuideNotHere") : t("settings.replayGuideHint")}>
                        <Button id="set-replay-guide" variant="outline" size="sm" onClick={replayGuide} disabled={!canReplayGuide}>{t("settings.replayGuideButton")}</Button>
                    </SettingRow>
                    <SettingRow id="set-bug-button" label={t("settings.bugButton")} hint={t("settings.bugButtonHint")}>
                        <Switch id="set-bug-button" checked={showBugReportButton} onCheckedChange={setShowBugReportButton} />
                    </SettingRow>
                </>
            )}
        </div>
    )
}

const COLOR_MODES = () => [
    { value: "off", label: t("settings.color.off") },
    { value: "colorblind-deuteranopia", label: t("settings.color.deuteranopia") },
    { value: "colorblind-protanopia", label: t("settings.color.protanopia") },
    { value: "colorblind-tritanopia", label: t("settings.color.tritanopia") },
    { value: "high-contrast", label: t("settings.color.highContrast") },
]

export function AccessibilitySettings() {
    const colorVisionMode = useSettingsStore(state => state.colorVisionMode)
    const setColorVisionMode = useSettingsStore(state => state.setColorVisionMode)
    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-color-mode" label={t("settings.colorVision")} hint={t("settings.colorVisionHint")}>
                <SettingSelect id="set-color-mode" label={t("settings.colorVision")} value={colorVisionMode as string} options={COLOR_MODES()} onChange={(v) => setColorVisionMode(v as typeof colorVisionMode)} />
            </SettingRow>
        </div>
    )
}

function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-line-strong bg-shell px-1.5 py-0.5 font-mono text-xs text-ink-2">{children}</kbd>
}

/** Named keys (Space, Esc) are translated; letters and symbols are not. */
export const keyLabel = (key: string) => ({ Space: t("key.space"), Esc: t("key.esc"), Enter: t("key.enter"), Ctrl: t("key.ctrl") } as Record<string, string>)[key] ?? key

/** Interface language. Only languages whose file is complete are listed. */
export function LanguageSettings() {
    const language = useSettingsStore(state => state.language)
    const setLanguage = useSettingsStore(state => state.setLanguage)
    return (
        <div className="divide-y divide-line">
            <SettingRow id="set-language" label={t("settings.language")} hint={t("settings.languageHint")}>
                <SettingSelect id="set-language" label={t("settings.language")} value={language}
                    options={UI_LANGUAGES.map(l => ({ value: l.code as string, label: l.name }))} onChange={setLanguage} />
            </SettingRow>
            {language !== "en" && <p className="px-4 py-3 text-xs text-ink-3">{t("settings.languageDraft")}</p>}
        </div>
    )
}

export function ControlsSettings() {
    return (
        <div>
            <p className="px-4 pb-1 pt-3 text-xs text-ink-3">
                <Trans k="settings.controlsIntro" tags={{ kbd: key => <Kbd>{key}</Kbd> }} />
            </p>
            {SHORTCUT_GROUPS.map(group => (
                <section key={group.label} className="px-4 pb-2 pt-3">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{t(group.label)}</h3>
                    <ul className="divide-y divide-line">
                        {group.shortcuts.map(shortcut => (
                            <li key={shortcut.description + shortcut.keys.join("+")} className="flex items-center justify-between gap-4 py-1.5">
                                <span className="text-sm text-ink-2">{t(shortcut.description)}</span>
                                <span className="flex shrink-0 items-center gap-1">
                                    {shortcut.keys.map((key, i) => (
                                        <span key={i} className="flex items-center gap-1">
                                            <Kbd>{keyLabel(key)}</Kbd>
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
