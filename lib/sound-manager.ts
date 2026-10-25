"use client"

/**
 * Sample-based audio engine. Every sound and music cue is a file under
 * public/audio described by manifest.json (rendered by
 * scripts/audio/render-audio-pack.ts). The engine only knows manifest ids,
 * so any file can be replaced without code changes.
 *
 * Graph:  voice → category bus (ui | match | moment) → sfx ┐
 *         music voice (crossfade) → music → duck ──────────┴→ master → focus → limiter → out
 *
 * Without an AudioContext (SSR, jsdom tests) every call is a no-op. If a file
 * cannot be loaded the sound falls back to a short synthesised cue.
 */

import manifestJson from '@/public/audio/manifest.json'
import { AudioFeedbackGate, type MusicScene, type SoundCategory, type SoundType } from './audio-feedback'
import { DEFAULT_MASTER_VOLUME, DEFAULT_MUSIC_VOLUME, DEFAULT_SFX_VOLUME, useSettingsStore } from './settings-store'
import { routeMusicScene } from './route-audio'

export interface ManifestSound { file: string; category: SoundCategory; gain: number; duration: number; variation?: number; duck?: number; alias?: string }
export interface ManifestMusic { file: string; gain: number; duration: number; loopStart: number; loopEnd: number; bpm?: number }
export interface AudioManifest { format: string; sounds: Partial<Record<string, ManifestSound>>; music: Partial<Record<string, ManifestMusic>> }
export interface PlayOptions {
    /** linear gain multiplier for this call */
    gain?: number
    /** playback-rate multiplier (pitch) */
    rate?: number
    /** play at most once per key for the whole session, e.g. `outcome:<matchId>` */
    key?: string
}

export const AUDIO_MANIFEST = manifestJson as unknown as AudioManifest
const AUDIO_BASE = '/audio/'
/** Headroom into the limiter, and music sitting under effects at equal slider values. */
const MASTER_SCALE = 0.9
const MUSIC_SCALE = 0.7
const MAX_VOICES = 24
const MAX_SAME_ID = 3
/** How late a sound may still start once its file arrives (seconds). */
const MAX_LATENCY: Record<SoundCategory, number> = { ui: 0.12, match: 0.35, moment: 2.5 }
const MUSIC_FADE_IN = 1.6
const MUSIC_FADE_OUT = 1.2
/** Title moments switch the music to the celebration loop for a while. */
const CELEBRATION_MS: Partial<Record<SoundType, number>> = { titleWin: 32_000, titleWinMajor: 45_000 }
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'click'] as const

type FallbackShape = 'tick' | 'up' | 'down' | 'fanfare' | 'beeps' | 'thud'
const FALLBACK: Partial<Record<SoundType, FallbackShape>> = {
    click: 'tick', hover: 'tick', tab: 'tick', toggle: 'tick', back: 'tick',
    error: 'down', roundLose: 'down', defeat: 'down', relegation: 'down',
    victory: 'fanfare', titleWin: 'fanfare', titleWinMajor: 'fanfare', clutch: 'fanfare', seasonReview: 'fanfare', matchIntro: 'fanfare',
    countdown: 'beeps', start: 'beeps', matchStart: 'beeps', bombPlant: 'beeps', bombDefuse: 'beeps',
    bombExplode: 'thud',
}

interface Voice { src: AudioBufferSourceNode; gain: GainNode; id: SoundType }
interface MusicVoice { scene: MusicScene; src: AudioBufferSourceNode; gain: GainNode; startedAt: number; offset: number; entry: ManifestMusic }
interface Buses { master: GainNode; focus: GainNode; sfx: GainNode; music: GainNode; duck: GainNode; cat: Record<SoundCategory, GainNode> }

const clampVolume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0

function setParam(param: AudioParam, value: number, ctx: BaseAudioContext | null, smooth = 0.015) {
    try {
        if (ctx && typeof param.setTargetAtTime === 'function') {
            param.cancelScheduledValues?.(ctx.currentTime)
            param.setTargetAtTime(value, ctx.currentTime, smooth)
        }
    } catch { /* fall through to a direct set */ }
    param.value = value
}

