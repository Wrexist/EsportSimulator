const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname;
const old = path.resolve(root, '../steam-trophy-2026-09-20');
const out = path.join(root, 'UPLOAD-READY');
const logo = path.resolve(root, '../approved-brand/ESM_LOGO.png');
const landscape = path.join(root, 'sources/arena-landscape.png');
const portrait = path.join(root, 'sources/arena-portrait.png');
const manifest = [];
const svg = (w,h,s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${s}</svg>`);
const clear = (w,h) => sharp({create:{width:w,height:h,channels:4,background:'#00000000'}});
const resize = (p,w,h) => sharp(p).resize(w,h,{fit:'contain',background:'#00000000'}).png().toBuffer();
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
async function save(name, pipeline, w,h,destination,kind='promotional illustration') {
  const p=path.join(out,name); fs.mkdirSync(path.dirname(p),{recursive:true});
  await pipeline.png().toFile(p);
  const m=await sharp(p).metadata();
  if(m.width!==w || m.height!==h) throw Error('Wrong dimensions: '+name);
  manifest.push({file:name,width:w,height:h,destination,kind,sha256:hash(fs.readFileSync(p)),alpha:m.hasAlpha});
}
async function main(){
  const title=path.join(old,'sources/title.svg');
  const horizontal=path.join(old,'sources/lockup-horizontal.png');
  async function capsule(name,w,h,vertical=false,small=false){
    const layers=[];
    if(small){
      layers.push({input:svg(w,h,'<rect width="100%" height="100%" fill="#07101e" opacity=".8"/>'),left:0,top:0});
      layers.push({input:await resize(horizontal,w-28,h-30),left:14,top:15});
    }else if(vertical){
      const tw=Math.round(w*.76), th=Math.round(tw/2);
      const ls=Math.round(w*.22);
      layers.push({input:await resize(logo,ls,ls),left:Math.round((w-ls)/2),top:Math.round(h*.035)});
      layers.push({input:await resize(title,tw,th),left:Math.round((w-tw)/2),top:Math.round(h*.035)+ls+18});
    }else{
      const tw=Math.round(w*.40), th=Math.round(tw/2), ls=Math.round(h*.24);
      const top=Math.round((h-ls-th-22)/2);
      layers.push({input:await resize(logo,ls,ls),left:Math.round(w*.055+(tw-ls)/2),top});
      layers.push({input:await resize(title,tw,th),left:Math.round(w*.055),top:top+ls+22});
    }
    await save(name,sharp(vertical?portrait:landscape).resize(w,h,{fit:'cover'}).composite(layers),w,h,name.startsWith('02')?'Library Assets':'Store Assets');
  }
  await capsule('01-STORE/header_920x430.png',920,430);
  await capsule('01-STORE/main_1232x706.png',1232,706);
  await capsule('01-STORE/small_462x174.png',462,174,false,true);
  await capsule('01-STORE/vertical_748x896.png',748,896,true);
  await save('01-STORE/background_1438x810.png',sharp(landscape).resize(1438,810).blur(5).modulate({brightness:.35,saturation:.65}),1438,810,'Store Assets / Page Background','decorative background');
  await capsule('02-LIBRARY/capsule_600x900.png',600,900,true);
  await capsule('02-LIBRARY/header_920x430.png',920,430);
  await save('02-LIBRARY/hero_3840x1240.png',sharp(landscape).resize(3840,1240,{fit:'cover',position:'north'}),3840,1240,'Library Assets / Hero','unbranded background; separate logo overlay');
  await save('02-LIBRARY/logo_1280x300.png',clear(1280,300).composite([{input:await resize(horizontal,1220,286),left:30,top:7}]),1280,300,'Library Assets / Logo','transparent exact-owner-logo lockup');
  // Promotional panels are explicitly separate from genuine screenshot files.
  const about=[['01-build-your-team','04-scouting'],['02-run-your-club','07-contracts-and-budget'],['03-shape-your-season','08-club-overview']];
  const backgrounds=[path.join(root,'sources/team-practice.png'),path.join(root,'sources/club-hq.png'),landscape];
  for(let i=0;i<about.length;i++){
    const [name,headline]=about[i];
    await save(`03-ABOUT-ONLY/${name}_1460x600.png`,sharp(backgrounds[i]).resize(1460,600,{fit:'cover'}).composite([
      {input:svg(1460,600,'<defs><linearGradient id="f"><stop stop-color="#06101e" stop-opacity=".96"/><stop offset=".62" stop-color="#06101e" stop-opacity=".55"/><stop offset="1" stop-color="#06101e" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/>'),left:0,top:0},
      {input:await resize(horizontal,350,82),left:52,top:32},
      {input:await resize(path.join(old,'sources',headline+'.svg'),820,226),left:52,top:273}
    ]),1460,600,'Description / About This Game');
  }
  // Preserve source gameplay pixels: no text, character, branding or invented HUD overlays.
  const order=['08-club-overview','01-live-match','04-scouting','02-player-development','05-build-your-club','06-equipment','03-match-analysis','07-contracts-and-budget'];
  for(let i=0;i<order.length;i++){
    const src=path.join(old,'sources/gameplay',order[i]+'.png');
    const m=await sharp(src).metadata();
    await save(`04-SCREENSHOTS/${String(i+1).padStart(2,'0')}-${order[i].slice(3)}.png`,sharp(src),m.width,m.height,'Screenshot Assets','unaltered archived gameplay capture; refresh against release build before publication');
  }
  for(const n of [256,512])await save(`05-ICONS/shortcut_${n}.png`,sharp(logo).resize(n,n,{fit:'contain',background:'#00000000'}),n,n,'App Admin / Shortcut Icon','exact owner logo');
  const iconDir=path.join(out,'05-ICONS');
  fs.copyFileSync(path.join(old,'UPLOAD-READY/04-APP-ICONS/shortcut_icon.ico'),path.join(iconDir,'shortcut.ico'));
  await sharp(logo).resize(184,184,{fit:'contain',background:'#08111f'}).flatten({background:'#08111f'}).jpeg({quality:98,chromaSubsampling:'4:4:4'}).toFile(path.join(iconDir,'app_184.jpg'));
  for(const name of ['shortcut.ico','app_184.jpg'])manifest.push({file:'05-ICONS/'+name,destination:'App Admin / Client Images',sha256:hash(fs.readFileSync(path.join(iconDir,name)))});
  await capsule('06-EVENTS/cover_800x450.png',800,450);
  await save('06-EVENTS/header_1920x622.png',sharp(landscape).resize(1920,622,{fit:'cover'}).composite([{input:await resize(horizontal,710,167),left:60,top:227}]),1920,622,'Event / announcement header');
  for(const side of ['left','right']){
    await save(`07-BROADCAST/${side}_199x433.png`,sharp(portrait).resize(199,433,{fit:'cover',position:side==='left'?'west':'east'}).modulate({brightness:.65}).composite([
      {input:await resize(logo,76,76),left:62,top:32},
      {input:await resize(title,171,86),left:14,top:126}
    ]),199,433,`Broadcast Assets / ${side} panel`);
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({appId:4326170,date:'2026-09-25',uploaded:false,ownerLogoSha256:hash(fs.readFileSync(logo)),assets:manifest},null,2));
  const tiles=[];
  for(const a of manifest.filter(a=>a.width && !a.file.startsWith('04') && !a.file.startsWith('05'))){
    const thumb=await sharp(path.join(out,a.file)).resize(460,260,{fit:'contain',background:'#101b2a'}).png().toBuffer();
    tiles.push({input:thumb,left:(tiles.length%3)*480+10,top:Math.floor(tiles.length/3)*300+10});
  }
  await sharp({create:{width:1440,height:Math.ceil(tiles.length/3)*300,channels:3,background:'#07101b'}}).composite(tiles).png().toFile(path.join(root,'contact-sheet.png'));
  const groups=[...new Set(manifest.map(a=>a.file.split('/')[0]))];
  fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="sv"><meta charset="utf-8"><title>Steam grafik — 4326170</title><style>body{background:#08111f;color:#f4f6fa;font:16px/1.6 system-ui;margin:36px auto;max-width:1200;padding:0 24px}h1{font-size:40px}p,small{color:#b6c4d7}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#122238;border:1px solid #334358;padding:16px;border-radius:14px}img{width:100%;height:300px;object-fit:contain}a{color:#ffd36a}code{overflow-wrap:anywhere}</style><h1>Esports Manager: FPS</h1><p>Samlad grafik • exakt trofélogotyp • marinblått, vitt och guld</p><p>Lokalt färdigställda filer. Uppladdning ej verifierad. Skärmbilderna är autentiska äldre spelbilder och ska uppdateras från slutbygget före publicering.</p>${groups.map(g=>`<h2>${g}</h2><div class="grid">${manifest.filter(a=>a.file.startsWith(g)).map(a=>`<article>${a.file.endsWith('.ico')?'':`<img src="UPLOAD-READY/${a.file}" alt="${a.destination}">`}<p><a href="UPLOAD-READY/${a.file}">${a.file}</a></p><small>${a.width?`${a.width} × ${a.height} · `:''}${a.destination}</small></article>`).join('')}</div>`).join('')}</html>`);
  console.log(JSON.stringify({count:manifest.length,out,dimensionsVerified:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
