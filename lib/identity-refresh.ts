import manifest from '@/data/identity-refresh.json'
import type { GameSave } from '@/engine/save-types'
import { stockPlayerPortrait } from '@/lib/player-portrait-source'

type Identity = { before: string[]; name: string; shortName?: string; previousTag?: string }
const playerNames = new Map<string, Identity>(Object.entries(manifest.players))
const teamNames = new Map<string, Identity>(Object.entries(manifest.teams))

/** Update known stock names on a hydrated copy; retain custom/mod names and all simulation state. */
export function refreshStockIdentities(save: Pick<GameSave, 'players' | 'teams'>): void {
  for (const player of save.players) {
    const portrait = stockPlayerPortrait(player.portraitPath, player.id)
    if (portrait && portrait !== player.portraitPath) player.portraitPath = portrait
    const identity = playerNames.get(player.id)
    if (!identity || !identity.before.includes(player.nickname)) continue
    if (identity.before.includes(player.name)) player.name = identity.name
    player.nickname = identity.name
  }
  for (const team of save.teams) {
    const identity = teamNames.get(team.id)
    if (!identity || !identity.before.includes(team.name)) continue
    team.name = identity.name
    if (team.shortName === identity.previousTag) team.shortName = identity.shortName
  }
}
