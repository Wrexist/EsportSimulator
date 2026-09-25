/** Local review artifacts, never release clearance. Does not edit source images or saves. */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { TeamEmblem } from '../../components/ui/TeamEmblem'
import { TEAM_IDENTITY_CATALOG, TEAM_IDENTITY_VERSION, teamLogoSources } from '../../lib/team-identity'
import { defaultBrandingFor } from '../../lib/branding/fallback'
import { CURATED_TEAM_MOTIFS, emblemMotifFor } from '../../lib/team-emblem-design'

const root = process.cwd()
const output = path.join(root, 'docs/launch-readiness/evidence/L25-assets')
const digest = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex')
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

async function main() {
    fs.mkdirSync(path.join(output, 'crests'), { recursive: true })
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'public/data/snapshot/teams.json'), 'utf8'))
    if (snapshot.length !== TEAM_IDENTITY_CATALOG.length || snapshot.some((t: any, i: number) => ['id', 'name', 'shortName', 'logoPath'].some(key => t[key] !== (TEAM_IDENTITY_CATALOG[i] as any)[key]) || JSON.stringify(t.branding) !== JSON.stringify(TEAM_IDENTITY_CATALOG[i].branding))) throw Error('Identity catalog has drifted from the launch snapshot')
    const entries: any[] = []
    const tiles: Buffer[] = []
    const implementationSources = ['components/ui/TeamEmblem.tsx', 'lib/team-emblem-design.ts', 'lib/team-identity.ts', 'data/team-identity-catalog.json'].map(file => ({ path: file, sha256: digest(fs.readFileSync(path.join(root, file))) }))
    for (const team of TEAM_IDENTITY_CATALOG) {
        const source = teamLogoSources(team)[0]
        const kind = source ? 'retained-svg-study' : CURATED_TEAM_MOTIFS[team.id] ? 'new-vector-study' : 'shared-vector-family'
        const svg = source ? fs.readFileSync(path.join(root, 'public', source), 'utf8') : renderToStaticMarkup(<TeamEmblem name={team.name} seed={team.id} branding={team.branding || defaultBrandingFor(team.id)} size={256} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
        if (/<script|<foreignObject|<text\b|href\s*=/i.test(svg)) throw Error(`Unexpected embedded content in ${team.id}`)
        const stem = `crests/${team.id}`
        const raw = await sharp(Buffer.from(svg)).resize(256, 256).ensureAlpha().raw().toBuffer()
        const border: number[] = []
        for (let i = 0; i < 256; i++) border.push(raw[i * 4 + 3], raw[(255 * 256 + i) * 4 + 3], raw[(i * 256) * 4 + 3], raw[(i * 256 + 255) * 4 + 3])
        const transparent = raw.filter((_v: number, i: number) => i % 4 === 3 && raw[i] === 0).length
        const png = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()
        const webp = await sharp(Buffer.from(svg)).resize(256, 256).webp({ lossless: true }).toBuffer()
        fs.writeFileSync(path.join(output, `${stem}.svg`), svg)
        fs.writeFileSync(path.join(output, `${stem}.png`), png)
        fs.writeFileSync(path.join(output, `${stem}.webp`), webp)
        const motif = emblemMotifFor(team.id, team.name)
        entries.push({ id: team.id, name: team.name, shortName: team.shortName, version: TEAM_IDENTITY_VERSION, kind, motif: source ? null : motif,
            source: source ? `public${source}` : 'components/ui/TeamEmblem.tsx + lib/team-emblem-design.ts',
            originalSnapshotPath: team.logoPath, sourceSha256: source ? digest(svg) : digest(JSON.stringify(implementationSources)),
            sourceFiles: source ? [{ path: `public${source}`, sha256: digest(svg) }] : implementationSources,
            approval: 'PENDING_VISUAL_REVIEW', rights: 'HOLD_L08', releaseDisposition: 'development-review-only',
            files: [{ path: `${stem}.svg`, bytes: Buffer.byteLength(svg), sha256: digest(svg) }, { path: `${stem}.png`, bytes: png.length, sha256: digest(png) }, { path: `${stem}.webp`, bytes: webp.length, sha256: digest(webp) }],
            pixelSha256: digest(raw), transparentPixels: transparent, outerBorderMaxAlpha: Math.max(...border),
            familyKey: source || `${motif}:${team.branding?.primaryColor || defaultBrandingFor(team.id).primaryColor}` })
        const dark = await sharp(png).resize(88).toBuffer()
        const light = await sharp(png).resize(48).toBuffer()
        const label = Buffer.from(`<svg width="224" height="164"><rect width="224" height="164" fill="#14202e"/><rect x="134" y="22" width="72" height="72" rx="8" fill="#eef2f5"/><text x="12" y="125" fill="#f1f5f9" font-family="Arial" font-size="13">${escape(team.name)}</text><text x="12" y="146" fill="#9fbdcc" font-family="Arial" font-size="10">${escape(kind)}</text></svg>`)
        tiles.push(await sharp(label).composite([{ input: dark, top: 12, left: 14 }, { input: light, top: 34, left: 146 }]).png().toBuffer())
    }
    const groups = new Map<string, string[]>()
    entries.forEach(e => groups.set(e.pixelSha256, [...(groups.get(e.pixelSha256) || []), e.id]))
    const duplicates = [...groups.values()].filter(group => group.length > 1)
    entries.forEach(e => { e.duplicateIds = groups.get(e.pixelSha256)!.filter(id => id !== e.id) })
    const manifest = { version: TEAM_IDENTITY_VERSION, purpose: 'Review candidates; not an approved release package', teamCount: entries.length, counts: { retainedStudies: entries.filter(e => e.kind === 'retained-svg-study').length, newStudies: entries.filter(e => e.kind === 'new-vector-study').length, familyFallbacks: entries.filter(e => e.kind === 'shared-vector-family').length, duplicatePixelGroups: duplicates.length, borderTouching: entries.filter(e => e.outerBorderMaxAlpha > 0).length }, sourceSnapshotSha256: digest(fs.readFileSync(path.join(root, 'public/data/snapshot/teams.json'))), entries, duplicates }
    fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
    for (let offset = 0; offset < tiles.length; offset += 30) {
        const chunk = tiles.slice(offset, offset + 30)
        await sharp({ create: { width: 1120, height: Math.ceil(chunk.length / 5) * 164, channels: 4, background: '#0b121c' } }).composite(chunk.map((input, i) => ({ input, left: i % 5 * 224, top: Math.floor(i / 5) * 164 }))).png().toFile(path.join(output, `sheet-${offset / 30 + 1}.png`))
    }
    const cards = entries.map(e => `<article data-search="${escape(`${e.name} ${e.id} ${e.kind}`.toLowerCase())}" data-duplicate="${e.duplicateIds.length > 0}"><h2>${escape(e.name)}</h2><div class="sizes">${[24, 48, 96].map(size => `<img src="${e.files[0].path}" width="${size}" height="${size}" alt="${escape(e.name)} at ${size}px">`).join('')}</div><div class="light"><img src="${e.files[2].path}" width="48" height="48" alt="WebP on light background"></div><p>${e.kind} · ${e.motif || 'SVG'}</p><small>${e.duplicateIds.length ? 'Shares exact pixels with ' + e.duplicateIds.length + ' other teams' : 'No identical pixels found'}</small><p>${e.files.map((f: any) => `<a href="${f.path}" download>${f.path.split('.').at(-1).toUpperCase()}</a>`).join(' · ')}</p><details><summary>Source and review</summary><p>${escape(e.source)}</p><p>${escape(e.id)}</p><p>${e.approval} / ${e.rights}</p></details></article>`).join('')
    fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Team identity review · L25</title><style>body{margin:0;background:#0b121c;color:#eaf0f6;font:14px system-ui;padding:28px}header{max-width:900px}h1{font-size:28px}input,button,select{font:inherit;padding:10px;border:1px solid #526273;border-radius:6px}input{width:320px;max-width:80%}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px;margin-top:24px}article{background:#14202e;padding:18px;border:1px solid #344355;border-radius:12px}h2{font-size:18px}.sizes{display:flex;gap:20px;align-items:center;height:108px}.light{float:right;background:#eef2f5;padding:8px;border-radius:8px}small{color:#cbd5e1}a{color:#8ce5d4}details{overflow-wrap:anywhere}article[hidden]{display:none}</style><header><h1>Team identity review</h1><p>198 teams · ${TEAM_IDENTITY_VERSION}. Three retained studies, 12 new vector studies, 183 shared-family fallbacks. These are candidates, not 198 distinct approved identities.</p><p>Review 24 / 48 / 96px silhouettes and the lossless WebP on light backgrounds. All visual approval and L08 clearance remain pending.</p><label>Search teams <input id="search" type="search" placeholder="Name, ID or study type"></label> <label><input id="duplicates" type="checkbox" style="width:auto">Show identical-pixel groups only</label><p id="count" role="status">198 teams</p><a href="manifest.json">Versioned source / file / hash manifest</a></header><main class="grid">${cards}</main><script>const search=document.getElementById('search'),duplicates=document.getElementById('duplicates');function filter(){let n=0;document.querySelectorAll('article').forEach(card=>{card.hidden=!card.dataset.search.includes(search.value.toLowerCase())||(duplicates.checked&&card.dataset.duplicate!=='true');if(!card.hidden)n++});document.getElementById('count').textContent=n+' teams'}search.addEventListener('input',filter);duplicates.addEventListener('change',filter)</script></html>`)
    console.log(JSON.stringify({ output, ...manifest.counts, teams: entries.length }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
