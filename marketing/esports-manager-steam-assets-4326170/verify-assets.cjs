const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const sharp=require('sharp');
async function main(){
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'asset-manifest.json'),'utf8'));
 const checks=[];
 for(const a of manifest.assets){
  const bytes=fs.readFileSync(path.join(__dirname,a.file));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),a.sha256);
  if(a.format==='ico'){
   assert.equal(bytes.readUInt16LE(2),1);assert.equal(bytes.readUInt16LE(4),a.sizes.length);
   for(let i=0;i<a.sizes.length;i++){const p=6+i*16;const n=bytes.readUInt32LE(p+8),offset=bytes.readUInt32LE(p+12);assert.ok(offset+n<=bytes.length);const m=await sharp(bytes.subarray(offset,offset+n)).metadata();assert.equal(m.width,a.sizes[i]);assert.equal(m.height,a.sizes[i]);}
  }else{
   const m=await sharp(bytes).metadata();assert.equal(m.width,a.width);assert.equal(m.height,a.height);assert.equal(m.format,a.format);
   if(a.field==='Library Logo'){assert.equal(m.hasAlpha,true);const s=await sharp(bytes).stats();assert.equal(s.channels[3].min,0);assert.equal(s.channels[3].max,255);const raw=await sharp(bytes).ensureAlpha().raw().toBuffer();assert.equal(raw[3],0);assert.equal(raw[raw.length-1],0);}
  }
  checks.push({file:a.file,passed:true});
 }
 const html=fs.readFileSync(path.join(__dirname,'START-HERE.html'),'utf8');
 new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
 for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){if(!/^https:|^#/.test(m[1]))assert.ok(fs.existsSync(path.join(__dirname,m[1])),m[1]);}
 const text=fs.readFileSync(path.join(__dirname,'copy/short-description.txt'),'utf8').trim();assert.ok(text.length<=300);
 const about=fs.readFileSync(path.join(__dirname,'copy/about-steam-bbcode.txt'),'utf8');
 for(const title of ['Build Your Squad','Run The Club','Shape Your Season'])assert.ok(about.includes('[h2]'+title+'[/h2]'));
 const result={passed:true,checkedFiles:checks.length,checks,shortDescriptionCharacters:text.length,previewLinks:'all local paths exist',previewScript:'parses',logo:'genuine alpha, transparent corners',ico:'all seven embedded PNG sizes decode',browserVisualReview:false,steamUpload:false};
 fs.writeFileSync(path.join(__dirname,'review/validation.json'),JSON.stringify(result,null,2)+'\n');
 console.log('PASS: '+checks.length+' assets, hashes, sizes/formats, ICO frames, logo alpha, local links and copy structure.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
