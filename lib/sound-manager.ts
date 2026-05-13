"use client"

// Web Audio API Synthesizer for UI Sounds & Procedural Music
// Generates all audio procedurally to avoid asset dependencies

type SoundType = 'click' | 'hover' | 'success' | 'notification' | 'error' | 'start' | 'victory' | 'defeat' | 'matchStart' | 'roundWin' | 'roundLose' | 'weekAdvance' | 'transfer' | 'achievement' | 'contractSign' | 'facilityUpgrade' | 'tournamentAdvance'

class SoundManager {
    private ctx: AudioContext | null = null
    private enabled: boolean = true
    private masterGain: GainNode | null = null
    private musicGain: GainNode | null = null
    private sfxGain: GainNode | null = null
    private musicPlaying: boolean = false
    private musicOscillators: OscillatorNode[] = []
    private musicInterval: ReturnType<typeof setInterval> | null = null
    private ambientNoiseNode: AudioBufferSourceNode | null = null
    private activeNodes: { osc: OscillatorNode; gain: GainNode }[] = []
    private static readonly MAX_CONCURRENT_SOUNDS = 32

    constructor() {
        if (typeof window !== "undefined") {
            const initAudio = () => {
                window.removeEventListener('click', initAudio)
                window.removeEventListener('keydown', initAudio)
                try {
                    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                    this.ctx = new AudioContextClass()

                    // Master gain → destination
                    this.masterGain = this.ctx.createGain()
                    this.masterGain.gain.value = 0.24
                    this.masterGain.connect(this.ctx.destination)

                    // Music sub-bus
                    this.musicGain = this.ctx.createGain()
                    this.musicGain.gain.value = 0.32
                    this.musicGain.connect(this.masterGain)

                    // SFX sub-bus
                    this.sfxGain = this.ctx.createGain()
                    this.sfxGain.gain.value = 0.72
                    this.sfxGain.connect(this.masterGain)
                } catch (e) {
                    // Silently degrade — all methods check for null ctx
                }
            }

            window.addEventListener('click', initAudio)
            window.addEventListener('keydown', initAudio)
        }
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled
        if (!enabled) {
            this.stopMusic()
            this.stopAllSfx()
        }
    }

    public setMasterVolume(value: number) {
        // value: 0-100
        if (!this.ctx || !this.masterGain) return
        this.masterGain.gain.value = Math.max(0, Math.min(1, value / 100)) * 0.42
    }

    public setMusicVolume(value: number) {
        // value: 0-100
        if (!this.ctx || !this.musicGain) return
        this.musicGain.gain.value = Math.max(0, Math.min(1, value / 100)) * 0.46
    }

    public setSfxVolume(value: number) {
        // value: 0-100
        if (!this.ctx || !this.sfxGain) return
        this.sfxGain.gain.value = Math.max(0, Math.min(1, value / 100))
    }

    // ============ SFX ============

