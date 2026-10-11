import fs from 'node:fs'
import path from 'node:path'
import manifest from '@/public/audio/manifest.json'
import { SOUND_IDS } from '@/lib/audio-feedback'
import { SFX } from '@/scripts/audio/sfx'
import { MUSIC } from '@/scripts/audio/music'
import { audioInventoryRows } from '@/scripts/audio/render-audio-pack'

/** The shipped pack: manifest ↔ files ↔ SoundType ids stay in step. */
const ROOT = path.join(__dirname, '..', 'public', 'audio')
type Entry = { file: string; category: string; gain: number; duration: number; loopStart?: number; loopEnd?: number; alias?: string }
const sounds = manifest.sounds as Record<string, Entry>
const music = manifest.music as Record<string, Entry>

/** Duration of an Ogg Opus file from its last granule position and the OpusHead pre-skip. */
function oggOpusDuration(bytes: Buffer): number {
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('OggS')
    const head = bytes.indexOf('OpusHead', 0, 'latin1')
    expect(head).toBeGreaterThan(0)
    const preSkip = bytes.readUInt16LE(head + 10)
    const last = bytes.lastIndexOf('OggS', bytes.length - 1, 'latin1')
    const granule = Number(bytes.readBigUInt64LE(last + 6))
    return (granule - preSkip) / 48000
}

test('every SoundType has a manifest entry pointing at a shipped file', () => {
    for (const id of SOUND_IDS) {
        const entry = sounds[id]
        expect(entry).toBeDefined()
        expect(['ui', 'match', 'moment']).toContain(entry.category)
        expect(fs.existsSync(path.join(ROOT, entry.file))).toBe(true)
        expect(entry.duration).toBeGreaterThan(0)
        expect(entry.gain).toBeGreaterThan(0)
    }
})

test('the manifest has no ids the game cannot play and no dangling aliases', () => {
    const known = new Set<string>(SOUND_IDS)
    for (const [id, entry] of Object.entries(sounds)) {
        expect(known.has(id)).toBe(true)
        if (entry.alias) expect(sounds[entry.alias]?.file).toBe(entry.file)
    }
})

test('every shipped audio file is referenced by the manifest', () => {
    const referenced = new Set([...Object.values(sounds), ...Object.values(music)].map(e => e.file))
    for (const dir of ['sfx', 'music']) {
        for (const name of fs.readdirSync(path.join(ROOT, dir))) expect(referenced.has(`${dir}/${name}`)).toBe(true)
    }
    expect(fs.readdirSync(ROOT).sort()).toEqual(['manifest.json', 'music', 'sfx'])
})

test('four music scenes with loop points inside the file', () => {
    expect(Object.keys(music).sort()).toEqual(['career', 'celebration', 'match', 'menu'])
    for (const entry of Object.values(music)) {
        expect(entry.loopStart).toBeGreaterThan(0)
        expect(entry.loopEnd! - entry.loopStart!).toBeGreaterThanOrEqual(60)
        expect(entry.loopEnd! - entry.loopStart!).toBeLessThanOrEqual(120)
        expect(entry.loopEnd).toBeLessThan(entry.duration)
    }
})

test('encoded files are Ogg Opus with the duration the manifest claims', () => {
    if (manifest.format !== 'ogg-opus') return
    for (const entry of [...Object.values(sounds), ...Object.values(music)]) {
        const d = oggOpusDuration(fs.readFileSync(path.join(ROOT, entry.file)))
        expect(Math.abs(d - entry.duration)).toBeLessThan(0.002)
    }
})

test('the release inventory clears every audio file with its exact bytes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const provenance = require('../scripts/launch/content-provenance.cjs')
    const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/launch-readiness/evidence/L08-content-inventory.json'), 'utf8')).files
    const current = audioInventoryRows()
    expect(current.length).toBeGreaterThan(30)
    expect(provenance.verify(current, inventory)).toEqual([])
    expect(provenance.category('public/audio/sfx/click.ogg')[0]).toBe('sound')
    for (const row of inventory.filter((r: { path: string }) => r.path.startsWith('public/audio/'))) {
        expect(row).toMatchObject({ license: 'Project original', permission: 'Owner-original content generated in-repo', releaseDisposition: 'include', source: provenance.AUDIO_PACK_SOURCE })
    }
})

test('the pack is within its size budget and every rendered definition ships', () => {
    const files = new Set([...Object.values(sounds), ...Object.values(music)].map(e => e.file))
    const bytes = [...files].reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0)
    expect(bytes).toBeLessThan(12 * 1024 * 1024)
    for (const def of SFX) expect(sounds[def.id]?.file).toMatch(new RegExp(`^sfx/${def.id}\\.(ogg|wav)$`))
    for (const id of Object.keys(MUSIC)) expect(music[id]?.file).toMatch(new RegExp(`^music/${id}\\.(ogg|wav)$`))
})
