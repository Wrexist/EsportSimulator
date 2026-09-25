import { createSessionPersistence } from '../../lib/session-persistence'
import { SoundManager } from '../../lib/sound-manager'
import { useSettingsStore } from '../../lib/settings-store'

// Isolated integration fixture. Uses the production lifecycle and native IPC;
// dialog choices and disk latency are controlled here, not in shipping code.
const qa = (window as any).lifecycleQA
const assert = (value: unknown, message: string) => { if (!value) throw Error(message) }
const report = (stage: string, detail: unknown = {}) => fetch('/stage', { method: 'POST', body: JSON.stringify({ stage, detail }) })
async function run() {
    if (new URLSearchParams(location.search).has('read')) {
        const settings = useSettingsStore.getState()
        assert(settings.masterVolume === 0 && settings.uiScale === 110, 'Fresh process lost device preferences')
        await report('preferences-reloaded', { masterVolume: settings.masterVolume, uiScale: settings.uiScale })
        return
    }
    useSettingsStore.getState().setMasterVolume(0)
    useSettingsStore.getState().setUiScale(110)
    const sound = new SoundManager()
    window.dispatchEvent(new Event('click'))
    const internals = sound as any
    assert(internals.ctx instanceof AudioContext, 'Real AudioContext did not initialize')
    assert(internals.masterGain.gain.value === 0, 'First gesture ignored stored mute')
    let oscillators = 0
    const create = internals.ctx.createOscillator.bind(internals.ctx)
    internals.ctx.createOscillator = () => { oscillators++; return create() }
    sound.play('click')
    assert(oscillators === 0, 'Muted click generated a sound')
    sound.setMasterVolume(100)
    for (const route of ['/map-editor', '/map-editor/lab']) {
        history.replaceState(null, '', route)
        sound.play('click'); sound.startMusic('menu')
        assert(oscillators === 0, `${route} generated audio`)
    }
    history.replaceState(null, '', '/')
    sound.setForeground(false); sound.play('click'); sound.startMusic('match')
    assert(oscillators === 0, 'Background generated audio')
    // Keep the probe inaudible while checking scene scheduling and restoration.
    sound.setMasterVolume(0); sound.setForeground(true)
    assert(internals.pendingMusicScene === 'match' && internals.musicPlaying, 'Match scene was not restored')
    sound.stopMusic(); sound.startMusic('menu')
    assert(internals.pendingMusicScene === 'menu' && internals.musicPlaying, 'Menu scene was not restored')
    sound.stopMusic(); await internals.ctx.close()
    const persisted = JSON.parse(localStorage.getItem('game-settings')!).state
    assert(persisted.masterVolume === 0 && persisted.uiScale === 110, 'Device settings not persisted')
    await report('audio', { mutedFirstGesture: true, studioAndLabSilent: true, backgroundSilent: true, sceneRestore: true, preferencesStored: true })

    let attempts = 0, closeCount = 0
    let phase = 'failure'
    const state = { saveId: 'l05-synthetic', isLoading: false, saveGame: async () => {
        attempts++
        if (phase === 'failure') throw Error('Injected write failure')
        const slow = phase === 'slow'
        if (slow) await new Promise(resolve => setTimeout(resolve, 17000))
        assert(await qa.write('esports_l05_lifecycle', JSON.stringify({ phase, attempts })), 'Native disk write rejected')
        if (!slow) { phase = 'slow'; await report('autosaved', { attempts }) }
    } }
    const lifecycle = createSessionPersistence({ getState: () => state, getSettings: () => ({ autoSave: true, autoSaveInterval: 1 }),
        flush: async () => {}, confirm: async variant => {
            assert(variant === 'saveFailed' && attempts === 3, 'Close did not exhaust retries')
            phase = 'autosave'; return false
        }, showSaving: () => {}, onError: () => {} })
    qa.onClose(async () => {
        closeCount++
        assert(await qa.ack(), 'Close acknowledgement failed')
        if (await lifecycle.requestClose()) { lifecycle.dispose(); await qa.confirm() }
        else { assert(await qa.cancel(), 'Close cancellation rejected'); await report('cancelled', { attempts, closeCount }) }
    })
    await report('ready')
}
run().catch(error => report('error', { error: String(error) }))
window.addEventListener('unhandledrejection', event => report('error', { error: String(event.reason) }))
