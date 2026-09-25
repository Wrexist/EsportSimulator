import {refreshStockIdentities} from '@/lib/identity-refresh'
import manifest from '@/data/identity-refresh.json'
import portraits from '@/data/player-portrait-identities.json'
import type {GameSave} from '@/engine/save-types'

test('stock identity refresh preserves IDs, stats, roster relationships and custom labels', () => {
  const save = {players:[{id:'player_5_phantom_donc', name:'phikos', nickname:'phikos', rifle:95},
    {id:'player_1_vitalis_axpex',name:'My custom name',nickname:'My custom handle',rifle:42}],
    teams:[{id:'team_5_phantom',name:'Ember Rift',shortName:'CUSTOM',budget:12345,rosterIds:['player_5_phantom_donc']}] } as unknown as GameSave
  refreshStockIdentities(save)
  expect(save.players[0]).toEqual({id:'player_5_phantom_donc',name:'dunk',nickname:'dunk',rifle:95,portraitPath:portraits.player_5_phantom_donc})
  expect(save.players[1].nickname).toBe('My custom handle')
  expect(save.teams[0]).toMatchObject({name:'Spiryt',shortName:'CUSTOM',budget:12345,rosterIds:['player_5_phantom_donc']})
  const first = structuredClone(save)
  refreshStockIdentities(save)
  expect(save).toEqual(first)
})
test('every stock identity has a unique readable display name', () => {
  for (const section of [manifest.players,manifest.teams]) {
    const names = Object.values(section).map(x=>x.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(names.every(n=>n.trim()===n && n.length>0)).toBe(true)
  }
})

test('unknown imported IDs including object property names are left intact', () => {
  const save = {players:[{id:'constructor',name:'Custom',nickname:'Custom'}],
    teams:[{id:'__proto__',name:'Custom club'}]} as unknown as GameSave
  const before = structuredClone(save)
  expect(() => refreshStockIdentities(save)).not.toThrow()
  expect(save).toEqual(before)
})
