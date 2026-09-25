import { SoundManager } from '@/lib/sound-manager'
import { useSettingsStore } from '@/lib/settings-store'

describe('audio scene lifecycle (mock Web Audio, not an audible pass)', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    let gesture: () => void
    let context: FakeContext
    class FakeNode {
        connect = jest.fn()
        disconnect = jest.fn()
        start = jest.fn()
        stop = jest.fn((when?: number) => { if (when === undefined) this.ended?.() })
        ended?: () => void
        addEventListener = (_: string, fn: () => void) => { this.ended = fn }
        gain = {value: 1, setValueAtTime: jest.fn(), linearRampToValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn()}
        frequency = this.gain
        detune = this.gain
    }
    class FakeContext {
        currentTime = 0
        state = 'running'
        sampleRate = 8
        destination = {}
        nodes: FakeNode[] = []
        noises: FakeNode[] = []
        suspend = jest.fn(async () => { this.state = 'suspended' })
        resume = jest.fn(async () => { this.state = 'running' })
        constructor() { context = this }
        createGain = () => new FakeNode()
        createOscillator = () => { const node = new FakeNode(); this.nodes.push(node); return node }
        createBuffer = () => ({ getChannelData: () => new Float32Array(32) })
        createBufferSource = () => { const node = new FakeNode(); this.noises.push(node); return node }
        createBiquadFilter = () => new FakeNode()
    }
    beforeEach(() => {
        jest.useFakeTimers()
        useSettingsStore.getState().setMasterVolume(50)
        useSettingsStore.getState().setMusicVolume(50)
        useSettingsStore.getState().setSfxVolume(50)
        Object.defineProperty(globalThis, 'window', { configurable: true, value: {
            AudioContext: FakeContext, location: { pathname: '/main-menu' },
            addEventListener: (_: string, fn: () => void) => { gesture = fn }, removeEventListener: jest.fn(),
        } })
    })
    afterEach(() => {
        jest.clearAllTimers(); jest.useRealTimers()
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
        else Reflect.deleteProperty(globalThis, 'window')
    })
    test('switching to a match stops menu notes and starts one match ambience', () => {
        const sound = new SoundManager(); gesture()
        sound.startMusic('menu')
        const menu = context.nodes.slice()
        expect(menu).toHaveLength(3)
        sound.startMusic('match')
        expect(menu.every(node => node.stop.mock.calls.length === 2 && node.disconnect.mock.calls.length > 0)).toBe(true)
        expect(context.noises).toHaveLength(1)
        sound.startMusic('match')
        expect(context.noises).toHaveLength(1)
        sound.stopMusic()
        expect(context.noises[0].stop).toHaveBeenCalledTimes(1)
        expect(context.noises[0].disconnect).toHaveBeenCalled()
        expect(jest.getTimerCount()).toBe(0)
    })
    test('ended menu notes are disconnected and not stopped again during route cleanup', () => {
        const sound = new SoundManager(); gesture(); sound.startMusic('menu')
        const ended = context.nodes.slice()
        ended.forEach(node => node.ended?.())
        jest.advanceTimersByTime(8000)
        sound.stopMusic()
        expect(ended.every(node => node.disconnect.mock.calls.length === 1)).toBe(true)
        expect(ended.every(node => node.stop.mock.calls.length === 1)).toBe(true) // scheduled end only
    })
    test('background/resume restores one scene and quiet studio cancels it', () => {
        const sound = new SoundManager(); gesture(); sound.startMusic('match')
        sound.setForeground(false)
        expect(context.suspend).toHaveBeenCalled()
        const before = context.noises.length
        sound.play('success')
        sound.setForeground(true)
        expect(context.noises.length).toBe(before + 1)
        sound.setQuietScene(true)
        const count = context.nodes.length
        sound.startMusic('menu'); sound.play('error')
        expect(context.nodes.length).toBe(count)
        expect(jest.getTimerCount()).toBe(0)
    })
    test('muting cancels active sounds and burst throttling does not create extra notes', () => {
        const sound = new SoundManager(); gesture()
        sound.play('success')
        const notes = context.nodes.slice()
        sound.play('success'); sound.play('notification')
        expect(context.nodes).toHaveLength(notes.length)
        sound.setEnabled(false)
        expect(notes.every(node => node.disconnect.mock.calls.length > 0)).toBe(true)
        sound.play('error')
        expect(context.nodes).toHaveLength(notes.length)
    })
})
