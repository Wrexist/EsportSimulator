const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const source = 'marketing/approved-brand/ESM_LOGO.png';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function main() {
 const original = fs.readFileSync(path.join(root, source));
 const meta = await sharp(original).metadata();
 if (!meta.hasAlpha) throw Error('Owner logo must retain alpha');
 const rows = [];
 const backupRoot = path.join(root, 'marketing/approved-brand/backups-before-transparent-trophy');
 async function write(file, bytes) {
  const target = path.join(root, file), backup = path.join(backupRoot, file);
  if (fs.existsSync(target) && !fs.existsSync(backup)) { fs.mkdirSync(path.dirname(backup), {recursive:true}); fs.copyFileSync(target, backup); }
  fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, bytes);
  rows.push({path:file, sha256:hash(bytes), bytes:bytes.length});
 }
 const resize = size => sharp(original).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 for (const [file,size] of [['public/logo.png',512],['build/icon.png',512],['public/branding/icon.png',256],['marketing/approved-brand/exports/steam-icon-256.png',256],['marketing/approved-brand/exports/game-icon-512.png',512]]) await write(file, await resize(size));
 const sizes=[16,24,32,48,64,128,256];
 const frames=await Promise.all(sizes.map(resize));
 const header=Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2); header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 frames.forEach((frame,i)=>{const p=6+16*i;header[p]=sizes[i]%256;header[p+1]=sizes[i]%256;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(frame.length,p+8);header.writeUInt32LE(offset,p+12);offset+=frame.length;});
 const ico=Buffer.concat([header,...frames]);
 for(const file of ['public/logo.ico','build/icon.ico','marketing/approved-brand/exports/game-icon.ico']) await write(file,ico);
 const evidence='docs/launch-readiness/evidence/OWNER-TROPHY-20260920.json';
 const proof={date:'2026-09-20',source,sourceSha256:hash(original),basis:'Owner supplied ESM_LOGO.png and explicitly authorized game and screenshot use. Local size exports authorized earlier. No independent third-party license verification asserted.',method:'Contain resize with transparent padding; no repainting or regeneration',files:rows};
 fs.writeFileSync(path.join(root,evidence),JSON.stringify(proof,null,2)+'\n');
 const ledgerPath=path.join(root,'docs/launch-readiness/evidence/L08-content-inventory.json');
 const ledger=JSON.parse(fs.readFileSync(ledgerPath,'utf8'));
 const ledgerBackup=path.join(backupRoot,'L08-content-inventory.json');
 if(!fs.existsSync(ledgerBackup)) fs.copyFileSync(ledgerPath,ledgerBackup);
 for(const row of rows.filter(r=>/^(public|build)\//.test(r.path))){
  const record={...row,kind:'marketing-branding',source,sourceSha256:hash(original),evidence,license:'Owner-supplied project artwork',permission:proof.basis,attribution:'Owner-supplied ESM trophy artwork',allowedUse:'Game icons and promotional artwork as authorized by owner',releaseDisposition:'include'};
  const index=ledger.files.findIndex(r=>r.path===row.path); if(index>=0) ledger.files[index]={...ledger.files[index],...record};else ledger.files.push(record);
 }
 fs.writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
 console.log(JSON.stringify({source:meta,outputs:rows.length,icoFrames:sizes,sourceSha256:hash(original)}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
