// Deterministic export only. Original artwork is retained in masters/.
// Run from this repository: node marketing/steam-upload-pack-2026-09-14/export-assets.cjs --export
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = __dirname;
const specs = [
  ['store/main_capsule_1232x706.png','main.png',1232,706,'Main Capsule','required'],
  ['store/header_capsule_920x430.png','main.png',920,430,'Header Capsule','required'],
  ['store/small_capsule_462x174.png','main.png',462,174,'Small Capsule','required'],
  ['store/vertical_capsule_748x896.png','store-vertical.png',748,896,'Vertical Capsule','required'],
  ['store/page_background_1438x810.png','library-hero.png',1438,810,'Page Background','optional'],
  ['library/library_capsule_600x900.png','library-capsule.png',600,900,'Library Capsule','required'],
  ['library/library_header_920x430.png','main.png',920,430,'Library Header','required'],
  ['library/library_hero_3840x1240.png','library-hero.png',3840,1240,'Library Hero','required'],
  ['library/library_logo_1280x720.png','library-logo.png',1280,720,'Library Logo','required'],
  ['icons/shortcut_icon_256.png','app-icon.png',256,256,'Shortcut Icon','required'],
  ['icons/shortcut_icon_512.png','app-icon.png',512,512,'Shortcut Icon (larger alternative)','alternative'],
  ['icons/app_icon_184.jpg','app-icon.png',184,184,'App Icon','required'],
  ['about/01_build_your_squad_1460x600.png','feature-squad.png',1460,600,'About: Build Your Squad','optional'],
  ['about/02_run_the_club_1460x600.png','feature-club.png',1460,600,'About: Run The Club','optional'],
  ['about/03_shape_your_season_1460x600.png','feature-season.png',1460,600,'About: Shape Your Season','optional'],
  ['events/event_cover_800x450.png','main.png',800,450,'Event Cover','optional'],
  ['events/event_header_1920x622.png','library-hero.png',1920,622,'Event Header','optional'],
];
async function main() {
  if (!process.argv.includes('--export')) {
    console.log('Preparation only. Use --export to create the exact-size upload assets.');
    return;
  }
  // Validate every input first, so an incomplete pack cannot look successful.
  for (const source of new Set(specs.map(s=>s[1]))) {
    const m=await sharp(path.join(root,'masters',source)).metadata();
    if (!m.width || !m.height || m.format!=='png') throw new Error('Invalid master: '+source);
    if(source==='library-logo.png') {
      const stats=await sharp(path.join(root,'masters',source)).stats();
      if(!m.hasAlpha || stats.channels[3].min!==0 || stats.channels[3].max!==255) throw new Error('Library logo needs genuine transparency');
    }
  }
  const inventory=[];
  for (const [file,source,width,height,field,requirement] of specs) {
    const original=path.join(root,'masters',source);
    const meta=await sharp(original).metadata();
    let pipeline=sharp(original).toColourspace('srgb');
    if(source==='library-logo.png') pipeline=pipeline.resize(width,height,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}});
    else pipeline=pipeline.resize(width,height,{fit:'cover',position:'centre'}).flatten({background:'#08121e'});
    const buffer=await (file.endsWith('.jpg')?pipeline.jpeg({quality:97,chromaSubsampling:'4:4:4'}):pipeline.png({compressionLevel:9})).toBuffer();
    const output=path.join(root,'upload',file); fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,buffer);
    const actual=await sharp(buffer).metadata();
    if(actual.width!==width||actual.height!==height) throw new Error('Size mismatch: '+file);
    inventory.push({file:'upload/'+file,source:'masters/'+source,field,requirement,width,height,format:actual.format,hasAlpha:actual.hasAlpha,bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),sourceWidth:meta.width,sourceHeight:meta.height,upscaled:width>meta.width||height>meta.height});
  }
  // Multi-resolution Windows ICO with PNG-compressed image entries.
  const sizes=[16,24,32,48,64,128,256];
  const frames=await Promise.all(sizes.map(n=>sharp(path.join(root,'masters/app-icon.png')).resize(n,n).png().toBuffer()));
  const directory=Buffer.alloc(6+16*sizes.length);directory.writeUInt16LE(1,2);directory.writeUInt16LE(sizes.length,4);
  let offset=directory.length;
  for(let i=0;i<sizes.length;i++) {const p=6+i*16; directory[p]=sizes[i]===256?0:sizes[i];directory[p+1]=directory[p];directory.writeUInt16LE(1,p+4);directory.writeUInt16LE(32,p+6);directory.writeUInt32LE(frames[i].length,p+8);directory.writeUInt32LE(offset,p+12);offset+=frames[i].length;}
  const ico=Buffer.concat([directory,...frames]);fs.writeFileSync(path.join(root,'upload/icons/shortcut_icon.ico'),ico);
  inventory.push({file:'upload/icons/shortcut_icon.ico',source:'masters/app-icon.png',field:'Windows shortcut icon (alternative)',requirement:'alternative',format:'ico',sizes,bytes:ico.length,sha256:crypto.createHash('sha256').update(ico).digest('hex')});
  fs.writeFileSync(path.join(root,'asset-manifest.json'),JSON.stringify({appId:4326170,generatedWith:'built-in imagegen; deterministic local size/format exports',assets:inventory,screenshotGallery:'Pending current in-game captures; do not substitute generated artwork',steamUpload:'Not performed - no browser available'},null,2)+'\n');
  console.log('Validated '+inventory.length+' exact-size artwork/icon exports. Screenshot gallery remains separate.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