export class SoundManager {
    private ctx: AudioContext | null = null
    private decoder: BaseAudioContext | null = null
    private buses: Buses | null = null
    private buffers = new Map<string, AudioBuffer>()
    private loading = new Map<string, Promise<AudioBuffer | null>>()
    private failed = new Set<string>()
    private voices: Voice[] = []
    private gate = new AudioFeedbackGate()
    private playedKeys = new Set<string>()

    private enabled = true
    private quietScene = false
    /** >0 while store actions run on the manager's behalf (delegated chores): their cues stay silent. */
    private silenced = 0
    private foreground = true
    private muteWhenUnfocused = true
    private uiSounds = true
    private hoverSounds = false
    private masterVolume = DEFAULT_MASTER_VOLUME
    private musicVolume = DEFAULT_MUSIC_VOLUME
    private sfxVolume = DEFAULT_SFX_VOLUME
    private categoryVolume: Record<SoundCategory, number> = { ui: 100, match: 100, moment: 100 }

    private baseScene: MusicScene | null = null
    private celebrating = false
    private celebrationTimers: ReturnType<typeof setTimeout>[] = []
    private music: MusicVoice | null = null
    private pendingScene: MusicScene | null = null
    private musicToken = 0
    private positions = new Map<MusicScene, number>()
    private refreshQueued = false
    private suspendTimer: ReturnType<typeof setTimeout> | null = null

