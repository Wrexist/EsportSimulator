const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
  const relative='public/assets/flags/uz.svg';
  const target=path.join(root,relative);
  const prior=fs.readFileSync(target);
  if(prior.subarray(0,4).toString()!=='RIFF') throw new Error('Expected mislabeled WebP; refusing to replace another file.');
  const source='https://flagcdn.com/uz.svg';
  const response=await fetch(source,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`Flag source returned ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(!bytes.toString('utf8').includes('<svg') || bytes.toString('utf8').includes('<script')) throw new Error('Invalid SVG response');
  const backup='tmp/artwork-source-check/uz-original-mislabeled.webp';
  if(fs.existsSync(path.join(root,backup))) throw new Error('Backup exists; inspect before repeating repair.');
  fs.writeFileSync(path.join(root,backup),prior);
  fs.writeFileSync(target,bytes);
  const evidence='docs/launch-readiness/evidence/L31-UZ-FLAG-REPAIR.json';
  fs.writeFileSync(path.join(root,evidence),JSON.stringify({source,path:relative,sha256:hash(bytes),priorSha256:hash(prior),backup,permissionSource:'https://flagpedia.net/download',reason:'Replace WebP bytes incorrectly named .svg with original vendor SVG; no raster editing.'},null,2)+'\n');
  const ledgerPath=path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
  const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
  const row=ledger.files.find(row=>row.path===relative);
  Object.assign(row,{sha256:hash(bytes),bytes:bytes.length,evidence,source,license:'Public domain (Flagpedia vendor declaration)',permission:'Downloaded from importer-declared Flagcdn source; vendor permits commercial use.',attribution:'Flagpedia.net / Flagcdn.com',allowedUse:'Game distribution',releaseDisposition:'include',reviewBasis:'vendor-source-replacement'});
  fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
  console.log('Repaired Uzbekistan flag format; original preserved.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
