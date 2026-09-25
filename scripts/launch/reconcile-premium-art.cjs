// Reconcile only exact, documented project-art deliveries. Unknown bytes stay held.
const fs=require('node:fs'),crypto=require('node:crypto'),sharp=require('sharp');
const ledgerPath='docs/launch-readiness/evidence/L08-content-inventory.json';
const evidencePath='docs/launch-readiness/evidence/2026-09-25-premium-art-reconciliation.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function main(){
    const entries=[];
    const add=(path,source,basis)=>{const bytes=fs.readFileSync(path);entries.push({path,sha256:sha(bytes),bytes:bytes.length,source,basis})};
    for(const f of JSON.parse(fs.readFileSync('public/esport-ui-assets/manifest.json')).files){
        if(!/public\/esport-ui-assets\/(backgrounds|crests|equipment|facilities)\//.test(f.path))throw Error('Unexpected asset family');
        if(sha(fs.readFileSync(f.path))!==f.sha256)throw Error(`Changed delivery: ${f.path}`);
        if(!fs.existsSync(f.source))throw Error(`Missing supplied master: ${f.source}`);
        if(f.path.endsWith('.png')&&sha(fs.readFileSync(f.source))!==f.sha256)throw Error(`Master mismatch: ${f.path}`);
        add(f.path,f.source,'Owner-supplied generated visual pack, explicitly requested for game integration; exact delivery manifest matched.');
    }
    const generation=JSON.parse(fs.readFileSync('esport-ui-assets/equipment/tier-art-generation.json'));
    const delivery=JSON.parse(fs.readFileSync('public/esport-ui-assets/equipment/tiers/manifest.json'));
    for(const f of delivery.files){
        if(!generation.entries.some(e=>e.id===f.id))throw Error(`Missing generation entry: ${f.id}`);
        const source=`esport-ui-assets/equipment/tiers/${f.id}.png`,png=f.path.replace(/\.webp$/,'.png');
        const expected=await sharp(source).trim().resize(576,416,{fit:'contain',background:'#00000000'}).extend({top:32,bottom:32,left:32,right:32,background:'#00000000'}).png().toBuffer();
        if(sha(expected)!==sha(fs.readFileSync(png)))throw Error(`PNG derivation mismatch: ${png}`);
        if(sha(fs.readFileSync(f.path))!==f.sha256)throw Error(`WebP manifest mismatch: ${f.path}`);
        for(const path of [png,f.path])add(path,source,'Original project equipment generated with image_gen at owner request; retained generation prompts and verified export derivation.');
    }
    for(const path of ['public/esport-ui-assets/manifest.json','public/esport-ui-assets/equipment/tiers/manifest.json'])add(path,'scripts/branding','Project-authored delivery metadata; no new third-party artwork.');
    const ledger=JSON.parse(fs.readFileSync(ledgerPath));
    const record={date:'2026-09-25',basis:'Existing owner instruction identifying generated references, supplied asset pack and requested original equipment; prior project-created-art confirmation retained. No new third-party permission inferred.',limitations:['Only exact listed asset bytes. Does not clear maps, lineups, unrelated assets, store media or future changes.'],files:entries};
    fs.writeFileSync('tmp/content-ledger-before-premium-reconciliation.json',JSON.stringify(ledger,null,2));
    for(const e of entries){
        const row={path:e.path,sha256:e.sha256,bytes:e.bytes,kind:'project-ui-art',source:e.source,evidence:evidencePath,license:'Project-created artwork; owner-attested origin',permission:e.basis,attribution:null,allowedUse:'Include these exact project-created game UI assets in the game and Steam release.',releaseDisposition:'include',reviewBasis:'owner-attested with matched delivery/generation records'};
        const i=ledger.files.findIndex(r=>r.path===row.path);if(i<0)ledger.files.push(row);else ledger.files[i]=row;
    }
    fs.writeFileSync(evidencePath,JSON.stringify(record,null,2)+'\n');
    fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
    console.log(`Reconciled ${entries.length} exact project-art records.`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
