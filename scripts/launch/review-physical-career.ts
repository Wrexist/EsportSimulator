import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { parseProject, MARK_TOOLS } from '../../lib/map-annotations'
import { validateAnnotations } from '../../engine/spatial/annotations'
import { CollisionScene } from '../../engine/spatial/geometry'
import type { SpatialReference } from '../../engine/spatial/types'
import { emptyLabProject, parseLabProject } from '../../lib/spatial-lab-project'
import { TEAM_DEFAULTS, type TeamMember } from '../../engine/spatial/team-model'

const source = resolve(process.argv[2] || 'public/map-studio/drafts/mirage-user-v12-2026-09-13.json')
const bytes = readFileSync(source), sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')
const project = parseProject(bytes.toString('utf8'))
const ref = JSON.parse(readFileSync(`public/map-studio/spatial/${project.mapId}.json`, 'utf8')) as SpatialReference
const mesh = readFileSync(`public/map-studio/spatial/${project.mapId}.mesh`)
if (sha(mesh) !== ref.meshSha256) throw Error('Collision mesh checksum mismatch')
if (project.registration) {
    const r = project.registration
    if (sha(readFileSync(`public${r.sourceRadar}`)) !== r.sourceSha256 || sha(readFileSync(`public${ref.radars[project.floor]}`)) !== r.targetSha256) throw Error('Registered radar image changed')
}
const scene = CollisionScene.fromBinary(mesh.buffer.slice(mesh.byteOffset, mesh.byteOffset + mesh.byteLength) as ArrayBuffer)
const report = validateAnnotations(project, ref, scene)
const marks = project.marks.map((m, index) => ({ number: index + 1, id: m.id, kind: m.kind, label: m.label || `${MARK_TOOLS[m.kind].label} ${index + 1}`, status: m.status, heightBound: !!m.spatial }))
const output = 'docs/ui-review/physical-career'
mkdirSync(output, { recursive: true })
const write = (name: string, data: unknown) => writeFileSync(`${output}/${name}`, JSON.stringify(data, null, 2) + '\n')
write('map-review.json', { source, sourceSha256: sha(bytes), meshSha256: ref.meshSha256, careerEligible: false, marks, report })
const ct = report.zones.find(z => z.kind === 'ctspawn'), t = report.zones.find(z => z.kind === 'tspawn')
const a = report.zones.find(z => z.kind === 'bombsite' && project.marks.find(m => m.id === z.id)?.spatial?.site === 'A')
const b = report.zones.find(z => z.kind === 'bombsite' && project.marks.find(m => m.id === z.id)?.spatial?.site === 'B')
let fixture = false
if (ct?.spawnPositions?.length === 5 && t?.spawnPositions?.length === 5 && a?.point && b?.point) {
    const actors: TeamMember[] = (['T', 'CT'] as const).flatMap(side => (side === 'T' ? t : ct).spawnPositions!.map((start, index) => ({
        id: `${side}${index + 1}`, side, role: side === 'CT' ? 'anchor' : index === 0 ? 'entry' : index === 4 ? 'lurk' : 'support',
        start, station: side === 'CT' ? ((index % 2 ? b : a).clearPositions?.[Math.floor(index / 2)] || start) : start,
        yaw: side === 'T' ? 180 : 0, health: 100, armor: 100, ammo: 30,
    })))
    const lab = parseLabProject(JSON.stringify({ ...emptyLabProject(ref), annotations: project, teams: {
        ...TEAM_DEFAULTS, seed: 4326170, seconds: 60, roundSeconds: 45, bombSeconds: 12, guns: true,
        carrier: 'T2', sites: { A: a.point, B: b.point }, actors,
    } }), ref)
    write(`${project.mapId.toLowerCase()}-5v5-review.lab.json`, lab)
    fixture = true
}
const counts = Object.fromEntries([...new Set(report.issues.map(i => i.code))].map(code => [code, report.issues.filter(i => i.code === code).length]))
const lines = [
    `# ${project.mapId}: map review and your next actions`, '',
    `Source: \`${source}\`. SHA-256: \`${sha(bytes)}\`. Source drawing unchanged.`, '',
    `Automatic checks found **${report.receipt.errors} errors and ${report.receipt.warnings} warnings**. These are diagnostic findings, not a legal/content review.`, '',
    '## Do this next', '',
    '1. Open Map Studio and open the source project above (or export your newer draft and supply that file). Save a new copy before editing.',
    '2. Open Map validation. Compare the reference overlay at both sites, both spawns and mid. Correct alignment before changing heights.',
    '3. Select each unbound red wall from the issue list. Bind its actual floor and vertical span; do not mark everything as a full-height wall. Never auto-approve an uncertain height.',
    '4. Select each green/blue opening. Name it and describe walking/crouching/jumping and whether standing or crouched players can shoot through it. Bind its floor/height. Mark low cover separately from a window.',
    '5. Check CT/T spawn boundaries and A/B plant boundaries. Map validation now reports how many separated player positions it found (target 5/5 for each spawn). Exclude crates and adjacent non-plant ground.',
    '6. Inspect underpass, stairs and ladder connections in Spatial Lab. Author directed connections where required; drawing a green line does not cut a hole in collision geometry.',
    '7. Re-run validation, mark only genuinely reviewed geometry Checked, then Save project and send the exported JSON. Do not move on to every other map yet.', '',
    '## Checks by zone', '',
    ...report.zones.map(z => `- ${z.label}: ${z.safe}/${z.samples} clear samples; ${z.spawnPositions ? `${z.spawnPositions.length}/5 separated spawn positions; ` : ''}${z.ambiguous} ambiguous floor samples.`), '',
    '## Mark-specific findings', '',
    ...report.issues.map(issue => {
        const mark = marks.find(m => m.id === issue.markId)
        return `- **${issue.severity} / ${issue.code}**${mark ? ` — ${mark.label} (mark ${mark.number}, ID \`${mark.id}\`)` : ''}: ${issue.message}`
    }), '',
    '## Work handled in development', '',
    '- Bind physical events to career player IDs, round results, scoreboard and replay; preserve old-save compatibility.',
    '- Model purchased loadouts, player attributes, objective polygons and traversal before enabling the physical engine in careers.',
    '- Finish worker ownership, exactly-once payouts, real-browser resume-to-results checks and packaged Windows/Steam testing.',
    fixture ? '- A separate 5v5 lab review file was generated from clear spawn samples. It uses provisional lab rules and unreviewed drawings; it is not a validated career match.' : '- A 5v5 fixture was not generated because required separated spawn positions or site points are missing.',
]
writeFileSync(`${output}/YOUR-NEXT-STEPS.md`, lines.join('\n') + '\n')
if (sha(readFileSync(source)) !== sha(bytes)) throw Error('Source changed during the review')
console.log(JSON.stringify({ errors: report.receipt.errors, warnings: report.receipt.warnings, counts, wallsUsed: report.wallsUsed, zones: report.zones.map(z => ({ label: z.label, spawnPositions: z.spawnPositions?.length, safe: z.safe })), fixture, output }, null, 2))