    public play(type: SoundType) {
        if (!this.enabled || !this.ctx || !this.sfxGain) return

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { })
        }

        try {
        const t = this.ctx.currentTime

        switch (type) {
            case 'click': {
                const osc = this.ctx.createOscillator()
                const gain = this.ctx.createGain()
                osc.connect(gain)
                gain.connect(this.sfxGain)
                osc.type = 'sine'
                osc.frequency.setValueAtTime(720, t)
                osc.frequency.exponentialRampToValueAtTime(980, t + 0.05)
                gain.gain.setValueAtTime(0.14, t)
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.042)
                osc.start(t)
                osc.stop(t + 0.045)
                this.trackNode(osc, gain)
                break
            }
            case 'hover': {
                const osc = this.ctx.createOscillator()
                const gain = this.ctx.createGain()
                osc.connect(gain)
                gain.connect(this.sfxGain)
                osc.type = 'triangle'
                osc.frequency.setValueAtTime(400, t)
                gain.gain.setValueAtTime(0.05, t)
                gain.gain.linearRampToValueAtTime(0, t + 0.01)
                osc.start(t)
                osc.stop(t + 0.01)
                this.trackNode(osc, gain)
                break
            }
            case 'success':
                this.playTone(523.25, t, 0.1)
                this.playTone(659.25, t + 0.05, 0.1)
                this.playTone(783.99, t + 0.1, 0.2)
                break
            case 'notification':
                this.playTone(880, t, 0.08, 'sine', 0.12)
                this.playTone(1320, t + 0.08, 0.18, 'sine', 0.08)
                break
            case 'error': {
                const osc = this.ctx.createOscillator()
                const gain = this.ctx.createGain()
                osc.connect(gain)
                gain.connect(this.sfxGain)
                osc.type = 'sawtooth'
                osc.frequency.setValueAtTime(150, t)
                osc.frequency.linearRampToValueAtTime(100, t + 0.2)
                gain.gain.setValueAtTime(0.3, t)
                gain.gain.linearRampToValueAtTime(0, t + 0.2)
                osc.start(t)
                osc.stop(t + 0.2)
                this.trackNode(osc, gain)
                break
            }
            case 'start': {
                const o1 = this.ctx.createOscillator()
                const g1 = this.ctx.createGain()
                o1.connect(g1)
                g1.connect(this.sfxGain)
                o1.frequency.setValueAtTime(110, t)
                o1.frequency.exponentialRampToValueAtTime(440, t + 0.5)
                g1.gain.setValueAtTime(0, t)
                g1.gain.linearRampToValueAtTime(0.5, t + 0.1)
                g1.gain.exponentialRampToValueAtTime(0.01, t + 1.0)
                o1.start(t)
                o1.stop(t + 1.0)
                this.trackNode(o1, g1)
                break
            }
            case 'victory':
                // Triumphant ascending arpeggio (C major → G major)
                this.playTone(523.25, t, 0.15, 'sine', 0.4)       // C5
                this.playTone(659.25, t + 0.1, 0.15, 'sine', 0.4)  // E5
                this.playTone(783.99, t + 0.2, 0.15, 'sine', 0.4)  // G5
                this.playTone(1046.5, t + 0.3, 0.4, 'sine', 0.5)   // C6
                this.playTone(987.77, t + 0.5, 0.15, 'sine', 0.3)  // B5
                this.playTone(1174.7, t + 0.6, 0.5, 'sine', 0.4)   // D6
                break
            case 'defeat':
                // Descending minor chord
                this.playTone(440, t, 0.3, 'sine', 0.3)            // A4
                this.playTone(349.23, t + 0.15, 0.3, 'sine', 0.25) // F4
                this.playTone(293.66, t + 0.3, 0.5, 'sine', 0.2)   // D4
                break
            case 'matchStart':
                // Countdown beep pattern
                this.playTone(440, t, 0.08, 'square', 0.2)
                this.playTone(440, t + 0.3, 0.08, 'square', 0.2)
                this.playTone(440, t + 0.6, 0.08, 'square', 0.2)
                this.playTone(880, t + 0.9, 0.2, 'square', 0.3)
                break
            case 'roundWin':
                this.playTone(659.25, t, 0.08, 'sine', 0.3)
                this.playTone(783.99, t + 0.06, 0.12, 'sine', 0.3)
                break
            case 'roundLose':
                this.playTone(349.23, t, 0.08, 'sine', 0.2)
                this.playTone(293.66, t + 0.06, 0.12, 'sine', 0.2)
                break
            case 'weekAdvance':
                // Soft clock-tick progression
                this.playTone(520, t, 0.045, 'sine', 0.11)
                this.playTone(740, t + 0.07, 0.08, 'sine', 0.09)
                break
            case 'transfer':
                // Cash register / deal sound
                this.playTone(523.25, t, 0.1, 'sine', 0.3)
                this.playTone(659.25, t + 0.08, 0.1, 'sine', 0.3)
                this.playTone(783.99, t + 0.16, 0.15, 'sine', 0.35)
                break
            case 'achievement':
                // Triumphant fanfare
                this.playTone(523.25, t, 0.12, 'sine', 0.4)
                this.playTone(659.25, t + 0.1, 0.12, 'sine', 0.4)
                this.playTone(783.99, t + 0.2, 0.12, 'sine', 0.4)
                this.playTone(1046.5, t + 0.35, 0.5, 'sine', 0.5)
                break
            case 'contractSign':
                // Pen scratch + confirmation
                this.playTone(400, t, 0.05, 'triangle', 0.15)
                this.playTone(600, t + 0.1, 0.15, 'sine', 0.25)
                break
            case 'facilityUpgrade':
                // Building/construction ascending
                this.playTone(220, t, 0.15, 'sine', 0.2)
                this.playTone(330, t + 0.12, 0.15, 'sine', 0.25)
                this.playTone(440, t + 0.24, 0.15, 'sine', 0.3)
                this.playTone(550, t + 0.36, 0.25, 'sine', 0.35)
                break
            case 'tournamentAdvance':
                // Ascending power chord
                this.playTone(440, t, 0.1, 'sine', 0.3)
                this.playTone(554.37, t + 0.08, 0.1, 'sine', 0.3)
                this.playTone(659.25, t + 0.16, 0.2, 'sine', 0.35)
                break
        }
        } catch { /* AudioContext error — silently degrade */ }
    }

    // ============ AMBIENT MUSIC ============

    public startMusic(scene: 'menu' | 'match' | 'dashboard' = 'menu') {
        if (!this.enabled || !this.ctx || !this.musicGain || this.musicPlaying) return

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => { })
        }

        this.musicPlaying = true

        if (scene === 'match') {
            this.startMatchAmbience()
        } else {
            this.startAmbientPad()
        }
    }

    public stopMusic() {
        this.musicPlaying = false
        this.musicOscillators.forEach(osc => {
            try { osc.stop() } catch { }
        })
        this.musicOscillators = []
        if (this.musicInterval) {
            clearInterval(this.musicInterval)
            this.musicInterval = null
        }
        if (this.ambientNoiseNode) {
            try { this.ambientNoiseNode.stop() } catch { }
            this.ambientNoiseNode = null
        }
    }

    public stopAllSfx() {
        for (const entry of this.activeNodes) {
            try { entry.osc.stop() } catch { /* already stopped */ }
            try { entry.osc.disconnect() } catch { /* already disconnected */ }
            try { entry.gain.disconnect() } catch { /* already disconnected */ }
        }
        this.activeNodes = []
    }

    private startAmbientPad() {
        if (!this.ctx || !this.musicGain) return
        try {

        // Warm ambient pad using detuned sine waves (ethereal, non-distracting)
        const chords = [
            [130.81, 164.81, 196.00], // C3 E3 G3
            [110.00, 130.81, 164.81], // A2 C3 E3
            [116.54, 146.83, 174.61], // Bb2 D3 F3
            [98.00, 130.81, 164.81],  // G2 C3 E3
        ]

        let chordIdx = 0

        const playChord = () => {
            if (!this.ctx || !this.musicGain || !this.musicPlaying) return

            const t = this.ctx.currentTime
            const notes = chords[chordIdx % chords.length]

            notes.forEach(freq => {
                const osc = this.ctx!.createOscillator()
                const gain = this.ctx!.createGain()
                osc.connect(gain)
                gain.connect(this.musicGain!)

                osc.type = 'sine'
                osc.frequency.setValueAtTime(freq, t)
                // Slight detune for warmth
                osc.detune.setValueAtTime((Math.random() - 0.5) * 10, t)

                gain.gain.setValueAtTime(0, t)
                gain.gain.linearRampToValueAtTime(0.08, t + 1.5)
                gain.gain.setValueAtTime(0.08, t + 6)
                gain.gain.linearRampToValueAtTime(0, t + 8)

                osc.start(t)
                osc.stop(t + 8.5)
                this.musicOscillators.push(osc)
            })

            chordIdx++
        }

        playChord()
        this.musicInterval = setInterval(playChord, 8000)
        } catch { /* AudioContext error — silently degrade */ }
    }

    private startMatchAmbience() {
        if (!this.ctx || !this.musicGain) return
        try {

        // Low frequency hum + filtered noise for crowd ambience
        const t = this.ctx.currentTime

        // Sub bass drone
        const drone = this.ctx.createOscillator()
        const droneGain = this.ctx.createGain()
        drone.connect(droneGain)
        droneGain.connect(this.musicGain)
        drone.type = 'sine'
        drone.frequency.setValueAtTime(55, t) // A1 - low sub bass
        droneGain.gain.setValueAtTime(0, t)
        droneGain.gain.linearRampToValueAtTime(0.06, t + 2)
        drone.start(t)
        this.musicOscillators.push(drone)

        // Filtered noise for crowd rumble
        const bufferSize = this.ctx.sampleRate * 4
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate)
        const data = buffer.getChannelData(0)
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.5
        }

        const noiseSource = this.ctx.createBufferSource()
        noiseSource.buffer = buffer
        noiseSource.loop = true

        const filter = this.ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(300, t)

        const noiseGain = this.ctx.createGain()
        noiseGain.gain.setValueAtTime(0, t)
        noiseGain.gain.linearRampToValueAtTime(0.04, t + 3)

        noiseSource.connect(filter)
        filter.connect(noiseGain)
        noiseGain.connect(this.musicGain)
        noiseSource.start(t)
        this.ambientNoiseNode = noiseSource
        } catch { /* AudioContext error — silently degrade */ }
    }

    // ============ INTERNALS ============

    private trackNode(osc: OscillatorNode, gain: GainNode) {
        // Evict oldest node if at capacity
        if (this.activeNodes.length >= SoundManager.MAX_CONCURRENT_SOUNDS) {
            const oldest = this.activeNodes.shift()
            if (oldest) {
                try { oldest.osc.stop() } catch { /* already stopped */ }
                try { oldest.osc.disconnect() } catch { /* already disconnected */ }
                try { oldest.gain.disconnect() } catch { /* already disconnected */ }
            }
        }

        const entry = { osc, gain }
        this.activeNodes.push(entry)

        // Auto-cleanup when the oscillator ends
        osc.addEventListener('ended', () => {
            try { osc.disconnect() } catch { /* already disconnected */ }
            try { gain.disconnect() } catch { /* already disconnected */ }
            const idx = this.activeNodes.indexOf(entry)
            if (idx !== -1) this.activeNodes.splice(idx, 1)
        })
    }

    private playTone(freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) {
        if (!this.ctx || !this.sfxGain) return

        const osc = this.ctx.createOscillator()
        const gain = this.ctx.createGain()

        osc.connect(gain)
        gain.connect(this.sfxGain)

        osc.type = type
        osc.frequency.setValueAtTime(freq, startTime)

        gain.gain.setValueAtTime(volume, startTime)
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

        osc.start(startTime)
        osc.stop(startTime + duration)

        this.trackNode(osc, gain)
    }
}

// Singleton instance
export const soundManager = new SoundManager()
