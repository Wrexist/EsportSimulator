const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(__dirname,'../..'),directory=path.resolve(process.argv[2]||'');
if(path.dirname(directory)!==path.join(root,'tmp/l09-native')||!path.basename(directory).startsWith('run-'))throw Error('Isolated profile required');
app.setPath('userData',path.join(directory,'profile'));app.disableHardwareAcceleration();
let win,server,finished=false,entry;
function finish(report){if(finished)return;finished=true;fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify({...report,electron:process.versions.electron,buildId:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),worker:entry},null,2));win?.destroy();server?.close();app.exit(report.passed?0:1)}
setTimeout(()=>finish({passed:false,error:'Spatial probe timeout'}),180000).unref();
app.whenReady().then(async()=>{
 const chunks=path.join(root,'.next/static/chunks');
 const files=fs.readdirSync(chunks).filter(n=>n.endsWith('.js')).map(name=>({name,code:fs.readFileSync(path.join(chunks,name),'utf8')}));
 const modules=files.filter(f=>f.code.includes('excludedPortals')&&f.code.includes('Radar image changed since registration')&&f.code.includes('.onmessage=')&&!f.code.includes('PROCESS_WEEK'));
 if(modules.length!==1)throw Error('Missing compiled spatial module');
 // A shared chunk can contain several modules; select the worker body, not its first module.
 const ast=require('acorn').parse(modules[0].code,{ecmaVersion:'latest'}),ids=[];
 function visit(node){if(!node||typeof node!=='object')return;
  if(node.type==='Property'&&typeof node.key?.value==='number'&&node.value?.type==='ArrowFunctionExpression'){
   const body=modules[0].code.slice(node.value.start,node.value.end);
   if(body.includes('Radar image changed since registration')&&body.includes('.onmessage='))ids.push(String(node.key.value));
  }
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 }
 visit(ast);if(ids.length!==1)throw Error('Compiled spatial module identity is ambiguous');const moduleId=ids[0];
 const entries=files.filter(f=>moduleId&&f.code.includes('importScripts(')&&f.code.includes('('+moduleId+')')).map(f=>f.name).sort();
 if(!entries.length)throw Error('Missing compiled spatial worker bootstrap');entry=entries[0];
 server=http.createServer((req,res)=>{
  if(req.url==='/report'&&req.method==='POST'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{res.end('ok');setImmediate(()=>finish(JSON.parse(body)))});return;}
  if(req.url==='/compiled-spatial.js'){res.writeHead(302,{Location:'/_next/static/chunks/'+entry});res.end();return;}
  if(req.url==='/browser.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(directory,'browser.js')));return;}
  for(const [prefix,folder] of [['/_next/static/chunks/',chunks],['/map-studio/',path.join(root,'public/map-studio')],['/maps/',path.join(root,'public/maps')]])if(req.url.startsWith(prefix)){
   const target=path.resolve(folder,req.url.slice(prefix.length));if(!target.startsWith(folder+path.sep)||!fs.existsSync(target)){res.writeHead(404);res.end();return;}
   res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.json')?'application/json':target.endsWith('.png')?'image/png':'application/octet-stream');res.end(fs.readFileSync(target));return;
  }
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self'");
  res.end('<!doctype html><title>Isolated spatial review</title><script src="/browser.js"></script>');
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(33600,'127.0.0.1',resolve)});
 win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 win.webContents.on('console-message',(_e,_l,message)=>fs.appendFileSync(path.join(directory,'renderer.log'),message+'\n'));
 await win.loadURL('http://localhost:33600/');
}).catch(error=>finish({passed:false,error:String(error)}));
