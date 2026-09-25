import { LAB_RIFLE } from './encounter'

export interface PhysicalWeapon {
    id: string; category: 'lab' | 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun'
    damage: number; headMultiplier: number; range: number; falloffPer500: number; armorAbsorption: number
    magazine: number; reserve: number; shotTicks: number; burstSize: number; burstPauseTicks: number
    reloadTicks: number; recoilDegrees: number; spread: number; movementSpread: number; pellets: number; aimDrop: number
}
// Original provisional simulation tuning; not extracted game data. IDs match our existing shop.
const base: PhysicalWeapon = Object.freeze({ ...LAB_RIFLE, category: 'lab', spread: .12, movementSpread: 2.5, pellets: 1, aimDrop: 0 })
const families: Record<PhysicalWeapon['category'], PhysicalWeapon> = {
    lab: base,
    rifle: { ...base, category: 'rifle' },
    pistol: { ...base, category: 'pistol', damage: 25, magazine: 16, reserve: 48, shotTicks: 13, burstSize: 1, burstPauseTicks: 0, reloadTicks: 120, recoilDegrees: .3, spread: .2, movementSpread: 1.5, armorAbsorption: .45, falloffPer500: .9 },
    smg: { ...base, category: 'smg', damage: 23, shotTicks: 5, burstSize: 5, burstPauseTicks: 10, reserve: 90, recoilDegrees: .25, spread: .4, movementSpread: 1.2, armorAbsorption: .45, falloffPer500: .85 },
    sniper: { ...base, category: 'sniper', damage: 100, magazine: 5, reserve: 25, shotTicks: 85, burstSize: 1, burstPauseTicks: 0, reloadTicks: 200, recoilDegrees: 1, spread: .06, movementSpread: 6, armorAbsorption: .15, range: 6000, aimDrop: 16 },
    shotgun: { ...base, category: 'shotgun', damage: 18, magazine: 8, reserve: 24, shotTicks: 50, burstSize: 1, burstPauseTicks: 0, reloadTicks: 190, recoilDegrees: .9, spread: 2.2, movementSpread: 1.5, armorAbsorption: .35, falloffPer500: .65, pellets: 8, aimDrop: 16 },
}
const rows: [string, PhysicalWeapon['category'], Partial<PhysicalWeapon>?][] = [
    ['glock','pistol',{magazine:20}], ['usp','pistol',{damage:29,magazine:12}], ['p250','pistol',{damage:31,magazine:13}],
    ['deagle','pistol',{damage:52,magazine:7,shotTicks:24,recoilDegrees:1,armorAbsorption:.2}], ['dualies','pistol',{magazine:30,shotTicks:10}],
    ['tec9','pistol',{magazine:18,shotTicks:10}], ['fiveseven','pistol',{magazine:20,armorAbsorption:.25}],
    ['mac10','smg'], ['mp9','smg',{shotTicks:4}], ['mp7','smg',{damage:25}], ['ump45','smg',{damage:29,magazine:25,shotTicks:6}],
    ['ppbizon','smg',{magazine:64,damage:20}], ['p90','smg',{magazine:50,shotTicks:4}],
    ['ak47','rifle',{damage:35,recoilDegrees:.65,armorAbsorption:.25}], ['m4a4','rifle',{damage:32,recoilDegrees:.45}],
    ['m4a1s','rifle',{damage:33,magazine:20,recoilDegrees:.35}], ['galil','rifle',{damage:30,magazine:35}], ['famas','rifle',{damage:29,magazine:25}],
    ['aug','rifle',{spread:.08}], ['sg553','rifle',{spread:.08,shotTicks:8}],
    ['awp','sniper',{damage:120}], ['ssg08','sniper',{damage:72,magazine:10,shotTicks:70}],
    ['nova','shotgun'], ['xm1014','shotgun',{magazine:7,shotTicks:22,pellets:6}], ['mag7','shotgun',{magazine:5,damage:14}],
]
export const PHYSICAL_WEAPONS: Readonly<Record<string, PhysicalWeapon>> = Object.freeze(Object.fromEntries(rows.map(([id, category, changes]) => [id, Object.freeze({ ...families[category], ...changes, id })])))
export function physicalWeapon(id?: string): PhysicalWeapon {
    if (id === undefined) return base
    const key = id.toLowerCase().replace(/[^a-z0-9]/g, '')
    const weapon = Object.hasOwn(PHYSICAL_WEAPONS, key) ? PHYSICAL_WEAPONS[key] : undefined
    if (!weapon) throw Error(`Unsupported physical weapon: ${id}`)
    return weapon
}
