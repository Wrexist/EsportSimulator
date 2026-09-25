import {readFileSync} from 'node:fs'
import {parseProject} from '@/lib/map-annotations'
const load=(name:string)=>parseProject(readFileSync(`public/map-studio/drafts/${name}.json`,'utf8'))
describe('Mirage installed-map draft',()=>{
 const before=load('mirage-v13-repaired'),after=load('mirage-v13-native-sites')
 const audit=JSON.parse(readFileSync('public/map-studio/reviews/mirage-native/audit.json','utf8'))
 it('preserves every non-site drawing and utility record',()=>{
  for(const mark of before.marks.filter(m=>m.kind!=='bombsite'))expect(after.marks.find(m=>m.id===mark.id)).toEqual(mark)
 })
 it('imports both native footprints without claiming runtime certification',()=>{
  expect(audit.navMatches).toBe(true)
  expect(audit.navAreas).toBe(2544)
  for(const site of audit.sites){const mark=after.marks.find(m=>m.spatial?.site===site.site)!;expect(mark.points).toEqual(site.points);expect(mark.status).toBe('draft');expect(mark.points.length).toBeGreaterThanOrEqual(3)}
  expect(after.validation).toBeUndefined()
 })
 it('keeps all enabled spawn origins as review pins, not new spawn areas',()=>{
  const pins=after.marks.filter(m=>m.id.startsWith('native-spawn:'))
  expect(pins).toHaveLength(33)
  for(const spawn of audit.spawns){expect(pins.find(p=>p.id===`native-spawn:${spawn.id}`)?.points).toEqual([spawn.radar])}
  expect(after.marks.filter(m=>m.kind==='ctspawn'||m.kind==='tspawn')).toHaveLength(2)
  expect(new Set(after.marks.map(m=>m.id)).size).toBe(after.marks.length)
 })
})
