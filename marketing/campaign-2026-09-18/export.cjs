const fs=require('fs');
const path=require('path');
const sharp=require('sharp');
const crypto=require('crypto');
async function main(){
 const entries=require('./sources.json');
 for(const name of ['masters','promotional-1920x1080','about-800x450'])fs.mkdirSync(path.join(__dirname,name),{recursive:true});
 const manifest=[];
 for(const e of entries){
  fs.copyFileSync(e.source,path.join(__dirname,'masters',e.file));
  for(const [folder,width,height] of [['promotional-1920x1080',1920,1080],['about-800x450',800,450]]){
   const out=path.join(__dirname,folder,e.file);
   await sharp(e.source).resize(width,height,{fit:'cover',position:'centre'}).png().toFile(out);
   const meta=await sharp(out).metadata();
   if(meta.width!==width||meta.height!==height||meta.format!=='png')throw Error('Invalid export '+out);
   manifest.push({file:folder+'/'+e.file,width,height,sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')});
  }
 }
 fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({method:'Built-in image_gen; locally resized under existing owner export authorization',kind:'Promotional concept artwork, not gameplay screenshots',uploaded:false,exports:manifest},null,2));
 fs.writeFileSync(path.join(__dirname,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Esports Manager — new campaign</title><style>body{margin:0;background:#09141f;color:#f8fafb;font:16px/1.5 system-ui}main{max-width:1400px;margin:auto;padding:40px 24px}h1{font-size:48px;letter-spacing:-2px;margin:0}p{color:#aabccc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}article:first-child{grid-column:1/-1}article{background:#142334;border:1px solid #304358;border-radius:12px;overflow:hidden}img{width:100%;display:block}h2{font-size:20px;padding:0 20px}a{color:#5de9d2}footer{margin-top:32px}@media(max-width:800px){.grid{grid-template-columns:1fr}h1{font-size:32px}}</style><main><h1>Build your dynasty.</h1><p>Eight promotional illustrations · warmer colour · character-led stories · bold, readable headlines</p><p>For About This Game and advertising. These are conceptual promotional scenes, not playable 3D environments or Steam screenshot-gallery replacements.</p><div class="grid">${entries.map(e=>`<article><a href="promotional-1920x1080/${e.file}"><img src="promotional-1920x1080/${e.file}" alt="${e.title}"></a><h2>${e.title}</h2></article>`).join('')}</div><footer><a href="prompts.json">Prompt set</a> · <a href="manifest.json">Export validation</a><p>Not uploaded. No sales or download uplift has been measured.</p></footer></main></html>`);
 console.log(JSON.stringify({masters:entries.length,exports:manifest.length,validated:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
