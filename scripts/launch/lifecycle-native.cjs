const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http'),vm=require('vm');
const {loadHandlers}=require('./electron-handler-harness.cjs');
const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.argv[2]||'');
const reading=process.argv.includes('--read');
if(path.dirname(directory)!==path.join(root,'tmp/l05-native')||!path.basename(directory).startsWith('run-'))throw Error('Isolated profile required');
app.setPath('userData',path.join(directory,'profile'));app.disableHardwareAcceleration();
let win,server,actual,finished=false,slowStarted=0;
const checks=[];
function finish(error){if(finished)return;finished=true;fs.writeFileSync(path.join(directory,reading?'read.json':'report.json'),JSON.stringify({passed:!error,error:error?String(error):undefined,electron:process.versions.electron,checks},null,2));if(win&&!win.isDestroyed())win.destroy();server?.close();app.exit(error?1:0)}
setTimeout(()=>finish(Error('Lifecycle timeout')),110000).unref();
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
 const {default:Store}=await import('electron-store');actual=new Store({cwd:path.join(directory,'disk')});
 const preload=path.join(directory,'preload.cjs');
 fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('lifecycleQA',{onClose:fn=>ipcRenderer.on('app-close-intent',()=>fn()),ack:()=>ipcRenderer.invoke('app-close-received'),cancel:()=>ipcRenderer.invoke('app-close-cancelled'),confirm:()=>ipcRenderer.invoke('app-close-confirmed'),write:(k,v)=>ipcRenderer.invoke('storage-set-item',k,v)});`);
 let harness;
 server=http.createServer((req,res)=>{
  if(req.url==='/stage'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   res.end('ok');const {stage,detail}=JSON.parse(body);checks.push({stage,...detail});fs.writeFileSync(path.join(directory,'stages.json'),JSON.stringify(checks,null,2));
   if(stage==='error'){finish(Error(detail.error));return;}
   if(stage==='preferences-reloaded'){finish();return;}
   if(stage==='ready')setTimeout(()=>win.close(),100);
   if(stage==='cancelled'&&(win.isDestroyed()||vm.runInContext('closePending',harness.contexts['main.js'])))finish(Error('Cancel left native close pending'));
   if(stage==='autosaved'){slowStarted=Date.now();setTimeout(()=>win.close(),100);setTimeout(()=>{if(!win.isDestroyed())checks.push({stage:'slow-save-still-open',elapsedMs:Date.now()-slowStarted});else finish(Error('Slow save closed early'))},16000);}
  });return;}
  if(req.url==='/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(directory,'browser.js')));return;}
  res.end('<!doctype html><title>Isolated lifecycle QA</title><script src="/browser.js"></script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(33590,'127.0.0.1',resolve)});
 win=new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',(_event,_level,message)=>fs.appendFileSync(path.join(directory,'renderer.log'),message+'\n'));
 harness=loadHandlers({directory,ipcMain,nativeWindow:win,contents:win.webContents,diskStore:actual,port:33590});harness.attachCloseHandler();
 win.on('closed',()=>{if(finished)return;try{const stored=JSON.parse(actual.store.esports_l05_lifecycle);if(stored.phase!=='slow'||stored.attempts!==5||!checks.some(c=>c.stage==='slow-save-still-open'))throw Error('Final durable write missing');checks.push({stage:'closed-after-durable-save',...stored,elapsedMs:Date.now()-slowStarted});finish()}catch(error){finish(error)}});
 await win.loadURL('http://localhost:33590/'+(reading?'?read=1':''));
}).catch(finish);
