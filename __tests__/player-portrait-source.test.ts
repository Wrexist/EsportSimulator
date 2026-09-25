import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import fs from "node:fs"
import path from "node:path"
import { playerPortraitSource } from "@/lib/player-portrait-source"
import aliases from "@/data/portrait-asset-aliases.json"
import identities from "@/data/player-portrait-identities.json"
import reviewed from "@/data/player-portrait-reviewed.json"
import { refreshStockIdentities } from "@/lib/identity-refresh"
import { PORTRAIT_POOL, pickPooledPortrait } from "@/lib/safe-branding/portrait-pool"
import { PlayerPortrait } from "@/components/ui/asset-images"
import stockTeams from '@/public/data/snapshot/teams.json'
import stockPlayers from '@/public/data/snapshot/players.json'

const id = "fpl_nonpro_1_97989_4293"
describe("consistent generated-player portraits", () => {
    it('uses reviewed portraits over previous tight crops and preserves them after a transfer', () => {
        for (const portrait of reviewed) {
            expect((identities as Record<string,string>)[portrait.id]).toBe(portrait.destination)
            expect(playerPortraitSource(portrait.source, portrait.id)).toBe(portrait.destination)
            const player = {id:portrait.id, name:'Kept', nickname:'Kept', teamId:'new-club', skill:87, portraitPath:PORTRAIT_POOL[0]}
            refreshStockIdentities({players:[player],teams:[]} as unknown as Parameters<typeof refreshStockIdentities>[0])
            expect(player.portraitPath).toBe(portrait.destination)
            expect(player.teamId).toBe('new-club')
            expect(player.skill).toBe(87)
        }
    })
    it('covers every roster member of the top 25 clubs with a distinct authored face', () => {
        const topIds = stockTeams.slice().sort((a, b) => b.reputation - a.reputation).slice(0, 25).flatMap(t => t.rosterIds)
        expect(Object.keys(identities).sort()).toEqual([...new Set([...topIds, ...reviewed.map(p => p.id)])].sort())
        const historicalAliases = new Map(reviewed.filter(p => 'canonicalPortraitId' in p).map(p => [p.id, (p as typeof p & {canonicalPortraitId:string}).canonicalPortraitId]))
        const canonicalIds = Object.keys(identities).filter(id => !historicalAliases.has(id))
        expect(new Set(canonicalIds.map(id => (identities as Record<string,string>)[id])).size).toBe(canonicalIds.length)
        for (const [id, canonicalId] of historicalAliases) {
            expect((identities as Record<string,string>)[id]).toBe((identities as Record<string,string>)[canonicalId])
        }
        for (const player of stockPlayers.filter(p => topIds.includes(p.id))) {
            expect(player.portraitPath).toBe((identities as Record<string,string>)[player.id])
        }
    })
    it('restores each top-team authored face even when an old save holds a different stock face', () => {
        for (const [playerId, portrait] of Object.entries(identities)) {
            expect(playerPortraitSource(PORTRAIT_POOL[0], playerId)).toBe(portrait)
            expect(playerPortraitSource(undefined, playerId)).toBe(portrait)
            expect(fs.statSync(path.join(process.cwd(), 'public', portrait)).size).toBeGreaterThan(1000)
        }
    })
    it('keeps custom and community portraits explicit for the same stock ID', () => {
        const playerId = Object.keys(identities)[0]
        for (const source of ['/community-mod-assets/face.png', '/custom/face.png', 'data:image/png;base64,abc']) {
            expect(playerPortraitSource(source, playerId)).toBe(source)
        }
    })
    it('refreshes an already-renamed saved player without changing their career data', () => {
        const playerId = 'player_5_phantom_donc'
        const player = {id: playerId, name: 'dunk', nickname: 'dunk', portraitPath: PORTRAIT_POOL[0], skill: 97, teamId: 'transferred-club'}
        const save = {players: [player], teams: []} as unknown as Parameters<typeof refreshStockIdentities>[0]
        const before = {...player}
        refreshStockIdentities(save)
        expect(player).toEqual({...before, portraitPath:identities[playerId]})
        expect(playerPortraitSource(player.portraitPath, playerId, identities[playerId])).toBe(pickPooledPortrait(playerId))
    })
    it('maps saved legacy portraits to the same retained face and archives other stock photos', () => {
        for (const [source, destination] of Object.entries(aliases)) {
            expect(playerPortraitSource(source, id)).toBe(destination)
            expect(fs.readFileSync(path.join(process.cwd(), 'public', source)).equals(fs.readFileSync(path.join(process.cwd(), 'public', destination)))).toBe(true)
        }
        expect(playerPortraitSource('/assets/teams/old/players/old-photo.webp', id)).toBe(pickPooledPortrait(id))
        expect(playerPortraitSource('/community-mod-assets/example/face.png', id)).toBe('/community-mod-assets/example/face.png')
    })
    it.each([undefined, null, "", "/player_placeholder.webp", "/assets/legends/example.svg"])("uses the same baked face for absent/legacy source %s", src => {
        expect(playerPortraitSource(src, id)).toBe(pickPooledPortrait(id))
    })
    it("preserves an authored portrait and recovers a different source after an earlier failure", () => {
        const authored = "/assets/players/portrait.png"
        expect(playerPortraitSource(authored, id)).toBe(authored)
        expect(playerPortraitSource(authored, id, authored)).toBe(pickPooledPortrait(id))
        expect(playerPortraitSource("/new.png", id, authored)).toBe("/new.png")
    })
    it("renders one identity at career-preview, list, signing and profile sizes without a canvas or silhouette", () => {
        for (const size of [32, 40, 96, 112]) {
            const html = renderToStaticMarkup(React.createElement(PlayerPortrait, { src: "/player_placeholder.webp", seed: id, alt: "zForce", size }))
            expect(html).toContain(pickPooledPortrait(id))
            expect(html).not.toContain("<canvas")
            expect(html).not.toContain("portrait-realist-fallback")
        }
    })
    it('renders a corrected top-team identity consistently at each UI size', () => {
        const playerId = 'player_5_phantom_donc'
        for (const size of [32, 40, 96, 112]) {
            const html = renderToStaticMarkup(React.createElement(PlayerPortrait, {src: PORTRAIT_POOL[0], seed: playerId, alt:'dunk', size}))
            expect(html).toContain(identities[playerId])
        }
    })
    it("ships every possible fallback portrait as a real nonempty asset", () => {
        expect(PORTRAIT_POOL.length).toBeGreaterThan(20)
        for (const src of PORTRAIT_POOL) {
            const asset = path.join(process.cwd(), "public", src)
            expect(fs.statSync(asset).size).toBeGreaterThan(1000)
        }
    })
})
