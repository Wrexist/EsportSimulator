const fs=require('fs'),crypto=require('crypto');
const library=JSON.parse(fs.readFileSync('data/map-studio-library.json','utf8'));
const rows=[];
for(const [map,floors] of Object.entries(library.maps)) for(const [floor,layer] of Object.entries(floors)) {
  for(const kind of ['outlines','lineups']) for(const mark of layer[kind]||[]) rows.push({map,floor,kind,id:mark.id,source:mark.source||null,sha256:crypto.createHash('sha256').update(JSON.stringify(mark)).digest('hex'),releaseDisposition:'hold',permission:'No redistribution receipt located'});
}
const draft=JSON.parse(fs.readFileSync('public/map-studio/drafts/mirage-user-areas-2026-09-13.json','utf8'));
const annotations=draft.annotations||draft.marks||[];
fs.writeFileSync('docs/launch-readiness/evidence/L08-lineup-inventory.json',JSON.stringify({provider:library.provider,sourceUrl:library.sourceUrl,rows,userDraft:{path:'public/map-studio/drafts/mirage-user-areas-2026-09-13.json',marks:annotations.map(mark=>({id:mark.id,source:mark.source||'owner-authored or source unspecified; inspect marking history',releaseDisposition:'preserve draft; review mixed sources before distribution'}))}},null,2)+'\n');
console.log(JSON.stringify({libraryMarks:rows.length,userDraftMarks:annotations.length}));
