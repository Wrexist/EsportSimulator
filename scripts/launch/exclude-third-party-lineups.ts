// Owner decision (2026-10-04): imported CS2Nades lineups are excluded from the 1.0
// base game; owner-authored marks and radar outlines keep shipping. Nothing is
// deleted: the removed library records and the verbatim original draft bytes are
// archived under raw-data/ (not in electron-builder `files`, not imported by app
// code). One-shot and fail-closed: refuses to overwrite an existing archive.
//
//   npx tsx scripts/launch/exclude-third-party-lineups.ts
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { annotationSignature } from '../../engine/spatial/registration'
import type { MapAnnotationProject, MapMark } from '../../lib/map-annotations'

const root = join(__dirname, '../..')
const DATE = '2026-10-04'
const PROVIDER = 'CS2Nades'
const NEW_VERSION = `${DATE}.1`
const LIBRARY = 'data/map-studio-library.json'
const ARCHIVE_DIR = 'raw-data/archived-lineups'
const LIBRARY_ARCHIVE = `${ARCHIVE_DIR}/cs2nades-${DATE}.json`
const DRAFT_ARCHIVE = `${ARCHIVE_DIR}/drafts-${DATE}`
const REASON = 'Owner decision: imported third-party (CS2Nades) lineups are excluded from the 1.0 base game; no upstream redistribution permission exists. Owner-authored content keeps shipping.'

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const read = (rel: string) => readFileSync(join(root, rel))
const write = (rel: string, text: string | Buffer) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text) }
const imported = (mark: MapMark) => mark.source?.provider === PROVIDER

if (existsSync(join(root, LIBRARY_ARCHIVE)) || existsSync(join(root, DRAFT_ARCHIVE))) throw new Error(`Archive already exists under ${ARCHIVE_DIR}; this exclusion has been applied.`)

// 1. Library: archive every imported lineup and unplaced record; keep outlines.
type Floor = { outlines: MapMark[]; lineups: MapMark[]; unplaced: { id: string; url: string }[] }
const libraryBytes = read(LIBRARY)
const library = JSON.parse(libraryBytes.toString()) as { version: string; provider: string; sourceUrl?: string; maps: Record<string, Record<string, Floor>> }
const archived: Record<string, Record<string, { lineups: MapMark[]; unplaced: Floor['unplaced'] }>> = {}
let lineupCount = 0, unplacedCount = 0
for (const [mapId, floors] of Object.entries(library.maps)) for (const [floor, layer] of Object.entries(floors)) {
    if (layer.outlines.some(imported)) throw new Error(`Unexpected imported outline on ${mapId}/${floor}`)
    if (layer.lineups.some(mark => !imported(mark))) throw new Error(`Non-${PROVIDER} lineup on ${mapId}/${floor}; review before excluding`)
    if (layer.lineups.length || layer.unplaced.length) (archived[mapId] ??= {})[floor] = { lineups: layer.lineups, unplaced: layer.unplaced }
    lineupCount += layer.lineups.length; unplacedCount += layer.unplaced.length
    layer.lineups = []; layer.unplaced = []
}
write(LIBRARY_ARCHIVE, JSON.stringify({
    archivedAt: DATE, reason: REASON, releaseDisposition: 'excluded-from-1.0-base-game',
    provider: library.provider, sourceUrl: library.sourceUrl,
    fromLibrary: { path: LIBRARY, version: library.version, sha256: sha(libraryBytes), bytes: libraryBytes.length },
    counts: { lineups: lineupCount, unplaced: unplacedCount }, maps: archived,
}, null, 2) + '\n')
const shipped = { version: NEW_VERSION, provider: 'radar-outline', maps: library.maps }
write(LIBRARY, JSON.stringify(shipped))

// 2. Shipped drafts: archive original bytes verbatim, ship the copy without imported lineups.
const draftFiles = [
    ...readdirSync(join(root, 'public/map-studio/drafts')).filter(n => n.endsWith('.json')).map(n => `public/map-studio/drafts/${n}`),
    ...readdirSync(join(root, 'public/map-studio/teams/map-pool')).filter(n => n.endsWith('.json')).map(n => `public/map-studio/teams/map-pool/${n}`),
]
const drafts = []
for (const rel of draftFiles) {
    const bytes = read(rel), text = bytes.toString(), doc = JSON.parse(text)
    const project: MapAnnotationProject | undefined = doc.format === 'esim-map-annotations' ? doc : doc.annotations
    if (!project?.marks?.some(imported)) continue
    const removed = project.marks.filter(imported)
    // Receipts only cache UI validation. Utility marks never feed validation, so a
    // receipt that was current stays current; re-sign it. Stale receipts stay stale.
    const receiptWasCurrent = !!project.validation && project.validation.signature === annotationSignature(project)
    project.marks = project.marks.filter(mark => !imported(mark))
    if (project.libraryVersion === library.version) project.libraryVersion = NEW_VERSION
    if (receiptWasCurrent) project.validation = { ...project.validation!, signature: annotationSignature(project) }
    const archivePath = `${DRAFT_ARCHIVE}/${relative('public/map-studio', rel).replace(/\\/g, '/')}`
    write(archivePath, bytes)
    write(rel, JSON.stringify(doc, null, 2) + (text.endsWith('\n') ? '\n' : ''))
    const next = read(rel)
    drafts.push({ path: rel, archivedOriginal: archivePath, originalSha256: sha(bytes), sha256: sha(next), bytes: next.length,
        removedLineups: removed.length, remainingMarks: project.marks.length, validationReceipt: project.validation ? (receiptWasCurrent ? 're-signed' : 'stale, unchanged') : 'none' })
}
write(`${ARCHIVE_DIR}/README.json`, JSON.stringify({
    purpose: 'Non-shipped archive. Not matched by package.json build.files and not imported by app code.',
    reason: REASON, libraryArchive: LIBRARY_ARCHIVE, draftArchive: DRAFT_ARCHIVE,
    library: { path: LIBRARY, previousVersion: library.version, version: NEW_VERSION, sha256: sha(read(LIBRARY)), excludedLineups: lineupCount, excludedUnplaced: unplacedCount },
    drafts,
}, null, 2) + '\n')
console.log(JSON.stringify({ lineups: lineupCount, unplaced: unplacedCount, drafts: drafts.length, draftLineups: drafts.reduce((n, d) => n + d.removedLineups, 0) }))
