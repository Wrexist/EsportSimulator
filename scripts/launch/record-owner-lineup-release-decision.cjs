// The owner's informed distribution instruction is recorded separately from a source license.
//   (default)               2026-09-16 "Ship everything" record (historical, one-shot)
//   --exclude-third-party   2026-10-04 decision: imported CS2Nades lineups excluded from the
//                           1.0 base game (archived in raw-data/archived-lineups); owner-authored
//                           marks and radar outlines in the same files keep shipping.
const fs=require('node:fs'),path=require('node:path');
const {inventory,OWNER_DECISIONS}=require('./content-provenance.cjs');
const root=path.resolve(__dirname,'../..');
const exclude=process.argv.includes('--exclude-third-party');
const evidence=exclude?'docs/launch-readiness/evidence/L31-OWNER-LINEUP-EXCLUSION-DECISION.json':'docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json';
if(fs.existsSync(path.join(root,evidence))) throw new Error('Decision already recorded; changed bytes require a new decision.');
const ledgerPath=path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
let files,record,update;
if(!exclude){
  files=inventory().filter(row=>row.path==='data/map-studio-library.json'||/^public\/map-studio\/drafts\/[^/]+\.json$/.test(row.path));
  record={recordedAt:new Date().toISOString(),statement:'Ship everything',decision:'ship-with-unverified-source-permission',
    context:'Owner was asked whether to keep the imported CS2Nades collection local or wait for permission and explicitly requested inclusion instead.',
    limitations:['This is the owner release decision, not permission from CS2Nades or an independent license verification.', 'Source-permission status remains unverified.', 'Applies only to listed exact bytes. Original real-player photographs and original team logos remain excluded.'],
    files:files.map(({path,sha256,bytes})=>({path,sha256,bytes}))};
  const backup=path.join(root,'tmp/artwork-source-check/L08-before-owner-lineup-decision.json');
  if(!fs.existsSync(backup)) fs.copyFileSync(ledgerPath,backup);
  update=()=>({evidence,license:'UNVERIFIED',permission:null,
    allowedUse:'Owner directed inclusion in this Steam release despite the stated missing source-permission record.',
    releaseDisposition:'include',reviewBasis:'explicit-owner-release-decision',sourcePermissionStatus:'unverified'});
}else{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'raw-data/archived-lineups/README.json'),'utf8'));
  const changed=new Set([manifest.library.path,...manifest.drafts.map(d=>d.path)]);
  const current=new Map(inventory().map(row=>[row.path,row]));
  files=[...changed].map(p=>{const row=current.get(p);if(!row)throw new Error(`Missing shipped file ${p}`);return row;});
  for(const file of files){
    const text=fs.readFileSync(path.join(root,file.path),'utf8');
    if(/cs2nades/i.test(text)) throw new Error(`${file.path} still contains imported CS2Nades content`);
  }
  const statement=OWNER_DECISIONS['exclude-third-party-lineups-ship-owner-content'];
  record={recordedAt:new Date().toISOString(),statement,decision:'exclude-third-party-lineups-ship-owner-content',
    supersedes:'docs/launch-readiness/evidence/L31-OWNER-LINEUP-RELEASE-DECISION.json',
    context:'Owner reversed the 2026-09-16 "Ship everything" lineup decision: no upstream redistribution permission exists for the imported CS2Nades lineups (audit A15). Removed records were archived, not deleted; source URLs were not stripped from retained content.',
    excluded:{disposition:'excluded-from-1.0-base-game',provider:'CS2Nades',archive:manifest.libraryArchive,draftArchive:manifest.draftArchive,
      libraryLineups:manifest.library.excludedLineups,libraryUnplaced:manifest.library.excludedUnplaced,
      draftLineups:manifest.drafts.reduce((n,d)=>n+d.removedLineups,0),draftFiles:manifest.drafts.length,
      archiveShipped:false,archiveNote:'raw-data/ is outside package.json build.files and is not imported by app code.'},
    limitations:['Remaining radar outlines and map derivatives keep their prior map-use basis; this is not a new license.','Existing player saves that already hold imported lineups keep them as user data; the game no longer adds them.','Applies only to listed exact bytes.'],
    files:files.map(({path,sha256,bytes})=>({path,sha256,bytes}))};
  update=(previous)=>({evidence,license:previous?.license||'UNVERIFIED',permission:null,
    kind:previous?.path==='data/map-studio-library.json'?'map-reference':previous?.kind,
    source:previous?.path==='data/map-studio-library.json'?'Radar outlines only; imported CS2Nades lineups excluded from 1.0':previous?.source,
    allowedUse:'Owner directed inclusion of owner-authored marks and radar outlines; imported third-party lineups excluded from 1.0 and archived.',
    releaseDisposition:'include',reviewBasis:'explicit-owner-exclusion-decision',sourcePermissionStatus:'third-party-lineups-excluded'});
}
for(const file of files){
  const previous=ledger.files.find(row=>row.path===file.path);
  const {kind,source,...bytes}=file;
  const next={...previous,...(exclude?(previous?bytes:file):file),...update(previous),...(exclude&&previous?{previousReview:{sha256:previous.sha256,bytes:previous.bytes,evidence:previous.evidence,reviewBasis:previous.reviewBasis}}:{})};
  if(previous)Object.assign(previous,next);else ledger.files.push(next);
}
if(exclude){
  // NOTICE.md drops its CS2Nades attribution sentence; it stays a project-authored notice.
  const notice=inventory().find(row=>row.path==='NOTICE.md'),row=ledger.files.find(r=>r.path==='NOTICE.md');
  if(notice&&row&&row.sha256!==notice.sha256){
    if(/cs2nades/i.test(fs.readFileSync(path.join(root,'NOTICE.md'),'utf8'))) throw new Error('NOTICE.md still credits CS2Nades content');
    row.previousReview={sha256:row.sha256,bytes:row.bytes,evidence:row.evidence,reviewBasis:row.reviewBasis};
    Object.assign(row,{sha256:notice.sha256,bytes:notice.bytes,noticeChange:`Third-party lineup attribution removed with the exclusion recorded in ${evidence}.`});
    record.alsoUpdated=[{path:'NOTICE.md',sha256:notice.sha256,bytes:notice.bytes,note:'Project-authored notice; release basis unchanged (L31-PROJECT-CONTENT-REVIEW), not covered by this decision.'}];
  }
}
fs.writeFileSync(path.join(root,evidence),JSON.stringify(record,null,2)+'\n');
fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
console.log(exclude?`Recorded owner exclusion of imported lineups; ${files.length} shipped files re-recorded.`:`Recorded owner-directed inclusion of ${files.length} lineup/draft files. Source permission remains unverified.`);
