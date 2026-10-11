import { renderSfxFinal, pcmHash } from '@/scripts/audio/render-audio-pack'
import { renderSong, layoutLoop, type SongSpec } from '@/scripts/audio/music'
import { SR, peak, gainToDb, loudness } from '@/scripts/audio/dsp'
import { supersaw, kick, bass, hat } from '@/scripts/audio/instruments'

/** The pack is rendered from code; the same code must give the same bytes. */
test.each(['click', 'notification', 'victory'])('rendering %s is deterministic and within the peak ceiling', id => {
    const a = renderSfxFinal(id)
    const b = renderSfxFinal(id)
    expect(pcmHash(a)).toBe(pcmHash(b))
    expect(gainToDb(peak(a))).toBeLessThanOrEqual(-1.5)
    expect(loudness(a).maxMomentary).toBeGreaterThan(-45)
})

describe('looped music', () => {
    // A tiny two-bar song with long tails across the loop point (pad release, reverb, delay).
    const spec = (): SongSpec => ({
        id: 'test-loop', bpm: 120, bars: 2, targetLufs: -18, delayBeats: 0.75, reverb: { room: 0.85 },
        kicks: [0, 2, 4, 6],
        tracks: [
            { name: 'pad', inst: supersaw({ voices: 3, cutoff: 1500, a: 0.2, d: 0.5, s: 0.7, r: 1.5 }), notes: [{ t: 6, d: 2, m: 62, v: 0.7 }], gain: 0.4, reverb: 0.5, delay: 0.3, sidechain: 0.3 },
            { name: 'bass', inst: bass({ cutoff: 400 }), notes: [{ t: 0, d: 1.5, m: 38 }, { t: 4, d: 1.5, m: 43 }], gain: 0.5 },
            { name: 'kick', inst: kick(), notes: [0, 2, 4, 6].map(t => ({ t, d: 0.2, m: 36 })), gain: 0.7, drum: true },
            { name: 'hat', inst: hat(), notes: [1, 3, 5, 7].map(t => ({ t, d: 0.1, m: 60 })), gain: 0.3, drum: true, humanize: 3 },
        ],
    })

    test('renders deterministically', () => {
        expect(pcmHash(renderSong(spec()).loop)).toBe(pcmHash(renderSong(spec()).loop))
    })

    test('the file layout repeats exactly across the loop points (seamless loop)', () => {
        const song = renderSong(spec())
        expect(song.loopSamples).toBe(Math.round(2 * 4 * 0.5 * SR))
        const { audio, loopStart, loopEnd } = layoutLoop(song)
        const a = Math.round(loopStart * SR), b = Math.round(loopEnd * SR)
        let worst = 0
        for (let k = -a; k < audio.l.length - b; k++) worst = Math.max(worst, Math.abs(audio.l[a + k] - audio.l[b + k]), Math.abs(audio.r[a + k] - audio.r[b + k]))
        expect(worst).toBe(0)
        expect(gainToDb(peak(audio))).toBeLessThanOrEqual(-1.5)
        expect(loudness(song.loop).integrated).toBeCloseTo(-18, 0)
    })
})
