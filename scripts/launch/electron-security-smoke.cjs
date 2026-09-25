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
const {secureWebContents}=require('../../electron/renderer-security');
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
        const results={url:location.href, nodeExposed:typeof window.require!=='undefined'};
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
    res.setHeader('Content-Security-Policy',contentPolicy('http://localhost/'));
    res.end('<!doctype html><title>Isolated IPC fixture</title><p>Synthetic security probe</p>');
  });
  await listenLoopback(server,33300,33320);const port=server.address().port;
  report.port=port;report.address=server.address().address;
  const options={show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}};
  const trusted=new BrowserWindow(options);windows.push(trusted);
  secureWebContents(trusted.webContents,url=>isAllowedAppNavigation(url,port));
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
