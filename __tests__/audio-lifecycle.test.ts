import { SoundManager, AUDIO_MANIFEST } from '@/lib/sound-manager'
import { useSettingsStore } from '@/lib/settings-store'

/**
 * Sample engine lifecycle against a mock Web Audio graph and a mock fetch
 * (not an audible pass — see scripts/audio/preview-audio-pack.ts for that).
 */
describe('sample-based audio engine (mock Web Audio)', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const originalFetch = globalThis.fetch
    let listeners: Map<string, () => void>
    let context: FakeContext
    let failing: Set<string>
    let fetched: string[]

    class FakeParam {
        constructor(public value = 1) {}
        setValueAtTime = jest.fn((v: number) => { this.value = v })
        linearRampToValueAtTime = jest.fn((v: number) => { this.value = v })
        exponentialRampToValueAtTime = jest.fn()
        setTargetAtTime = jest.fn((v: number) => { this.value = v })
        cancelScheduledValues = jest.fn()
    }
    class FakeNode {
        connect = jest.fn()
        disconnect = jest.fn()
        gain = new FakeParam()
    }
    class FakeSource extends FakeNode {
        buffer: { file?: string } | null = null
        loop = false
        loopStart = 0
        loopEnd = 0
        playbackRate = new FakeParam(1)
        frequency = new FakeParam(440)
        type = ''
        startArgs: number[] | null = null
        stopped = false
        private ended?: () => void
        start = jest.fn((...args: number[]) => { this.startArgs = args })
        stop = jest.fn(() => { this.stopped = true })
        addEventListener = (_: string, fn: () => void) => { this.ended = fn }
        end() { this.ended?.() }
    }
    class FakeContext {
        currentTime = 0
        state = 'running'
        destination = {}
        sources: FakeSource[] = []
        oscillators: FakeSource[] = []
        gains: FakeNode[] = []
        suspend = jest.fn(async () => { this.state = 'suspended' })
        resume = jest.fn(async () => { this.state = 'running' })
        constructor() { context = this }
        createGain = () => { const g = new FakeNode(); this.gains.push(g); return g }
        createBufferSource = () => { const s = new FakeSource(); this.sources.push(s); return s }
        createOscillator = () => { const o = new FakeSource(); this.oscillators.push(o); return o }
        createDynamicsCompressor = () => Object.assign(new FakeNode(), { threshold: new FakeParam(), knee: new FakeParam(), ratio: new FakeParam(), attack: new FakeParam(), release: new FakeParam() })
        decodeAudioData = jest.fn(async (data: ArrayBuffer & { file?: string }) => ({ file: data.file, duration: 1 }))
    }

    const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve() }
    const fileOf = (id: string) => AUDIO_MANIFEST.sounds[id]!.file
    const musicFile = (scene: string) => AUDIO_MANIFEST.music[scene]!.file
    const sourcesFor = (file: string) => context.sources.filter(s => s.buffer?.file === file)
    // buses are created in order: master, focus, music, sfx, duck, ui, match, moment
    const duckBus = () => context.gains[4]

    beforeEach(() => {
        listeners = new Map()
        failing = new Set()
        fetched = []
        useSettingsStore.setState({ masterVolume: 80, musicVolume: 45, sfxVolume: 80, uiSounds: true, hoverSounds: false, muteWhenUnfocused: true })
        Object.defineProperty(globalThis, 'window', { configurable: true, value: {
            AudioContext: FakeContext, location: { pathname: '/main-menu' },
            addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
            removeEventListener: (type: string) => listeners.delete(type),
        } })
        globalThis.fetch = jest.fn(async (url: string) => {
            fetched.push(url)
            const file = url.replace('/audio/', '')
            return { ok: !failing.has(file), status: failing.has(file) ? 404 : 200, arrayBuffer: async () => Object.assign(new ArrayBuffer(8), { file }) }
        }) as unknown as typeof fetch
    })
    afterEach(() => {
        jest.useRealTimers()
        globalThis.fetch = originalFetch
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
        else Reflect.deleteProperty(globalThis, 'window')
    })

    const unlocked = () => { const sound = new SoundManager(); listeners.get('pointerdown')!(); return sound }

    test('the very first press is audible: a synth tick while decoding, then the real file', async () => {
        const sound = unlocked()
        expect(listeners.size).toBe(0)
        sound.play('click')
        expect(context.oscillators.length).toBeGreaterThan(0)
        await flush()
        expect(fetched).toContain(`/audio/${fileOf('click')}`)
        context.currentTime = 1
        sound.play('click')
        expect(sourcesFor(fileOf('click'))).toHaveLength(1)
        expect(sourcesFor(fileOf('click'))[0].startArgs).not.toBeNull()
    })

    test('victory plays once per match across live playback and the result screen', async () => {
        const sound = unlocked()
        sound.preload('match')
        await flush()
        sound.play('victory', { key: 'outcome:m1' })
        context.currentTime = 5
        sound.play('victory', { key: 'outcome:m1' })
        expect(sourcesFor(fileOf('victory'))).toHaveLength(1)
        context.currentTime = 10
        sound.play('defeat', { key: 'outcome:m2' })
        expect(sourcesFor(fileOf('defeat'))).toHaveLength(1)
    })

    test('route scenes crossfade; one render that stops and restarts a scene leaves it playing', async () => {
        const sound = unlocked()
        sound.startMusic('menu')
        await flush()
        const menu = sourcesFor(musicFile('menu'))
        expect(menu).toHaveLength(1)
        expect(menu[0].loop).toBe(true)
        expect(menu[0].loopStart).toBe(AUDIO_MANIFEST.music.menu!.loopStart)
        expect(menu[0].loopEnd).toBe(AUDIO_MANIFEST.music.menu!.loopEnd)
        sound.stopMusic(); sound.startMusic('menu')
        await flush()
        expect(sourcesFor(musicFile('menu'))).toHaveLength(1)
        expect(menu[0].stopped).toBe(false)
        sound.startMusic('dashboard')
        await flush()
        expect(menu[0].stopped).toBe(true)
        expect(sourcesFor(musicFile('career'))).toHaveLength(1)
        expect(sound.status().scene).toBe('career')
    })

    test('a title win ducks the music, switches to the celebration loop, then hands back', async () => {
        jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
        const sound = unlocked()
        sound.startMusic('career')
        await flush()
        context.currentTime = 20
        sound.preload('moment')
        await flush()
        sound.play('titleWin')
        expect(duckBus().gain.linearRampToValueAtTime).toHaveBeenCalledWith(AUDIO_MANIFEST.sounds.titleWin!.duck, expect.any(Number))
        jest.advanceTimersByTime(AUDIO_MANIFEST.sounds.titleWin!.duration * 800 + 10)
        await flush()
        expect(sound.status().scene).toBe('celebration')
        context.currentTime = 50
        jest.advanceTimersByTime(32_000)
        await flush()
        expect(sound.status().scene).toBe('career')
        const careers = sourcesFor(musicFile('career'))
        expect(careers).toHaveLength(2)
        expect(careers[1].startArgs![1]).toBeGreaterThan(0) // resumes where it left off
    })

    test('moving to a live match ends a celebration at once', async () => {
        jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
        const sound = unlocked()
        sound.startMusic('career')
        sound.celebrate(30_000)
        await flush()
        expect(sound.currentScene()).toBe('celebration')
        sound.startMusic('match')
        await flush()
        expect(sound.currentScene()).toBe('match')
    })

    test('muting in the background suspends without losing the scene; the option can keep audio on', async () => {
        jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] })
        const sound = unlocked()
        sound.startMusic('menu')
        await flush()
        sound.setForeground(false)
        jest.advanceTimersByTime(300)
        expect(context.suspend).toHaveBeenCalled()
        sound.play('success')
        expect(sourcesFor(fileOf('success'))).toHaveLength(0)
        sound.setForeground(true)
        expect(context.resume).toHaveBeenCalled()
        expect(sourcesFor(musicFile('menu'))).toHaveLength(1)
        sound.setMuteWhenUnfocused(false)
        context.suspend.mockClear()
        sound.setForeground(false)
        jest.advanceTimersByTime(300)
        expect(context.suspend).not.toHaveBeenCalled()
    })

    test('interface switch silences ui only; hover needs its own switch', async () => {
        const sound = unlocked()
        sound.preload('ui'); sound.preload('match')
        await flush()
        sound.play('hover')
        expect(sourcesFor(fileOf('hover'))).toHaveLength(0)
        sound.setHoverSounds(true)
        sound.play('hover')
        expect(sourcesFor(fileOf('hover'))).toHaveLength(1)
        sound.setUiSounds(false)
        context.currentTime = 2
        sound.play('click')
        sound.play('roundWin')
        expect(sourcesFor(fileOf('click'))).toHaveLength(0)
        expect(sourcesFor(fileOf('roundWin'))).toHaveLength(1)
    })

    test('a file that fails to load falls back to a short synthesised cue', async () => {
        failing.add(fileOf('defeat'))
        const sound = unlocked()
        sound.play('defeat')
        await flush()
        expect(sourcesFor(fileOf('defeat'))).toHaveLength(0)
        expect(context.oscillators.length).toBeGreaterThan(0)
        expect(sound.status().failed).toContain(fileOf('defeat'))
    })

    test('quiet studio and the sound switch stop effects and music', async () => {
        const sound = unlocked()
        sound.startMusic('menu')
        sound.preload('ui')
        await flush()
        sound.setQuietScene(true)
        await flush()
        expect(sourcesFor(musicFile('menu'))[0].stopped).toBe(true)
        sound.play('notification')
        expect(sourcesFor(fileOf('notification'))).toHaveLength(0)
        sound.setQuietScene(false)
        sound.setEnabled(false)
        await flush()
        sound.play('notification')
        expect(sourcesFor(fileOf('notification'))).toHaveLength(0)
        expect(sound.status().scene).toBeNull()
    })

    test('without an AudioContext everything is a silent no-op', () => {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: {
            location: { pathname: '/main-menu' }, addEventListener: (type: string, fn: () => void) => listeners.set(type, fn), removeEventListener: jest.fn(),
        } })
        const sound = new SoundManager()
        listeners.get('pointerdown')!()
        expect(() => { sound.play('victory'); sound.startMusic('menu'); sound.setForeground(false) }).not.toThrow()
        expect(sound.status().unlocked).toBe(false)
    })
})
