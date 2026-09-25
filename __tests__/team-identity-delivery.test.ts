import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TEAM_IDENTITY_CATALOG, findTeamIdentity, teamLogoSources } from '@/lib/team-identity'
import { TeamLogoDisplay } from '@/components/ui/TeamLogoDisplay'
import { TeamLogo, TeamLogoImage } from '@/components/ui/asset-images'
import { CURATED_TEAM_MOTIFS, emblemMotifFor, emblemOutlineColor } from '@/lib/team-emblem-design'
import { TeamEmblem } from '@/components/ui/TeamEmblem'
import { defaultBrandingFor } from '@/lib/branding/fallback'

const club = TEAM_IDENTITY_CATALOG[0]
describe('one identity path across team surfaces', () => {
    it('maps all launch teams exactly, without importing raw original identities', () => {
        const snapshot = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/snapshot/teams.json'), 'utf8'))
        expect(TEAM_IDENTITY_CATALOG).toHaveLength(198)
        expect(new Set(TEAM_IDENTITY_CATALOG.map(t => t.id)).size).toBe(198)
        for (const team of snapshot) {
            expect(findTeamIdentity(team.name, team.id)).toEqual(expect.objectContaining({ name: team.name, shortName: team.shortName, logoPath: team.logoPath, branding: team.branding }))
            expect(findTeamIdentity(team.name.toUpperCase())?.id).toBe(team.id)
        }
    })
    it('resolves legacy wrappers through the canonical vector instead of guessing a display-name path', () => {
        for (const element of [React.createElement(TeamLogo, { teamName: club.name }), React.createElement(TeamLogoImage, { alt: club.name, src: club.logoPath })]) {
            const html = renderToStaticMarkup(element)
            expect(html).toContain(`${club.name} logo`)
            expect(html).toContain('<svg')
            expect(html).not.toContain('logo.webp')
            expect(html).not.toContain('<text')
        }
    })
    it('preserves explicit SVG, raster and uploaded replacements even when the team has branding', () => {
        for (const source of ['/mods/club.svg', '/mods/club.png', '/mods/club.webp?version=2']) {
            const team = { ...club, logoPath: source }
            expect(teamLogoSources(team)).toEqual([source])
            expect(renderToStaticMarkup(React.createElement(TeamLogoDisplay, { team }))).toContain(source.replace('&', '&amp;'))
        }
        expect(teamLogoSources({ ...club, customTeamData: { logoData: 'data:image/png;base64,TEST' }, logoPath: '/mods/fallback.svg' })).toEqual(['data:image/png;base64,TEST', '/mods/fallback.svg'])
    })
    it('never falls back to a preserved original reference and leaves missing-source cases finite', () => {
        expect(teamLogoSources({ ...club, logoPath: '/assets/teams/vitality/logo.original.webp' })).toEqual([])
        expect(teamLogoSources({ ...club, logoPath: '/assets/teams/vitality/logo.png' })).toEqual([])
        expect(teamLogoSources({ ...club, logoPath: '/assets/teams/masonic/logo.png.webp' })).toEqual([])
        expect(teamLogoSources({ ...club, logoPath: undefined })).toEqual([])
        expect(teamLogoSources(club)).toEqual([])
        expect(teamLogoSources({ ...club, id: 'community-club', logoPath: '/mods/own.svg' })).toEqual(['/mods/own.svg'])
    })
    it('binds twelve new studies to permanent club IDs across renames', () => {
        expect(Object.keys(CURATED_TEAM_MOTIFS)).toHaveLength(12)
        expect(new Set(Object.values(CURATED_TEAM_MOTIFS)).size).toBe(12)
        for (const [id, motif] of Object.entries(CURATED_TEAM_MOTIFS)) {
            expect(emblemMotifFor(id, 'Renamed club')).toBe(motif)
            expect(TEAM_IDENTITY_CATALOG.some(t => t.id === id)).toBe(true)
        }
    })
    it('isolates gradients across a full roster render and uses a keyline for very dark brands', () => {
        const html = renderToStaticMarkup(React.createElement('div', null, ...TEAM_IDENTITY_CATALOG.map(t => React.createElement(TeamEmblem, { key: t.id, name: t.name, seed: t.id, branding: t.branding || defaultBrandingFor(t.id), size: 24 }))))
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
        expect(ids).toHaveLength(198)
        expect(new Set(ids).size).toBe(198)
        for (const [, reference] of html.matchAll(/url\(#([^)]*)\)/g)) expect(ids).toContain(reference)
        expect(emblemOutlineColor('#000')).toBe('#94a3b8')
        expect(emblemOutlineColor('#FFEE00')).toBe('#0a1420')
    })
})
