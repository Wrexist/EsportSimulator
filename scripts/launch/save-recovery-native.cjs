// Real Chromium storage and real electron-store over actual registered IPC. Isolated profile only.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {loadHandlers}=require('./electron-handler-harness.cjs');
const {contentPolicy}=require('../../electron/content-policy');
const root=path.resolve(__dirname,'../..');
const directory=path.resolve(process.argv[2]||'');
if(path.dirname(directory)!==path.join(root,'tmp','l03-native')||!path.basename(directory).startsWith('run-')) throw new Error('Use an isolated tmp/l03-native/run-* profile');
const reading=process.argv.includes('--read');
app.setPath('userData',path.join(directory,'profile'));
app.disableHardwareAcceleration();
let server,win;
const report={phase:reading?'fresh-process':'faults',electron:process.versions.electron,checks:[]};
const finish=error=>{
  if(error) report.error=String(error);
  report.passed=!error&&report.checks.length===3&&report.checks.every(c=>c.passed);
  fs.writeFileSync(path.join(directory,reading?'read.json':'faults.json'),JSON.stringify(report,null,2));
  if(win&&!win.isDestroyed()) win.destroy();
  if(server) server.close();
  app.exit(report.passed?0:1);
};
setTimeout(()=>finish(new Error('Probe timed out')),90000).unref();
app.whenReady().then(async()=>{
  const {default:Store}=await import('electron-store');
  const actual=new Store({cwd:path.join(directory,'disk')});
  let fault=false;
  const diskStore={get:key=>actual.get(key),get store(){return actual.store},set store(value){if(fault) throw new Error('Synthetic EACCES');actual.store=value;}};
  const preload=path.join(directory,'preload.cjs');
  fs.writeFileSync(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('electron',{storage:{getItem:k=>ipcRenderer.invoke('storage-get-item',k),setItem:(k,v)=>ipcRenderer.invoke('storage-set-item',k,v),removeItem:k=>ipcRenderer.invoke('storage-remove-item',k),clear:()=>ipcRenderer.invoke('storage-clear'),getAllKeys:()=>ipcRenderer.invoke('storage-get-all-keys')}});contextBridge.exposeInMainWorld('recoveryQA',{fault:on=>ipcRenderer.invoke('l03-fault',on)});`);
  const bundle=fs.readFileSync(path.join(directory,'browser.js'));
  let received;
  server=http.createServer((req,res)=>{
    if(req.method==='POST'&&req.url==='/report') {let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.end('ok');received(JSON.parse(body))});return;}
    res.setHeader('Content-Security-Policy',contentPolicy('http://localhost/'));
    if(req.url==='/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle);return;}
    res.end('<!doctype html><title>Isolated save recovery QA</title><p>Testing persistent storage</p><script src="/browser.js"></script>');
  });
  const port=33570;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  win=new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,nodeIntegration:false}});
  loadHandlers({directory:path.join(directory,'disk'),ipcMain,contents:win.webContents,nativeWindow:win,diskStore,port});
  ipcMain.handle('l03-fault',(event,on)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Foreign QA sender');fault=on===true});
  for(const mode of ['local','idb','disk']) {
    const result=new Promise(resolve=>received=resolve);
    await win.loadURL(`http://localhost:${port}/?mode=${mode}${reading?'&read=1':''}`);
    const value=await result;report.checks.push(value);
    if(!value.passed) throw new Error(`${mode}: ${value.error}`);
  }
  finish();
}).catch(finish);
