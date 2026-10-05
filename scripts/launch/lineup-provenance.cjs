// Lineup provenance inventory: shipped library rows plus the archived (excluded) imports.
const fs=require('fs'),crypto=require('crypto');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const library=JSON.parse(fs.readFileSync('data/map-studio-library.json','utf8'));
const decision='docs/launch-readiness/evidence/L31-OWNER-LINEUP-EXCLUSION-DECISION.json';
const rows=[];
for(const [map,floors] of Object.entries(library.maps)) for(const [floor,layer] of Object.entries(floors)) {
  for(const kind of ['outlines','lineups']) for(const mark of layer[kind]||[]) rows.push({map,floor,kind,id:mark.id,source:mark.source||null,sha256:hash(mark),releaseDisposition:'hold',permission:'No redistribution receipt located'});
}
// Imported third-party lineups are excluded from the 1.0 base game; list them so nothing is lost.
const manifest=JSON.parse(fs.readFileSync('raw-data/archived-lineups/README.json','utf8'));
const archive=JSON.parse(fs.readFileSync(manifest.libraryArchive,'utf8'));
const excluded=[];
for(const [map,floors] of Object.entries(archive.maps)) for(const [floor,layer] of Object.entries(floors)) {
  for(const mark of layer.lineups) excluded.push({map,floor,kind:'lineups',id:mark.id,source:mark.source||null,sha256:hash(mark),releaseDisposition:'excluded-from-1.0-base-game',evidence:decision});
  for(const item of layer.unplaced) excluded.push({map,floor,kind:'unplaced',id:item.id,url:item.url,releaseDisposition:'excluded-from-1.0-base-game',evidence:decision});
}
const draftPath='public/map-studio/drafts/mirage-user-areas-2026-09-13.json';
const draft=JSON.parse(fs.readFileSync(draftPath,'utf8'));
const annotations=draft.annotations||draft.marks||[];
fs.writeFileSync('docs/launch-readiness/evidence/L08-lineup-inventory.json',JSON.stringify({provider:library.provider,libraryVersion:library.version,rows,
  excluded:{provider:archive.provider,sourceUrl:archive.sourceUrl,archive:manifest.libraryArchive,draftArchive:manifest.draftArchive,decision,shipped:false,rows:excluded,
    drafts:manifest.drafts.map(({path,archivedOriginal,removedLineups})=>({path,archivedOriginal,removedLineups}))},
  userDraft:{path:draftPath,marks:annotations.map(mark=>({id:mark.id,source:mark.source||'owner-authored or source unspecified; inspect marking history',releaseDisposition:'preserve draft; review mixed sources before distribution'}))}},null,2)+'\n');
console.log(JSON.stringify({libraryMarks:rows.length,excludedRecords:excluded.length,userDraftMarks:annotations.length}));
