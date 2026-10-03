// Real Electron IPC transport + sandboxed preload, using synthetic files only.
// This is a source integration probe, not a packaged or Steam-account acceptance.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {loadHandlers}=require('./electron-handler-harness.cjs');
const {listenLoopback,isAllowedLocalRequest}=require('../../electron/local-server');
const {isAllowedAppNavigation}=require('../../electron/app-origin');
const {secureWebContents,secureSession}=require('../../electron/renderer-security');
const {createExternalOpener}=require('../../electron/external-links');
const {contentPolicy}=require('../../electron/content-policy');
const root=path.resolve(__dirname,'../..');
const parent=path.join(root,'tmp/l07-native');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));
app.setPath('userData',directory);app.disableHardwareAcceleration();
const report={passed:false,electron:process.versions.electron,directory,checks:[],limitations:['Synthetic storage/Steam SDK; no live Steam calls. Actual main/Steam handlers and real Electron IPC, not a packaged build.']};
const output=path.join(directory,'report.json');
const windows=[];let server;
const timeout=setTimeout(()=>finish(new Error('Security smoke timed out')),60000);
function finish(error) {
  clearTimeout(timeout);if(error)report.error=error.stack;else report.passed=true;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(parent,'latest.json'),JSON.stringify({output},null,2)+'\n');
  for(const win of windows)if(!win.isDestroyed())win.destroy();if(server)server.close();app.exit(error?1:0);
}
async function main() {
  await app.whenReady();
  const preload=path.join(directory,'probe-preload.cjs');
  fs.writeFileSync(preload,`const {ipcRenderer}=require('electron');
    window.addEventListener('DOMContentLoaded',async()=>{
      try {
        if(location.pathname==='/navigation-probe'){location.href='https://untrusted.invalid/';return;}
        if(location.pathname==='/frame-host')return;
        if(location.pathname==='/link-probe'){
          const click=(href,target)=>{const a=document.createElement('a');a.href=href;if(target)a.target=target;document.body.append(a);a.click();};
          click('https://store.steampowered.com/app/480/');
          click('http://store.steampowered.com/plain-http/');
          click('https://evil.invalid/blank','_blank');
          const allowedPopup=window.open('https://steamcommunity.com/app/480/workshop/');
          const evilPopup=window.open('https://evil.invalid/popup');
          const notification=await Notification.requestPermission();
          setTimeout(()=>ipcRenderer.send('l07-probe-report',{allowedPopup:allowedPopup===null,evilPopup:evilPopup===null,notification}),300);
          return;
        }
        if(location.pathname==='/download-probe'){
          const click=(href,name)=>{const a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();};
          click(URL.createObjectURL(new Blob(['{"synthetic":true}'],{type:'application/json'})),'app-export.json');
          click('data:application/octet-stream,owned','data-download.bin');
          setTimeout(()=>ipcRenderer.send('l07-probe-report',{clicked:true}),500);
          return;
        }
        const results={url:location.href, top:window===window.top, nodeExposed:typeof window.require!=='undefined'};
        results.write=await ipcRenderer.invoke('storage-set-item','esports_save_probe','synthetic');
        results.read=await ipcRenderer.invoke('storage-get-item','esports_save_probe');
        results.badKey=await ipcRenderer.invoke('storage-set-item','window.fullscreen','true');
        results.badSize=await ipcRenderer.invoke('window-set-size',Infinity,720);
        results.badMod=await ipcRenderer.invoke('mod-write','../escape.json','[]');
        results.mod=await ipcRenderer.invoke('mod-write','players.json','[]');
        results.modInstall=await ipcRenderer.invoke('mod-install','{"teams":[]}');
        results.modPlayers=await ipcRenderer.invoke('mod-read','players.json');
        results.modRestore=await ipcRenderer.invoke('mod-restore');
        results.restoredPlayers=await ipcRenderer.invoke('mod-read','players.json');
        results.clear=await ipcRenderer.invoke('storage-clear');
        results.popupDenied=window.open('about:blank')===null;
        ipcRenderer.send('l07-probe-report',results);
      }catch(error){ipcRenderer.send('l07-probe-report',{error:String(error)});}
    });`);
  server=http.createServer((req,res)=>{
    if(!isAllowedLocalRequest(req,server.address().port)){res.writeHead(403);res.end();return;}
    if(req.url==='/frame-child'){
      // No frame-ancestors restriction: the child document really is the trusted origin.
      res.setHeader('Content-Security-Policy',"default-src 'self'");
      res.end('<!doctype html><title>Same-origin child</title><p>child</p>');return;
    }
    if(req.url==='/frame-host'){
      // Deliberately weaker frame policy so the IPC sender gate is exercised by a real child frame.
      res.setHeader('Content-Security-Policy',"default-src 'self'; frame-src 'self'");
      res.end('<!doctype html><title>Frame host</title><iframe src="/frame-child"></iframe>');return;
    }
    res.setHeader('Content-Security-Policy',contentPolicy('http://localhost/'));
    res.end('<!doctype html><title>Isolated IPC fixture</title><p>Synthetic security probe</p>');
  });
  await listenLoopback(server,33300,33320);const port=server.address().port;
  report.port=port;report.address=server.address().address;
  // nodeIntegrationInSubFrames only lets the probe preload run inside a child frame; Node stays disabled.
  const options={show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,nodeIntegrationInSubFrames:true}};
  const trusted=new BrowserWindow(options);windows.push(trusted);
  const opened=[],securityLog=[];
  const isTrusted=url=>isAllowedAppNavigation(url,port);
  const openExternal=createExternalOpener(url=>{opened.push(url);},{minIntervalMs:0,log:line=>securityLog.push(line)});
  secureWebContents(trusted.webContents,isTrusted,{openExternal,log:line=>securityLog.push(line)});
  secureSession(trusted.webContents.session,isTrusted,{log:line=>securityLog.push(line)});
  const downloads=[];
  trusted.webContents.session.on('will-download',(event,item)=>{
    downloads.push({url:item.getURL().slice(0,40),prevented:event.defaultPrevented});
    if(!event.defaultPrevented)item.setSavePath(path.join(directory,'allowed-download.json'));
  });
  const h=loadHandlers({directory,ipcMain,contents:trusted.webContents,nativeWindow:trusted,port});
  function readProbe(win,url) {
    return new Promise((resolve,reject)=>{
      const handler=(event,data)=>{if(event.sender===win.webContents){ipcMain.removeListener('l07-probe-report',handler);resolve(data);}};
      ipcMain.on('l07-probe-report',handler);win.loadURL(url).catch(reject);
    });
  }
  const good=await readProbe(trusted,`http://localhost:${port}/`);
  assert.equal(good.error,undefined);assert.equal(good.nodeExposed,false);assert.equal(good.write,true);assert.equal(good.read,'synthetic');assert.equal(good.badKey,false);assert.equal(good.badSize,false);assert.equal(good.badMod,false);assert.equal(good.mod,true);assert.equal(good.modInstall,true);assert.equal(good.modPlayers,null);assert.equal(good.modRestore,true);assert.equal(good.restoredPlayers,'[]');assert.equal(good.clear,true);
  assert.deepEqual(h.values,{window:{width:1280,height:720},privateSetting:'keep'});
  report.checks.push({name:'Trusted sandboxed main frame + schema rejection + private setting preservation',passed:true,results:good});
  assert.equal(good.popupDenied,true);
  const blocked=await new Promise((resolve,reject)=>{
    trusted.webContents.once('will-frame-navigate',event=>resolve({prevented:event.defaultPrevented,url:event.url}));
    trusted.loadURL(`http://localhost:${port}/navigation-probe`).catch(reject);
  });
  assert.equal(blocked.prevented,true);assert.equal(blocked.url,'https://untrusted.invalid/');
  report.checks.push({name:'Renderer navigation prevented and popup denied',passed:true});
  opened.length=0;
  const links=await readProbe(trusted,`http://localhost:${port}/link-probe`);
  await new Promise(r=>setTimeout(r,300));
  assert.equal(links.allowedPopup,true);assert.equal(links.evilPopup,true);assert.equal(links.notification,'denied');
  assert.deepEqual([...opened].sort(),['https://steamcommunity.com/app/480/workshop/','https://store.steampowered.com/app/480/']);
  assert.equal(trusted.webContents.getURL(),`http://localhost:${port}/link-probe`);
  report.checks.push({name:'Allowlisted HTTPS links go to the OS browser; http, foreign hosts and popups are dropped; permissions denied',passed:true,opened:[...opened],results:links});
  const dl=await readProbe(trusted,`http://localhost:${port}/download-probe`);
  await new Promise(r=>setTimeout(r,500));
  assert.equal(dl.clicked,true);
  assert.ok(downloads.some(d=>d.url.startsWith('blob:http://localhost')&&!d.prevented),'App blob export allowed');
  assert.ok(downloads.some(d=>d.url.startsWith('data:')&&d.prevented),'data: download cancelled');
  report.checks.push({name:'App blob exports download; data: downloads cancelled',passed:true,downloads});
  const frameNavigation=await new Promise((resolve,reject)=>{
    const handler=event=>{if(!event.isMainFrame){trusted.webContents.removeListener('will-frame-navigate',handler);resolve({prevented:event.defaultPrevented,url:event.url});}};
    trusted.webContents.on('will-frame-navigate',handler);
    trusted.loadURL(`http://localhost:${port}/frame-host`).catch(reject);
  });
  assert.equal(frameNavigation.prevented,true);
  report.checks.push({name:'Child-frame navigation blocked by navigation guard',passed:true,result:frameNavigation});
  // Remove the navigation layer so a real same-origin child frame reaches the IPC handlers.
  trusted.webContents.removeAllListeners('will-frame-navigate');
  h.values.esports_save_probe='owner sentinel';
  const child=await readProbe(trusted,`http://localhost:${port}/frame-host`);
  assert.equal(child.top,false);assert.equal(child.url,`http://localhost:${port}/frame-child`);
  assert.equal(child.write,false);assert.equal(child.read,null);assert.equal(child.mod,false);assert.equal(child.modInstall,false);assert.equal(child.modRestore,false);assert.equal(child.clear,false);
  assert.equal(h.values.esports_save_probe,'owner sentinel');
  delete h.values.esports_save_probe;
  report.checks.push({name:'Same-origin child frame of the trusted WebContents denied by every probed IPC handler',passed:true,results:child});
  secureWebContents(trusted.webContents,isTrusted,{openExternal,log:line=>securityLog.push(line)});
  report.securityLog=securityLog.slice(0,40);
  const other=new BrowserWindow(options);windows.push(other);
  secureWebContents(other.webContents,url=>isAllowedAppNavigation(url,port));
  const foreign=await readProbe(other,`http://localhost:${port}/`);
  assert.equal(foreign.write,false);assert.equal(foreign.read,null);assert.equal(foreign.mod,false);assert.equal(foreign.modInstall,false);assert.equal(foreign.modRestore,false);assert.equal(foreign.clear,false);
  report.checks.push({name:'Different real WebContents denied at same origin',passed:true,results:foreign});
  const navigated=await readProbe(trusted,'data:text/html,<p>Untrusted document</p>');
  assert.equal(navigated.write,false);assert.equal(navigated.read,null);assert.equal(navigated.mod,false);assert.equal(navigated.modInstall,false);assert.equal(navigated.modRestore,false);assert.equal(navigated.clear,false);
  report.checks.push({name:'Same real WebContents denied after origin changes',passed:true,results:navigated});
  const status=await new Promise(resolve=>{http.get({host:'127.0.0.1',port,headers:{Host:`evil.example:${port}`}},res=>{res.resume();resolve(res.statusCode)});});
  assert.equal(status,403);report.checks.push({name:'Unexpected Host rejected by actual loopback listener',passed:true});
}
main().then(()=>finish(),finish);
