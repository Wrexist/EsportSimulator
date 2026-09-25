// Test-only loader: actual main/Steam registration code, isolated process services.
// Never initializes Steam or opens the owner's electron-store.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'../..');
function loadHandlers({directory, ipcMain, contents, nativeApp, nativeWindow, steamClient, diskStore, port=3210}={}) {
    const handlers=new Map();
    const app=new EventEmitter();
    Object.assign(app,{isPackaged:false,setAppUserModelId(){},requestSingleInstanceLock:()=>true,getPath:()=>directory,getAppPath:()=>root,
        commandLine:{appendSwitch(){}},quit(){},disableHardwareAcceleration(){}});
    const values={window:{width:1280,height:720},privateSetting:'keep'};
    const store=diskStore||{get:key=>values[key],set:(key,value)=>{values[key]=value;},delete:key=>{delete values[key];},get store(){return values;},set store(next){for(const key of Object.keys(values)) delete values[key];Object.assign(values,next);}};
    const webContents=contents||{id:7,mainFrame:{url:'http://localhost:3210/main-menu'},getURL:()=>webContents.mainFrame.url,isDestroyed:()=>false};
    const window=nativeWindow||{webContents,setFullScreen(){},setSize(){},center(){},getBounds:()=>({width:1280,height:720,x:0,y:0}),getSize:()=>[1280,720],isFullScreen:()=>false,close(){}};
    const electron={app:nativeApp||app,ipcMain:ipcMain||{handle:(name,fn)=>handlers.set(name,fn)},BrowserWindow:function(){},screen:{getAllDisplays:()=>[]},Menu:{},nativeImage:{},shell:{openExternal:async()=>{}},dialog:{}};
    const fakeSteam=steamClient||{stats:{getInt:()=>1,getFloat:()=>0,setInt:()=>true,store:()=>true},localplayer:{getName:()=> 'Synthetic QA',getSteamId:()=> '123',setRichPresence(){}},achievement:{activate:()=>true,isActivated:()=>false},cloud:{fileExists:()=>false,writeFile:async()=>{},readFile:async()=> '{}',deleteFile:async()=>{}},workshop:{getSubscribedItems:()=>[],subscribe:async()=>{},unsubscribe:async()=>{},download(){}}};
    const contexts={};
    function load(file) {
        const full=path.join(root,'electron',file),localRequire=createRequire(full);
        const context=vm.createContext({require:id=>id==='electron'?electron:id==='steamworks.js'?{init:()=>fakeSteam}:id==='./steam'?load('steam.js'):localRequire(id),
            module:{exports:{}},exports:{},__dirname:path.dirname(full),__filename:full,URL,Buffer,console:{log(){},error(){},warn(){}},
            process:{env:{NEXT_SERVER_PORT:String(port),ESM_STABILITY_MODE:'1'},platform:process.platform,resourcesPath:directory,version:process.version,exit(){}},
            setTimeout,clearTimeout,setInterval,clearInterval, testWindow:window,testStore:store});
        vm.runInContext(fs.readFileSync(full,'utf8'),context,{filename:full});
        contexts[file]=context;
        return context.module.exports;
    }
    load('main.js');
    vm.runInContext('mainWindow = testWindow; store = testStore;',contexts['main.js']);
    const event={sender:webContents,senderFrame:webContents.mainFrame};
    const attachCloseHandler=()=>{
        const source=fs.readFileSync(path.join(root,'electron/main.js'),'utf8');
        const start=source.indexOf("mainWindow.on('close', (e) => {");
        const end=source.indexOf('// Override beforeunload prevention',start);
        if(start<0||end<start)throw new Error('Production close handler markers changed');
        vm.runInContext(source.slice(start,end),contexts['main.js']);
    };
    return {handlers,event,values,window,contexts,attachCloseHandler,serveModAsset:vm.runInContext('serveModAsset',contexts['main.js']),invoke:(name,...args)=>handlers.get(name)(event,...args)};
}
module.exports={loadHandlers};
