import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const {loadHandlers} = require('../scripts/launch/electron-handler-harness.cjs')
const {contracts, MAX_MOD_BYTES, MAX_VALUE_BYTES} = require('../electron/ipc-policy')
let directory: string
let harness: ReturnType<typeof loadHandlers>
beforeEach(()=> { directory=fs.mkdtempSync(path.join(os.tmpdir(),'esim-ipc-test-'));harness=loadHandlers({directory}) })
afterEach(()=> {
  expect(path.dirname(path.resolve(directory))).toBe(path.resolve(os.tmpdir()))
  expect(path.basename(directory)).toMatch(/^esim-ipc-test-/)
  fs.rmSync(directory,{recursive:true,force:true})
})

test('every actual main/Steam handler and preload invocation has a contract',()=>{
  expect([...harness.handlers.keys()].sort()).toEqual(Object.keys(contracts).sort())
  const preload=fs.readFileSync(path.join(__dirname,'../electron/preload.js'),'utf8')
  for(const [,name] of preload.matchAll(/ipcRenderer.invoke\('([^']+)'/g)) expect(harness.handlers.has(name)).toBe(true)
})

test('literal staging keys preserve the primary through actual storage handlers', async()=>{
  expect(await harness.invoke('storage-set-item','esports-sim-storage','bootstrap')).toBe(true);
  expect(await harness.invoke('storage-get-item','esports-sim-storage')).toBe('bootstrap');
  const key='esports_save_career';
  expect(await harness.invoke('storage-set-item',key,'last-good')).toBe(true);
  expect(await harness.invoke('storage-set-item',key+'.tmp','candidate')).toBe(true);
  expect(await harness.invoke('storage-get-item',key)).toBe('last-good');
  expect(await harness.invoke('storage-get-item',key+'.tmp')).toBe('candidate');
  expect(await harness.invoke('storage-remove-item',key+'.tmp')).toBe(true);
  expect(await harness.invoke('storage-get-item',key)).toBe('last-good');
  expect(await harness.invoke('storage-set-item',key+'.other','no')).toBe(false);
})
test('every actual handler rejects foreign contents, child frames and wrong origins before side effects',async()=>{
  const args: Record<string, unknown[]> = {
    'window-set-fullscreen':[true], 'window-set-size':[1280,720], 'gpu-set-mode':['compatibility'],
    'log-write-error':[{message:'valid report'}], 'storage-get-item':['esports_save_test'],
    'storage-set-item':['esports_save_test','changed'], 'storage-remove-item':['esports_save_test'],
    'mod-install':['{"players":[]}'], 'mod-read':['players.json'], 'mod-write':['players.json','[]'],
    'steam-get-stat':['stat_total_wins'], 'steam-set-stat':['stat_total_wins',1],
    'steam-set-achievement':['FIRST_WIN'], 'steam-is-achievement-unlocked':['FIRST_WIN'],
    'steam-set-leaderboard-score':['lead_world_ranking',1],
    'steam-set-rich-presence':['status','QA'], 'steam-get-rich-presence':['status'],
    'steam-cloud-read':['save_test.json'], 'steam-cloud-write':['save_test.json','{}'], 'steam-cloud-delete':['save_test.json'],
    'workshop-set-active':[{source:'community'}], 'workshop-subscribe':['123'], 'workshop-unsubscribe':['123'], 'workshop-open':['123'],
  }
  harness.values.esports_save_test='private sentinel'
  for (const name of harness.handlers.keys()) expect(contracts[name].check(args[name]||[])).toBe(true)
  for(const event of [
    {...harness.event,sender:{id:7}},
    {...harness.event,senderFrame:{url:'http://localhost:3210/main-menu'}},
    {...harness.event,senderFrame:null},
  ]) for(const [name,handler] of harness.handlers) expect(await handler(event,...(args[name]||[]))).toEqual(contracts[name].fallback)
  for(const url of ['https://evil.example/','http://localhost:3001/','http://127.0.0.1:3210/','http://localhost:3210/mod-assets/evil.svg','data:text/html,test']) {
    harness.event.senderFrame.url=url
    for(const [name,handler] of harness.handlers) expect(await handler(harness.event,...(args[name]||[]))).toEqual(contracts[name].fallback)
  }
  expect(harness.values).toEqual({window:{width:1280,height:720},privateSetting:'keep',esports_save_test:'private sentinel'})
  expect(fs.readdirSync(directory)).toEqual([])
})
test('storage preserves saves and keeps private native settings outside renderer authority',async()=>{
  expect(await harness.invoke('storage-set-item','esports_save_test','{"saveVersion":7}')).toBe(true)
  expect(await harness.invoke('storage-get-item','esports_save_test')).toContain('saveVersion')
  for(const key of ['window','window.fullscreen','__proto__.x','esports_save_x.y','../config','esports_'+ 'x'.repeat(240)]) {
    expect(await harness.invoke('storage-set-item',key,'bad')).toBe(false)
    expect(await harness.invoke('storage-remove-item',key)).toBe(false)
    expect(await harness.invoke('storage-get-item',key)).toBeNull()
  }
  expect(await harness.invoke('storage-get-all-keys')).toEqual(['esports_save_test'])
  expect(await harness.invoke('storage-clear')).toBe(true)
  expect(harness.values).toEqual({window:{width:1280,height:720},privateSetting:'keep'})
})
test('invalid types, extra arguments, UTF-8 overflow and dangerous Steam identifiers fail safely',async()=>{
  for(const [channel,args] of [
    ['window-set-fullscreen',['yes']], ['window-set-size',[Infinity,720]], ['window-set-size',[1280,1e9]],
    ['gpu-set-mode',['unknown']], ['gpu-get-mode',['extra']], ['log-write-error',[{message:'x',level:'a'.repeat(10000)}]],
    ['storage-set-item',['esports_save_test','é'.repeat(MAX_VALUE_BYTES/2+1)]],
    ['mod-write',['players.json',' '.repeat(MAX_MOD_BYTES+1)]], ['mod-write',['players.json','{}']],
    ['mod-write',['manifest.json','{"__proto__":{"x":1}}']], ['mod-write',['players.json','broken']],
    ['mod-write',['../players.json','[]']], ['steam-cloud-write',['save_a.json',{}]],
    ['steam-cloud-read',['save_a.json:secret']], ['steam-cloud-delete',['../save_a.json']],
    ['steam-set-rich-presence',['unbounded-key','value']], ['steam-set-rich-presence',['status',{}]],
    ['steam-set-leaderboard-score',['lead_world_ranking',1.5]], ['workshop-subscribe',['1e9']],
    ['workshop-open',['https://evil.example/123']], ['workshop-set-active',[{source:'workshop',workshopId:'18446744073709551616'}]],
  ] as Array<[string, unknown[]]>) expect(await harness.invoke(channel,...args)).toEqual(contracts[channel].fallback)
  expect(fs.readdirSync(directory)).toEqual([])
})
test('legacy mod reads work and clear masks originals while preserving a rollback',async()=>{
  expect(await harness.invoke('mod-write','players.json','[]')).toBe(true)
  expect(await harness.invoke('mod-write','manifest.json','{"name":"QA"}')).toBe(true)
  expect(await harness.invoke('mod-read','players.json')).toBe('[]')
  const mod=path.join(directory,'mods/community')
  fs.writeFileSync(path.join(mod,'notes.txt'),'keep')
  expect(await harness.invoke('mod-clear')).toBe(true)
  expect(fs.readFileSync(path.join(mod,'notes.txt'),'utf8')).toBe('keep')
  expect(await harness.invoke('mod-exists')).toBe(false)
  expect(await harness.invoke('mod-restore')).toBe(true)
  expect(await harness.invoke('mod-read','players.json')).toBe('[]')
})
test('junctions cannot redirect mod IPC to unrelated files',async()=>{
  const outside=path.join(directory,'outside'); fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'players.json'),'["private"]')
  fs.mkdirSync(path.join(directory,'mods'))
  fs.symlinkSync(outside,path.join(directory,'mods/community'),'junction')
  expect(await harness.invoke('mod-read','players.json')).toBeNull()
  expect(await harness.invoke('mod-write','players.json','[]')).toBe(false)
  expect(await harness.invoke('mod-clear')).toBe(false)
  expect(fs.readFileSync(path.join(outside,'players.json'),'utf8')).toBe('["private"]')
})

test('actual Steam cloud handlers preserve SDK rejection and acknowledgement',async()=>{
  let success=false
  const steamClient={localplayer:{getName:()=> 'QA',getSteamId:()=> '123'},cloud:{fileExists:()=>false,writeFile:async()=>success,deleteFile:async()=>success}}
  const h=loadHandlers({directory,steamClient})
  expect(await h.invoke('steam-cloud-write','save_test.json','{}')).toBe(false)
  expect(await h.invoke('steam-cloud-delete','save_test.json')).toBe(false)
  success=true
  expect(await h.invoke('steam-cloud-write','save_test.json','{}')).toBe(true)
  expect(await h.invoke('steam-cloud-delete','save_test.json')).toBe(true)
})
