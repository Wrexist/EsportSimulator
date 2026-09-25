// Actual production bundle in Node vm. This does not emulate Chromium rendering or worker transport.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { verifyWorkerBuild } = require('../verify-worker-build.cjs');
const root = path.resolve(__dirname, '../..');
const label = process.argv.find(a => a.startsWith('--label='))?.split('=')[1] || 'baseline';
assert.match(label, /^[a-z0-9-]+$/);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(save) {
    const {updatedAt,lastPlayedAt,integrityHash,...durable}=save;
    const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => [k,ordered(v)])) : value;
    return JSON.stringify(ordered(durable));
}
async function main() {
    const start = performance.now();
    const realm = await verifyWorkerBuild();
    const startupMs = performance.now()-start;
    const measurements=[];
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'tmp/l27-fixtures/manifest.json')));
    for (const entry of manifest.entries) {
        const bytes=fs.readFileSync(path.join(root,`tmp/l27-fixtures/${entry.name}.json`));
        assert.equal(hash(bytes),entry.sha256);
        const original=JSON.parse(bytes);
        const times=[], hashes=[];
        for (let i=-1;i<6;i++) {
            realm.messages.length=0;
            const input=structuredClone(original);
            const started=performance.now();
            await realm.context.onmessage({data:{type:'PROCESS_WEEK',requestId:i,save:input,config:{playerTeamId:input.playerTeamId,trainingFocus:[]},rngSeed:manifest.seed}});
            const elapsed=performance.now()-started;
            const result=realm.messages.find(message=>message.type==='RESULT');
            assert.ok(result?.result.success,JSON.stringify(realm.messages));
            assert.equal(realm.durableOpens(),0);
            if (i>=0) { times.push(elapsed);hashes.push(hash(canonical(result.save)+':'+result.rngState)); }
        }
        assert.equal(new Set(hashes).size,1,'Bundle output must be stable');
        const sorted=[...times].sort((a,b)=>a-b);
        measurements.push({scenario:entry.name,inputHash:entry.sha256,outputHash:hashes[0],samplesMs:times,medianMs:(sorted[2]+sorted[3])/2,p95Ms:sorted[5]});
    }
    const result={version:1,label,build:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),worker:path.basename(realm.entry),workerHash:hash(fs.readFileSync(realm.entry)),host:{cpu:os.cpus()[0].model,node:process.version,platform:process.platform},startupMs,measurements,limitation:'Production bundle executed in Node vm, six samples and one warmup; no actual browser worker scheduling, rendering, disk I/O or packaged Electron acceptance'};
    fs.writeFileSync(path.join(root,`docs/launch-readiness/evidence/L27-worker-${label}.json`),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1});
