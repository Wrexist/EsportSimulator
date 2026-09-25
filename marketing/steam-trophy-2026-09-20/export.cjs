const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const root=__dirname,project=path.resolve(root,'../..'),old=path.join(root,'../esports-manager-steam-assets-4326170'),out=path.join(root,'UPLOAD-READY');
const source=n=>path.join(root,'sources',n), original=path.join(root,'../approved-brand/ESM_LOGO.png');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const assets=[];
const blank=(w,h)=>sharp({create:{width:w,height:h,channels:4,background:{r:6,g:13,b:21,alpha:1}}});
const transparent=(w,h)=>sharp({create:{width:w,height:h,channels:4,background:{r:0,g:0,b:0,alpha:0}}});
const svg=(w,h,body)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);
const fade=(w,h)=>svg(w,h,'<defs><linearGradient id="f" x2="0" y2="1"><stop offset="0" stop-color="#060d15" stop-opacity="0"/><stop offset=".45" stop-color="#060d15" stop-opacity=".88"/><stop offset="1" stop-color="#060d15"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/>');
async function resized(p,w,h,fit='contain'){return sharp(p).resize(w,h,{fit,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();}
async function write(file,pipeline,w,h,field,kind='promotional artwork'){
 const dest=path.join(out,file);fs.mkdirSync(path.dirname(dest),{recursive:true});await pipeline.png().toFile(dest);
 const m=await sharp(dest).metadata();if(m.width!==w||m.height!==h||m.format!=='png')throw Error('Invalid export '+file);
 assets.push({file,width:w,height:h,field,kind,sha256:hash(fs.readFileSync(dest)),alpha:m.hasAlpha});
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 // Every placement uses the owner's exact raster source, resized without repainting.
 const trophy=await resized(original,340,340);
 const stacked=await transparent(800,800).composite([{input:trophy,left:230,top:0},{input:await resized(source('title.svg'),800,400),left:0,top:385}]).png().toBuffer();
 const horizontal=await transparent(1280,300).composite([{input:await resized(original,300,300),left:0,top:0},{input:await resized(source('compact-title.svg'),950,230),left:325,top:36}]).png().toBuffer();
 fs.writeFileSync(source('lockup-stacked.png'),stacked);fs.writeFileSync(source('lockup-horizontal.png'),horizontal);
 async function cap(file,bg,w,h,mode,field){
  const layers=[];
  if(mode==='small')layers.push({input:await resized(horizontal,w-24,h-30),left:12,top:15});
  else if(mode==='portrait'){
   const size=Math.round(w*.78);layers.push({input:await resized(stacked,size,size),left:Math.round((w-size)/2),top:Math.round(h*.025)});
  }else{
   const size=Math.round(h*.78);layers.push({input:await resized(stacked,size,size),left:Math.round(w*.045),top:Math.round(h*.1)});
  }
  await write(file,sharp(bg).resize(w,h,{fit:'cover'}).composite(layers),w,h,field);
 }
 const mainbg=path.join(old,'brand-v2/main-clean.png'),vertbg=path.join(old,'brand-v2/vertical-clean.png'),libbg=path.join(old,'brand-v2/library-clean.png');
 await cap('01-STORE/main_capsule_1232x706.png',mainbg,1232,706,'landscape','Main Capsule');
 await cap('01-STORE/header_capsule_920x430.png',mainbg,920,430,'landscape','Header Capsule');
 await cap('01-STORE/small_capsule_462x174.png',mainbg,462,174,'small','Small Capsule');
 await cap('01-STORE/vertical_capsule_748x896.png',vertbg,748,896,'portrait','Vertical Capsule');
 await cap('02-LIBRARY/library_capsule_600x900.png',libbg,600,900,'portrait','Library Capsule');
 await cap('02-LIBRARY/library_header_920x430.png',mainbg,920,430,'landscape','Library Header');
 await write('02-LIBRARY/library_logo_1280x720.png',transparent(1280,720).composite([{input:horizontal,left:0,top:210}]),1280,720,'Library Logo','transparent logo');
 await write('02-LIBRARY/library_hero_3840x1240.png',sharp(path.join(old,'upload/library/library_hero_3840x1240.png')).resize(3840,1240),3840,1240,'Library Hero','background without logo (Steam layers the logo separately)');
 await write('01-STORE/page_background_1438x810.png',sharp(path.join(old,'upload/store/page_background_1438x810.png')).resize(1438,810),1438,810,'Page Background','background without overlaid logo');
 const coach=await resized(source('coach.png'),640,960);
 const mark=await resized(horizontal,430,101);
 for(const [name,kicker,a,b] of require('./sources/copy.json')){
  const screenshot=source('gameplay/'+name+'.png');
  // Real screenshot crop, uniform resize, no generative redraw or data changes.
  const screen=await sharp(screenshot).extract({left:215,top:80,width:1560,height:970}).resize(1510,939).png().toBuffer();
  const panel=await blank(1920,1080).composite([
   {input:screen,left:38,top:123},
   {input:coach,left:1280,top:120},
   {input:fade(1920,410),left:0,top:670},
   {input:mark,left:48,top:10},
   {input:await resized(source(name+'.svg'),1120,308),left:72,top:725},
   {input:svg(1920,40,'<text x="72" y="24" font-family="Arial" font-size="13" letter-spacing="3" fill="#82909c">GAMEPLAY + PROMOTIONAL CHARACTER COMPOSITE</text>'),left:0,top:1035}
  ]).png().toBuffer();
  await write('03-ABOUT-ONLY/'+name+'_1920x1080.png',sharp(panel),1920,1080,'About This Game / promotional composite');
  await write('03-ABOUT-ONLY/compact/'+name+'_800x450.png',sharp(panel).resize(800,450),800,450,'About This Game / compact promotional composite');
  await write('06-SCREENSHOTS/'+name+'.png',sharp(screenshot),1920,1080,'Screenshot Assets','unaltered gameplay capture');
 }
 for(const name of ['01_build_your_squad','02_run_the_club','03_shape_your_season']){
  await write('03-ABOUT-ONLY/editorial/'+name+'_1460x600.png',sharp(path.join(old,'upload/about',name+'_1460x600.png')).composite([{input:await resized(horizontal,360,85),left:40,top:22}]),1460,600,'About This Game / editorial illustration');
 }
 for(const size of [256,512])await write('04-APP-ICONS/shortcut_icon_'+size+'.png',sharp(original).resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}),size,size,'Shortcut Icon','exact owner logo resized');
 const jpg=path.join(out,'04-APP-ICONS/app_icon_184.jpg');await sharp(original).resize(184,184,{fit:'contain',background:'#060d15'}).flatten({background:'#060d15'}).jpeg({quality:98,chromaSubsampling:'4:4:4'}).toFile(jpg);
 assets.push({file:'04-APP-ICONS/app_icon_184.jpg',width:184,height:184,field:'App Icon',sha256:hash(fs.readFileSync(jpg))});
 fs.copyFileSync(path.join(project,'build/icon.ico'),path.join(out,'04-APP-ICONS/shortcut_icon.ico'));
 await cap('05-EVENTS/event_cover_800x450.png',mainbg,800,450,'landscape','Event Cover');
 await write('05-EVENTS/event_header_1920x622.png',sharp(mainbg).resize(1920,622,{fit:'cover'}).composite([{input:await resized(horizontal,740,174),left:72,top:225}]),1920,622,'Event Header');
 fs.copyFileSync(original,path.join(out,'04-APP-ICONS/ESM_LOGO-original.png'));
 const manifest={appId:4326170,date:'2026-09-20',uploaded:false,ownerLogo:hash(fs.readFileSync(original)),method:'Owner-authorized local composition, outlined Barlow typography, preserved gameplay captures; coach generated by built-in image_gen',assets};
 fs.writeFileSync(path.join(out,'asset-manifest.json'),JSON.stringify(manifest,null,2));
 const grouped={};for(const a of assets){const g=a.file.split('/')[0];(grouped[g]??=[]).push(a);}
 fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Esports Manager — trophy artwork pack</title><style>body{margin:0;background:#080f17;color:#fff8ea;font:16px/1.6 system-ui}main{max-width:1440px;margin:auto;padding:40px}h1{font-size:44px;margin:0}p{color:#b2bec9}nav{display:flex;gap:18px;flex-wrap:wrap}a{color:#ffd36a}section{margin-top:50px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{padding:16px;background:#111e2c;border:1px solid #293846;border-radius:12px}img{display:block;max-width:100%;max-height:620px;margin:auto;object-fit:contain}h3{font-size:17px}small{color:#9cabb6}code{overflow-wrap:anywhere}@media(max-width:800px){.grid{grid-template-columns:1fr}main{padding:20px}}</style><main><h1>Your club. Your identity.</h1><p>Approved transparent trophy • consistent white and gold typography • exact-size exports</p><p>Prepared locally, not uploaded. Gameplay captures remain unaltered. Character composites and editorial illustrations belong in About This Game.</p><nav>${Object.keys(grouped).map(g=>`<a href="#${g}">${g}</a>`).join('')}</nav>${Object.entries(grouped).map(([g,items])=>`<section id="${g}"><h2>${g}</h2><div class="grid">${items.filter(a=>!a.file.includes('/compact/')).map(a=>`<article><a href="UPLOAD-READY/${a.file}"><img src="UPLOAD-READY/${a.file}" loading="lazy" alt="${a.field}"></a><h3>${a.field}</h3><small>${a.width} × ${a.height}</small><p><code>${a.file}</code></p></article>`).join('')}</div></section>`).join('')}</main></html>`);
 console.log(JSON.stringify({images:assets.length,validated:true,output:out}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