    constructor() {
        if (typeof window === 'undefined') return
        const unlock = () => {
            for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true)
            this.unlock()
        }
        // Capture phase: the context exists before a button's own pointerdown plays its click.
        for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true)
        // Decode the interface set ahead of the first press with an offline decoder (no autoplay limits).
        const idle = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
        if (typeof idle === 'function') idle.call(window, () => this.preload('ui'), { timeout: 4000 })
        else if (typeof setTimeout === 'function') setTimeout(() => this.preload('ui'), 1500)
    }

    // ── lifecycle ───────────────────────────────────────────────────────────

    /** Create/resume the AudioContext. Runs on the first gesture; safe to call again. */
    public unlock() {
        if (typeof window === 'undefined') return
        if (this.ctx) {
            if (this.ctx.state === 'suspended' && this.audible()) this.ctx.resume?.().catch(() => { })
            return
        }
        try {
            this.readSettings()
            const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            if (!Ctor) return
            const ctx = new Ctor()
            this.ctx = ctx
            this.buses = this.buildGraph(ctx)
            if (ctx.state === 'suspended') ctx.resume?.().catch(() => { })
            this.preload('ui')
            this.requestRefresh()
        } catch {
            this.ctx = null
            this.buses = null
        }
    }

    private readSettings() {
        try {
            const s = useSettingsStore.getState()
            this.masterVolume = clampVolume(s.masterVolume)
            this.musicVolume = clampVolume(s.musicVolume)
            this.sfxVolume = clampVolume(s.sfxVolume)
            if (typeof s.uiSounds === 'boolean') this.uiSounds = s.uiSounds
            if (typeof s.hoverSounds === 'boolean') this.hoverSounds = s.hoverSounds
            if (typeof s.muteWhenUnfocused === 'boolean') this.muteWhenUnfocused = s.muteWhenUnfocused
        } catch { /* settings unavailable: keep defaults */ }
    }

    private buildGraph(ctx: AudioContext): Buses {
        const gain = (value: number) => { const g = ctx.createGain(); g.gain.value = value; return g }
        const master = gain(this.masterVolume / 100 * MASTER_SCALE)
        const focus = gain(this.audible() ? 1 : 0)
        const music = gain(this.musicVolume / 100 * MUSIC_SCALE)
        const sfx = gain(this.sfxVolume / 100)
        const duck = gain(1)
        const cat = {
            ui: gain(this.uiSounds ? this.categoryVolume.ui / 100 : 0),
            match: gain(this.categoryVolume.match / 100),
            moment: gain(this.categoryVolume.moment / 100),
        }
        master.connect(focus)
        const limiter = typeof ctx.createDynamicsCompressor === 'function' ? ctx.createDynamicsCompressor() : null
        if (limiter) {
            limiter.threshold.value = -4; limiter.knee.value = 2; limiter.ratio.value = 12
            limiter.attack.value = 0.002; limiter.release.value = 0.15
            focus.connect(limiter); limiter.connect(ctx.destination)
        } else focus.connect(ctx.destination)
        sfx.connect(master)
        music.connect(duck); duck.connect(master)
        cat.ui.connect(sfx); cat.match.connect(sfx); cat.moment.connect(sfx)
        return { master, focus, sfx, music, duck, cat }
    }

    private audible(): boolean { return this.foreground || !this.muteWhenUnfocused }

    private isQuiet(): boolean {
        return this.quietScene || (typeof window !== 'undefined' && routeMusicScene(window.location?.pathname ?? null) === 'silent')
    }

    // ── settings ────────────────────────────────────────────────────────────

    public setEnabled(enabled: boolean) {
        this.enabled = enabled
        if (!enabled) this.stopAllSfx()
        this.requestRefresh()
    }

    public setQuietScene(quiet: boolean) {
        this.quietScene = quiet
        if (quiet) this.stopAllSfx()
        this.requestRefresh()
    }

    /** Window focus/visibility. Muting while unfocused keeps music position (the context is suspended). */
    public setForeground(foreground: boolean) {
        if (foreground === this.foreground) return
        this.foreground = foreground
        this.applyAudibility()
    }

    public setMuteWhenUnfocused(mute: boolean) {
        this.muteWhenUnfocused = mute
        this.applyAudibility()
    }

    private applyAudibility() {
        const ctx = this.ctx, buses = this.buses
        if (!ctx || !buses) return
        if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null }
        if (this.audible()) {
            if (ctx.state === 'suspended') ctx.resume?.().catch(() => { })
            setParam(buses.focus.gain, 1, ctx, 0.08)
        } else {
            setParam(buses.focus.gain, 0, ctx, 0.04)
            this.suspendTimer = setTimeout(() => {
                this.suspendTimer = null
                if (!this.audible()) ctx.suspend?.().catch(() => { })
            }, 220)
        }
    }

    public setMasterVolume(value: number) {
        this.masterVolume = clampVolume(value)
        if (this.buses) setParam(this.buses.master.gain, this.masterVolume / 100 * MASTER_SCALE, this.ctx)
        this.requestRefresh()
    }

    public setMusicVolume(value: number) {
        this.musicVolume = clampVolume(value)
        if (this.buses) setParam(this.buses.music.gain, this.musicVolume / 100 * MUSIC_SCALE, this.ctx)
        this.requestRefresh()
    }

    public setSfxVolume(value: number) {
        this.sfxVolume = clampVolume(value)
        if (this.buses) setParam(this.buses.sfx.gain, this.sfxVolume / 100, this.ctx)
    }

    /** Independent level per effect category (0–100); the settings screen exposes ui on/off. */
    public setCategoryVolume(category: SoundCategory, value: number) {
        this.categoryVolume[category] = clampVolume(value)
        this.applyCategory(category)
    }

    public setUiSounds(enabled: boolean) {
        this.uiSounds = enabled
        this.applyCategory('ui')
    }

    public setHoverSounds(enabled: boolean) { this.hoverSounds = enabled }

    private applyCategory(category: SoundCategory) {
        if (!this.buses) return
        const on = category !== 'ui' || this.uiSounds
        setParam(this.buses.cat[category].gain, on ? this.categoryVolume[category] / 100 : 0, this.ctx)
    }

    // ── effects ─────────────────────────────────────────────────────────────

    /** Runs `fn` with effect cues muted, for actions the player did not take themselves. */
    public silently<T>(fn: () => T): T {
        this.silenced++
        try { return fn() } finally { this.silenced-- }
    }

    public play(type: SoundType, opts: PlayOptions = {}) {
        if (!this.enabled || this.silenced > 0 || this.isQuiet()) return
        const entry = AUDIO_MANIFEST.sounds[type]
        if (!entry) return
        if (entry.category === 'ui' && !this.uiSounds) return
        if (type === 'hover' && !this.hoverSounds) return
        const ctx = this.ctx
        if (!ctx || !this.buses || !this.audible()) return
        if (this.masterVolume === 0 || this.sfxVolume === 0) return
        if (opts.key) {
            if (this.playedKeys.has(opts.key)) return
            this.playedKeys.add(opts.key)
            if (this.playedKeys.size > 256) this.playedKeys.delete(this.playedKeys.values().next().value as string)
        }
        if (!this.gate.allow(type, ctx.currentTime)) return
        if (ctx.state === 'suspended') ctx.resume?.().catch(() => { })

        try {
            const buffer = this.buffers.get(entry.file)
            if (buffer) { this.startVoice(type, entry, buffer, opts); return }
            const failed = this.failed.has(entry.file)
            // The very first interface press must be audible even if its file is still decoding.
            if (entry.category === 'ui' || failed) this.playFallback(type, entry)
            if (failed) return
            const requested = ctx.currentTime
            void this.load(entry.file).then(loaded => {
                if (entry.category === 'ui' || this.ctx !== ctx || !this.enabled || this.isQuiet()) return
                if (ctx.currentTime - requested > MAX_LATENCY[entry.category]) return
                if (loaded) this.startVoice(type, entry, loaded, opts)
                else this.playFallback(type, entry)
            })
        } catch { /* AudioContext error — silently degrade */ }
    }

    private startVoice(type: SoundType, entry: ManifestSound, buffer: AudioBuffer, opts: PlayOptions) {
        const ctx = this.ctx!, buses = this.buses!
        const same = this.voices.filter(v => v.id === type)
        if (same.length >= MAX_SAME_ID) this.releaseVoice(same[0], true)
        if (this.voices.length >= MAX_VOICES) this.releaseVoice(this.voices[0], true)
        const src = ctx.createBufferSource()
        src.buffer = buffer
        const variation = entry.variation ?? 0
        const rate = (opts.rate ?? 1) * (variation ? 1 + (Math.random() * 2 - 1) * variation : 1)
        if (rate !== 1) src.playbackRate.value = rate
        const gain = ctx.createGain()
        gain.gain.value = (entry.gain ?? 1) * (opts.gain ?? 1)
        src.connect(gain)
        gain.connect(buses.cat[entry.category])
        const voice: Voice = { src, gain, id: type }
        this.voices.push(voice)
        src.addEventListener('ended', () => this.releaseVoice(voice), { once: true })
        src.start()
        if (entry.duck !== undefined) this.duckMusic(entry.duck, entry.duration)
        const celebrate = CELEBRATION_MS[type]
        if (celebrate) this.celebrate(celebrate, entry.duration * 0.8)
    }

    private releaseVoice(voice: Voice, stop = false) {
        const idx = this.voices.indexOf(voice)
        if (idx === -1) return
        this.voices.splice(idx, 1)
        if (stop) { try { voice.src.stop() } catch { /* already stopped */ } }
        try { voice.src.disconnect() } catch { /* already disconnected */ }
        try { voice.gain.disconnect() } catch { /* already disconnected */ }
    }

    public stopAllSfx() {
        for (const voice of this.voices.slice()) this.releaseVoice(voice, true)
    }

    /** Short synthesised stand-in when a file is missing or still decoding. */
    private playFallback(type: SoundType, entry: ManifestSound) {
        const ctx = this.ctx, buses = this.buses
        if (!ctx || !buses) return
        const shape = FALLBACK[type] ?? (entry.category === 'ui' ? 'tick' : 'up')
        const t = ctx.currentTime
        const tone = (freq: number, at: number, dur: number, vol: number, wave: OscillatorType = 'sine') => {
            const osc = ctx.createOscillator(), g = ctx.createGain()
            osc.type = wave
            osc.frequency.setValueAtTime(freq, t + at)
            g.gain.setValueAtTime(0.0001, t + at)
            g.gain.exponentialRampToValueAtTime(vol, t + at + 0.004)
            g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur)
            osc.connect(g); g.connect(buses.cat[entry.category])
            osc.addEventListener('ended', () => { try { osc.disconnect(); g.disconnect() } catch { /* gone */ } }, { once: true })
            osc.start(t + at); osc.stop(t + at + dur + 0.02)
        }
        switch (shape) {
            case 'tick': tone(1800, 0, 0.035, 0.07); break
            case 'up': tone(880, 0, 0.2, 0.09); tone(1318.5, 0.07, 0.28, 0.09); break
            case 'down': tone(330, 0, 0.18, 0.1, 'triangle'); tone(262, 0.1, 0.24, 0.09, 'triangle'); break
            case 'fanfare': [587.3, 740, 880, 1174.7].forEach((f, i) => tone(f, i * 0.09, 0.45, 0.1)); break
            case 'beeps': tone(1046.5, 0, 0.08, 0.09); tone(1046.5, 0.15, 0.08, 0.09); break
            case 'thud': tone(70, 0, 0.45, 0.2); break
        }
    }

    private duckMusic(level: number, duration: number) {
        const ctx = this.ctx, buses = this.buses
        if (!ctx || !buses) return
        const p = buses.duck.gain
        const now = ctx.currentTime
        try {
            p.cancelScheduledValues(now)
            p.setValueAtTime(p.value, now)
            p.linearRampToValueAtTime(level, now + 0.08)
            const hold = Math.max(0.25, duration * 0.75)
            p.setValueAtTime(level, now + 0.08 + hold)
            p.linearRampToValueAtTime(1, now + 0.08 + hold + 1.2)
        } catch { p.value = 1 }
    }

    // ── music ───────────────────────────────────────────────────────────────

    /** Route music. 'dashboard' is the legacy name of the career scene. */
    public startMusic(scene: MusicScene | 'dashboard' = 'menu') {
        const next: MusicScene = scene === 'dashboard' ? 'career' : scene
        if (next !== this.baseScene && next === 'match') this.endCelebration()
        this.baseScene = next
        if (next === 'match') this.preload('match')
        this.requestRefresh()
    }

    public stopMusic() {
        this.baseScene = null
        this.requestRefresh()
    }

    /** Switch to the celebration loop for a while (after `delaySec`), then back to the route's scene. */
    public celebrate(durationMs = 32_000, delaySec = 0) {
        this.endCelebration()
        const start = () => { this.celebrating = true; this.requestRefresh() }
        if (delaySec > 0) this.celebrationTimers.push(setTimeout(start, delaySec * 1000))
        else start()
        this.celebrationTimers.push(setTimeout(() => { this.celebrating = false; this.requestRefresh() }, delaySec * 1000 + durationMs))
        const entry = AUDIO_MANIFEST.music.celebration
        if (entry) void this.load(entry.file)
    }

    /** Back to the route's scene now (a moment that celebrated was closed). */
    public endCelebration() {
        this.celebrationTimers.forEach(clearTimeout)
        this.celebrationTimers = []
        if (this.celebrating) { this.celebrating = false; this.requestRefresh() }
    }

    /** The scene that should be audible right now (null = silence). */
    public currentScene(): MusicScene | null {
        if (!this.enabled || this.isQuiet() || this.musicVolume === 0 || this.masterVolume === 0 || !this.baseScene) return null
        return this.celebrating && this.baseScene !== 'match' ? 'celebration' : this.baseScene
    }

    private requestRefresh() {
        if (this.refreshQueued) return
        this.refreshQueued = true
        // Coalesce stop/start pairs from one render (route effects) into one decision.
        void Promise.resolve().then(() => { this.refreshQueued = false; this.refreshMusic() })
    }

    private refreshMusic() {
        if (!this.ctx || !this.buses) return
        const want = this.currentScene()
        if (want && want === this.music?.scene) { this.pendingScene = null; return }
        if (want && want === this.pendingScene) return
        this.fadeOutMusic()
        this.musicToken++
        this.pendingScene = null
        if (!want) return
        const entry = AUDIO_MANIFEST.music[want]
        if (!entry) return
        const token = this.musicToken
        this.pendingScene = want
        void this.load(entry.file).then(buffer => {
            if (token !== this.musicToken) return
            this.pendingScene = null
            if (buffer && this.ctx && this.currentScene() === want) this.startMusicVoice(want, entry, buffer)
        })
    }

    private startMusicVoice(scene: MusicScene, entry: ManifestMusic, buffer: AudioBuffer) {
        const ctx = this.ctx!, buses = this.buses!
        try {
            const src = ctx.createBufferSource()
            src.buffer = buffer
            src.loop = true
            src.loopStart = entry.loopStart
            src.loopEnd = entry.loopEnd
            const gain = ctx.createGain()
            const now = ctx.currentTime
            gain.gain.setValueAtTime(0, now)
            gain.gain.linearRampToValueAtTime(entry.gain ?? 1, now + MUSIC_FADE_IN)
            src.connect(gain)
            gain.connect(buses.music)
            const offset = scene === 'celebration' ? 0 : this.positions.get(scene) ?? 0
            src.start(now, offset)
            this.music = { scene, src, gain, startedAt: now, offset, entry }
        } catch { this.music = null }
    }

    private fadeOutMusic() {
        const m = this.music
        if (!m) return
        this.music = null
        const ctx = this.ctx
        if (!ctx) return
        const now = ctx.currentTime
        const len = m.entry.loopEnd - m.entry.loopStart
        let pos = m.offset + (now - m.startedAt)
        if (pos > m.entry.loopEnd && len > 0) pos = m.entry.loopStart + ((pos - m.entry.loopStart) % len)
        this.positions.set(m.scene, pos)
        try {
            m.gain.gain.cancelScheduledValues(now)
            m.gain.gain.setValueAtTime(m.gain.gain.value, now)
            m.gain.gain.linearRampToValueAtTime(0, now + MUSIC_FADE_OUT)
            m.src.addEventListener('ended', () => { try { m.src.disconnect(); m.gain.disconnect() } catch { /* gone */ } }, { once: true })
            m.src.stop(now + MUSIC_FADE_OUT + 0.05)
        } catch {
            try { m.src.disconnect(); m.gain.disconnect() } catch { /* gone */ }
        }
    }

    // ── loading ─────────────────────────────────────────────────────────────

    /** Fetch and decode every file of a category (or the music cue for a scene). */
    public preload(set: SoundCategory | 'match') {
        const files = new Set<string>()
        for (const entry of Object.values(AUDIO_MANIFEST.sounds)) if (entry && entry.category === set) files.add(entry.file)
        if (set === 'match' && AUDIO_MANIFEST.music.match) files.add(AUDIO_MANIFEST.music.match.file)
        files.forEach(file => { void this.load(file) })
    }

    private getDecoder(): BaseAudioContext | null {
        if (this.ctx) return this.ctx
        if (this.decoder) return this.decoder
        if (typeof window === 'undefined') return null
        try {
            const Offline = window.OfflineAudioContext || (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
            this.decoder = Offline ? new Offline(2, 1, 48000) : null
        } catch { this.decoder = null }
        return this.decoder
    }

    private load(file: string): Promise<AudioBuffer | null> {
        const cached = this.buffers.get(file)
        if (cached) return Promise.resolve(cached)
        if (this.failed.has(file)) return Promise.resolve(null)
        const pending = this.loading.get(file)
        if (pending) return pending
        const decoder = this.getDecoder()
        if (!decoder || typeof fetch !== 'function') return Promise.resolve(null)
        const job = fetch(AUDIO_BASE + file)
            .then(res => { if (!res.ok) throw new Error(`${res.status} ${file}`); return res.arrayBuffer() })
            .then(data => decoder.decodeAudioData(data))
            .then(buffer => { this.buffers.set(file, buffer); return buffer })
            .catch(() => { this.failed.add(file); return null })
            .finally(() => { this.loading.delete(file) })
        this.loading.set(file, job)
        return job
    }

    /** Diagnostics for tests and the settings screen. */
    public status() {
        return {
            unlocked: !!this.ctx, state: this.ctx?.state ?? 'none', scene: this.music?.scene ?? null,
            loaded: this.buffers.size, failed: [...this.failed], voices: this.voices.length,
        }
    }
}

// Singleton instance
export const soundManager = new SoundManager()
