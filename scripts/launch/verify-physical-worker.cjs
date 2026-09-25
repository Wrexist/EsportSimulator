// Exercise the actual bundled geometry-worker request path without browser UI or career storage.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash,webcrypto}=require('node:crypto');
async function main(){
    const root=path.resolve(__dirname,'../..'),next=path.join(root,'.next'),chunks=path.join(next,'static/chunks');
    const files=fs.readdirSync(chunks).filter(n=>n.endsWith('.js'));
    const shared=files.find(n=>fs.readFileSync(path.join(chunks,n),'utf8').includes('Reference files are unavailable'));
    assert.ok(shared,'Missing compiled spatial worker');
    const sharedId=shared.split('.')[0];
    const entry=files.find(n=>{const s=fs.readFileSync(path.join(chunks,n),'utf8');return s.length<10000&&s.includes('importScripts')&&s.includes('_N_E=')&&s.includes(sharedId)});
    assert.ok(entry,'Missing spatial worker bootstrap');
    const vertices=[0,0,0,1000,0,0,1000,1000,0,0,1000,0],indices=[0,1,2,0,2,3],mesh=new ArrayBuffer(16+vertices.length*4+indices.length*4),header=new DataView(mesh);
    [0x484d5741,1,4,2].forEach((n,i)=>header.setUint32(i*4,n,true));new Float32Array(mesh,16,vertices.length).set(vertices);new Uint32Array(mesh,16+vertices.length*4).set(indices);
    const sha=value=>createHash('sha256').update(value).digest('hex');
    const ref={format:'esim-spatial-reference',version:1,mapId:'Mirage',sourceMap:'isolated-fixture',sourceVersion:'worker-test',sourceUrl:'test',meshSha256:sha(Buffer.from(mesh)),areas:[{id:1,hull:0,flags:'0',movable:4294967295,corners:[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0]],edges:[],laddersAbove:[],laddersBelow:[]}],ladders:[],radars:{upper:'/test.png'},transform:{pos_x:0,pos_y:1000,scale:1}};
    const messages=[],context=vm.createContext({console,TextEncoder,TextDecoder,URL,performance,crypto:webcrypto,structuredClone,setTimeout,clearTimeout,postMessage:m=>messages.push(m),fetch:async url=>{
        if(url==='/map-studio/spatial/Mirage.json')return {ok:true,json:async()=>structuredClone(ref)};
        if(url==='/map-studio/spatial/Mirage.mesh')return {ok:true,arrayBuffer:async()=>mesh.slice(0)};
        throw Error(`Unexpected fixture fetch ${url}`);
    }});
    context.self=context;
    context.importScripts=(...urls)=>urls.forEach(url=>{
        assert.ok(url.startsWith('/_next/static/chunks/'));
        const file=path.resolve(next,url.slice('/_next/'.length));assert.ok(file.startsWith(chunks+path.sep));
        vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
    });
    vm.runInContext(fs.readFileSync(path.join(chunks,entry),'utf8'),context,{filename:entry});await context._N_E;
    assert.equal(typeof context.onmessage,'function');
    const ask=async data=>{messages.length=0;await context.onmessage({data});assert.equal(messages.length,1);const result=messages[0];assert.notEqual(result.type,'error',result.message);return result};
    assert.equal((await ask({type:'load',mapId:'Mirage'})).type,'ready');
    const p=(x,y)=>({area:1,point:[x,y,0]});
    const project={format:'esim-spatial-lab',version:1,mapId:'Mirage',sourceVersion:ref.sourceVersion,a:null,b:null,blocked:[],links:[],settings:{height:72,speed:220,ladders:false},teams:{version:1,seed:13,seconds:12,roundSeconds:10,bombSeconds:12,plantSeconds:3,defuseSeconds:5,openingSeconds:10,communicationMs:500,memorySeconds:4,skill:{T:.7,CT:.7},economy:'balanced',guns:false,initialBomb:'carried',carrier:'T1',objective:'A',sites:{A:p(600,400),B:p(800,800)},actors:[{id:'T1',side:'T',role:'entry',start:p(200,400),station:p(200,400),yaw:0,health:100,armor:100,ammo:30},{id:'CT1',side:'CT',role:'anchor',start:p(600,400),station:p(600,400),yaw:180,health:100,armor:100,ammo:30}]}};
    const economy=weapon=>({cash:2000,weapon,hasArmor:true,hasHelmet:false,hasKit:false,armorPoints:37,utility:[]});
    const request={type:'career-round-preview',id:'owned-round',project,binding:{matchId:'fixture',mapId:'Mirage',roundNumber:1,homeTeamId:'home',awayTeamId:'away',homeSide:'T',players:[{actorId:'T1',playerId:'p1',teamId:'home'},{actorId:'CT1',playerId:'p2',teamId:'away'}]},players:['p1','p2'].map(id=>({id,rifle:75,awp:60,pistol:70,reaction:75,tactic:60})),settlement:{version:1,mode:'preview',matchId:'fixture',mapId:'Mirage',homeTeamId:'home',awayTeamId:'away',nextRound:1,homeScore:0,awayScore:0,homeLossStreak:0,awayLossStreak:0,homeEconomy:{p1:economy('ak47')},awayEconomy:{p2:economy('m4a4')},receipts:{}}};
    const first=await ask(structuredClone(request)),repeat=await ask(structuredClone(request));
    assert.equal(first.type,'career-round-preview-result');assert.equal(first.id,request.id);assert.equal(first.replay.sha256,repeat.replay.sha256);
    const expectedEngine=fs.readFileSync(path.join(root,'engine/spatial/round-replay.ts'),'utf8').match(/export const SPATIAL_ROUND_ENGINE = '([^']+)' as const/)?.[1];
    assert.ok(expectedEngine,'Missing source engine version');
    assert.equal(first.replay.engine,expectedEngine);assert.equal(first.settlement.nextRound,2);assert.equal(first.settlement.homeScore+first.settlement.awayScore,1);
    assert.equal(first.replay.project.teams.actors[0].armor,37);
    const {sha256,...body}=first.replay;assert.equal(sha(JSON.stringify(body)),sha256);
    const report={bootstrap:entry,shared,engine:first.replay.engine,sha256,repeated:true,actors:2,scope:'Actual production geometry-worker code, isolated two-player floor fixture; no career storage or browser UI.'};
    fs.writeFileSync(path.join(root,`tmp/${expectedEngine}-worker-check.json`),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
