// The owner's informed distribution instruction is recorded separately from a source license.
const fs=require('node:fs'),path=require('node:path');
const {inventory}=require('./content-provenance.cjs');
const root=path.resolve(__dirname,'../..');
const evidence='docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json';
if(fs.existsSync(path.join(root,evidence))) throw new Error('Decision already recorded; changed bytes require a new decision.');
const files=inventory().filter(row=>row.path==='data/map-studio-library.json'||/^public\/map-studio\/drafts\/[^/]+\.json$/.test(row.path));
const record={recordedAt:new Date().toISOString(),statement:'Ship everything',decision:'ship-with-unverified-source-permission',
  context:'Owner was asked whether to keep the imported CS2Nades collection local or wait for permission and explicitly requested inclusion instead.',
  limitations:['This is the owner release decision, not permission from CS2Nades or an independent license verification.', 'Source-permission status remains unverified.', 'Applies only to listed exact bytes. Original real-player photographs and original team logos remain excluded.'],
  files:files.map(({path,sha256,bytes})=>({path,sha256,bytes}))};
const ledgerPath=path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
const backup=path.join(root,'tmp/artwork-source-check/L08-before-owner-lineup-decision.json');
if(!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
for(const file of files){
  const previous=ledger.files.find(row=>row.path===file.path);
  const next={...previous,...file,evidence,license:'UNVERIFIED',permission:null,
    allowedUse:'Owner directed inclusion in this Steam release despite the stated missing source-permission record.',
    releaseDisposition:'include',reviewBasis:'explicit-owner-release-decision',sourcePermissionStatus:'unverified'};
  if(previous)Object.assign(previous,next);else ledger.files.push(next);
}
fs.writeFileSync(path.join(root,evidence),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(`Recorded owner-directed inclusion of ${files.length} lineup/draft files. Source permission remains unverified.`);
