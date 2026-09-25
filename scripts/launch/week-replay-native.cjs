const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'../..');
const directory=path.resolve(process.argv[2]||'');
if(path.dirname(directory)!==path.join(root,'tmp/l04-native')||!path.basename(directory).startsWith('run-'))throw Error('Isolated profile required');
app.setPath('userData',path.join(directory,'profile'));app.disableHardwareAcceleration();
let win,server;
const finish=report=>{fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({...report,buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim()},null,2));win?.destroy();server?.close();app.exit(report.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Native replay timeout'}),120000).unref();
app.whenReady().then(async()=>{
 const chunks=path.join(root,'.next/static/chunks');
 const entries=fs.readdirSync(chunks).filter(n=>n.endsWith('.js')&&fs.readFileSync(path.join(chunks,n),'utf8').includes('self.onmessage=')&&fs.readFileSync(path.join(chunks,n),'utf8').includes('PROCESS_WEEK'));
 if(entries.length!==1)throw Error('Missing compiled worker');
 server=http.createServer((req,res)=>{
  if(req.url==='/report'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.end('ok');setImmediate(()=>finish(JSON.parse(body)))});return;}
  if(req.url==='/broken-worker.js'){res.setHeader('Content-Type','text/javascript');res.end('postMessage({type:"READY"});onmessage=()=>{throw new Error("Injected worker crash")}');return;}
  if(req.url==='/compiled-worker.js'){res.writeHead(302,{Location:'/_next/static/chunks/'+entries[0]});res.end();return;}
  if(req.url.startsWith('/_next/static/chunks/')){const target=path.resolve(chunks,req.url.slice('/_next/static/chunks/'.length));if(!target.startsWith(chunks+path.sep)||!fs.existsSync(target)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(target));return;}
  if(req.url==='/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(directory,'browser.js')));return;}
  res.end('<!doctype html><title>Isolated coordinator replay</title><script>window.addEventListener("error",e=>fetch("/report",{method:"POST",body:JSON.stringify({passed:false,error:e.message})}));</script><script src="/browser.js"></script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(33580,'127.0.0.1',resolve)});
 win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('console-message',(_event,_level,message)=>fs.appendFileSync(path.join(directory,'renderer.log'),message+'\n'));
 await win.loadURL('http://localhost:33580/');
}).catch(error=>finish({passed:false,error:String(error)}));
