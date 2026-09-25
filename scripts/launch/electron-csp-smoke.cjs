// Offscreen integration test of the production renderer, native preload and worker.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {loadHandlers}=require('./electron-handler-harness.cjs');
const {listenLoopback,isAllowedLocalRequest}=require('../../electron/local-server');
const {contentPolicy}=require('../../electron/content-policy');
const root=path.resolve(__dirname,'../..');
const parent=path.join(root,'tmp/l07-csp');fs.mkdirSync(parent,{recursive:true});
const directory=fs.mkdtempSync(path.join(parent,'run-'));app.setPath('userData',directory);app.disableHardwareAcceleration();
const report={passed:false,electron:process.versions.electron,buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),checks:[],consoleErrors:[],limitations:['Source build, synthetic storage/Steam SDK; not packaged acceptance or full UI coverage.']};
let win,server;const timeout=setTimeout(()=>finish(new Error('Renderer/worker CSP smoke timed out')),90000);
function finish(error){clearTimeout(timeout);if(error)report.error=error.stack;else report.passed=true;const output=path.join(directory,'report.json');fs.writeFileSync(output,JSON.stringify(report,null,2));fs.writeFileSync(path.join(parent,'latest.json'),JSON.stringify({output}));if(win&&!win.isDestroyed())win.destroy();if(server)server.close();app.exit(error?1:0);}
async function main(){
  await app.whenReady();
  const nextApp=require('next')({dev:false,dir:root});await nextApp.prepare();const handle=nextApp.getRequestHandler();
  server=http.createServer((req,res)=>{if(!isAllowedLocalRequest(req,server.address().port)){res.writeHead(403);res.end();return;}handle(req,res);});
  await listenLoopback(server,33400,33420);const port=server.address().port;
  const chunks=path.join(root,'.next/static/chunks');const entry=fs.readdirSync(chunks).find(f=>f.endsWith('.js')&&fs.readFileSync(path.join(chunks,f),'utf8').includes('self.onmessage=')&&fs.readFileSync(path.join(chunks,f),'utf8').includes('PROCESS_WEEK'));
  assert.ok(entry);report.worker=entry;
  const preload=path.join(directory,'preload.cjs');
  fs.writeFileSync(preload,fs.readFileSync(path.join(root,'electron/preload.js'),'utf8')+`
    window.addEventListener('DOMContentLoaded',()=>{
      const violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push({directive:e.violatedDirective,blocked:e.blockedURI}));
      let ticks=0;const timer=setInterval(()=>{
        const text=document.body?.textContent||'';
        const ready=location.pathname==='/main-menu'?text.includes('New Career'):location.pathname==='/map-editor'?text.includes('Map studio'):text.includes('Simulation lab')&&text.includes('2,544');
        if(!ready&&++ticks<100)return;
        clearInterval(timer);
        if(location.pathname!=='/main-menu'){ipcRenderer.send('l07-csp-result',{route:location.pathname,ready,violations});return;}
        const worker=new Worker('/_next/static/chunks/${entry}');
        worker.onmessage=e=>{if(e.data.type==='READY'){worker.terminate();ipcRenderer.send('l07-csp-result',{route:location.pathname,ready,workerReady:true,violations});}};
        worker.onerror=e=>ipcRenderer.send('l07-csp-result',{route:location.pathname,ready,error:e.message,violations});
      },100);
    });`);
  win=new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
  loadHandlers({directory,ipcMain,contents:win.webContents,nativeWindow:win,port});
  win.webContents.session.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[contentPolicy(details.url).replace(" 'unsafe-eval'",'')]}}));
  win.webContents.on('console-message',(_event,...args)=>{const detail=args.length===1?args[0]:{level:args[0],message:args[1]};if(detail.level==='error'||detail.level===3)report.consoleErrors.push(detail.message);});
  for(const route of ['/main-menu','/map-editor','/map-editor/lab?map=Mirage']) {
    const result=await new Promise((resolve,reject)=>{ipcMain.once('l07-csp-result',(event,data)=>{assert.equal(event.sender,win.webContents);resolve(data);});win.loadURL(`http://localhost:${port}${route}`).catch(reject);});
    report.checks.push(result);assert.equal(result.ready,true);assert.equal(result.error,undefined);assert.deepEqual(result.violations,[]);
    if(route==='/main-menu')assert.equal(result.workerReady,true);
  }
  assert.equal(report.consoleErrors.filter(e=>/unsafe-eval|EvalError|Content Security Policy/i.test(e)).length,0);
}
main().then(()=>finish(),finish);
