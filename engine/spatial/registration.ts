import type { MapAnnotationProject, MapPoint } from '@/lib/map-annotations'
import { fromRadar, type SpatialReference, type Vec3 } from './types'

/** Percent-of-radar affine mapping: x'=a*x+b*y+c; y'=d*x+e*y+f. */
export interface MapRegistration {
    version: 1
    sourceRadar: string
    sourceSha256: string
    targetSha256: string
    sourceVersion: string
    meshSha256: string
    matrix: [number, number, number, number, number, number]
    method: 'image-features' | 'manual'
    confidence: 'provisional' | 'reviewed'
    evidence: string
}
export interface MarkSpatialBinding { floorId: string; zMin: number; zMax: number; site?: 'A' | 'B' }
export interface AnnotationValidationReceipt { version: 1; signature: string; errors: number; warnings: number; state: 'blocked' | 'review-ready' }

export function parseRegistration(value: unknown): MapRegistration {
    const r = value as MapRegistration
    if (!r || r.version !== 1 || !Array.isArray(r.matrix) || r.matrix.length !== 6 || r.matrix.some(n => !Number.isFinite(n) || Math.abs(n) > 1000) || Math.abs(r.matrix[0] * r.matrix[4] - r.matrix[1] * r.matrix[3]) < 0.00001) throw Error('Invalid or collapsed radar registration')
    if (typeof r.sourceRadar !== 'string' || !/^\/maps\/[a-zA-Z0-9_-]+\.png$/.test(r.sourceRadar) || ![r.sourceSha256, r.targetSha256, r.meshSha256].every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)) || typeof r.sourceVersion !== 'string' || r.sourceVersion.length > 80 || !['image-features', 'manual'].includes(r.method) || !['provisional', 'reviewed'].includes(r.confidence) || typeof r.evidence !== 'string' || r.evidence.length > 1000) throw Error('Invalid registration provenance')
    return { version: 1, sourceRadar: r.sourceRadar, sourceSha256: r.sourceSha256, targetSha256: r.targetSha256, sourceVersion: r.sourceVersion, meshSha256: r.meshSha256, matrix: [...r.matrix], method: r.method, confidence: r.confidence, evidence: r.evidence }
}
export function parseSpatialBinding(value: unknown): MarkSpatialBinding {
    const s = value as MarkSpatialBinding
    if (!s || typeof s.floorId !== 'string' || !s.floorId.trim() || s.floorId.length > 80 || !Number.isFinite(s.zMin) || !Number.isFinite(s.zMax) || s.zMin >= s.zMax || s.zMin < -20000 || s.zMax > 20000 || (s.site !== undefined && !['A', 'B'].includes(s.site))) throw Error('Invalid marking floor / height range')
    return { floorId: s.floorId, zMin: s.zMin, zMax: s.zMax, ...(s.site ? { site: s.site } : {}) }
}
export const registeredRadar = (p: MapPoint, r: MapRegistration): MapPoint => ({ x: r.matrix[0] * p.x + r.matrix[1] * p.y + r.matrix[2], y: r.matrix[3] * p.x + r.matrix[4] * p.y + r.matrix[5] })
export function registeredWorld(p: MapPoint, r: MapRegistration, ref: SpatialReference): Vec3 { const xy = registeredRadar(p, r); return fromRadar(xy.x, xy.y, ref) }
export const registrationMatches = (p: MapAnnotationProject, ref: SpatialReference) => !!p.registration && p.mapId === ref.mapId && !!ref.radars[p.floor] && p.registration.sourceVersion === ref.sourceVersion && p.registration.meshSha256 === ref.meshSha256

/** Change identity for cached UI receipts only; never grants release approval. */
export function annotationSignature(p: MapAnnotationProject): string {
    const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, ordered(child)])) : value
    // Invalidate cached receipts when validation gains stricter checks (five-body spawns).
    const text = JSON.stringify(ordered({ validationModel: 2, mapId: p.mapId, floor: p.floor, registration: p.registration, marks: p.marks }))
    let a = 2166136261, b = 5381
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i) }
    return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`
}
