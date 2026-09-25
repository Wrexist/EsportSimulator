import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const {listenLoopback,isAllowedLocalRequest}=require('../electron/local-server')
const {loadHandlers}=require('../scripts/launch/electron-handler-harness.cjs')
const {readBounded}=require('../electron/local-files')
test('local requests reject rebinding hosts, foreign origins and cross-site requests',()=>{
  for(const headers of [{host:'evil.example:3000'},{host:'localhost:3000',origin:'https://evil.example'},{host:'localhost:3000','sec-fetch-site':'cross-site'}]) expect(isAllowedLocalRequest({headers},3000)).toBe(false)
  expect(isAllowedLocalRequest({headers:{host:'localhost:3000',origin:'http://localhost:3000'}},3000)).toBe(true)
})
test('port contention selects a loopback listener and removes stale callbacks',async()=>{
  const occupied=http.createServer(),server=http.createServer()
  const initialListening = server.listeners('listening')
  try {
    await listenLoopback(occupied,0,0)
    const port=(occupied.address() as {port:number}).port
    await listenLoopback(server,port,port+10)
    expect(server.address()).toMatchObject({address:'127.0.0.1'})
    expect((server.address() as {port:number}).port).toBeGreaterThan(port)
    expect(server.listeners('listening')).toEqual(initialListening)
    expect(server.listenerCount('error')).toBe(0)
  } finally { await Promise.all([occupied,server].map(s=>new Promise<void>(r=>s.close(()=>r())))) }
})
test('actual mod asset route blocks traversal/junctions and serves SVG with inert document policy',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'esim-assets-test-'))
  const h=loadHandlers({directory})
  const mod=path.join(directory,'mods/community');fs.mkdirSync(mod,{recursive:true})
  fs.writeFileSync(path.join(mod,'logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const outside=path.join(directory,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.png'),'private')
  fs.symlinkSync(outside,path.join(mod,'linked'),'junction')
  const server=http.createServer((req,res)=>{if(!h.serveModAsset(req,res,req.url)) {res.statusCode=404;res.end()} })
  try {
    await listenLoopback(server,0,0);const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`
    for(const route of ['/mod-assets/%2e%2e%2foutside/secret.png','/mod-assets/linked/secret.png','/mod-assets/logo.svg:secret','/mod-assets/%ZZ']) {
      const response=await fetch(url+route);expect(response.status).not.toBe(200);expect(await response.text()).not.toContain('private')
    }
    const response=await fetch(url+'/mod-assets/logo.svg');expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect((await fetch(url+'/mod-assets/logo.svg',{method:'POST'})).status).toBe(405)
    fs.writeFileSync(path.join(mod,'players.json'),'x'.repeat(1025))
    expect(()=>readBounded(mod,'players.json',1024)).toThrow('Oversized')
  } finally {
    await new Promise<void>(r=>server.close(()=>r()))
    expect(path.dirname(path.resolve(directory))).toBe(path.resolve(os.tmpdir()))
    expect(path.basename(directory)).toMatch(/^esim-assets-test-/)
    fs.rmSync(directory,{recursive:true,force:true})
  }
})
