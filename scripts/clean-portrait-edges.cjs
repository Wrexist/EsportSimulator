// Local, reviewed portrait cleanup. Prepare previews first; apply only unchanged inputs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const audit = path.join(root, 'tmp/portrait-review/edge-audit.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inside(base, relative) {
  const target = path.resolve(base, relative);
  if (!target.startsWith(base + path.sep)) throw new Error('Path leaves intended directory');
  return target;
}

function cleanAlpha(data, width, height) {
  const count = width * height;
  const background = new Uint8Array(count), queue = new Int32Array(count);
  let read = 0, write = 0;
  // Flood only neutral, bright pixels connected to existing transparency.
  // This does not globally key out white: enclosed highlights stay untouched.
  const isMatte = i => {
    const r=data[i*4],g=data[i*4+1],b=data[i*4+2];
    return Math.min(r,g,b) >= 180 && Math.max(r,g,b)-Math.min(r,g,b) <= 48;
  };
  for(let i=0;i<count;i++) if(data[i*4+3]<8) {background[i]=1;queue[write++]=i;}
  while(read<write) {
    const i=queue[read++],x=i%width,y=Math.floor(i/width);
    for(const n of [x>0?i-1:-1,x<width-1?i+1:-1,y>0?i-width:-1,y<height-1?i+width:-1]) {
      if(n<0||background[n]||!isMatte(n)) continue;
      background[n]=1;queue[write++]=n;
    }
  }
  const alpha = new Uint8Array(count);
  for(let i=0;i<count;i++) alpha[i]=background[i]?0:data[i*4+3];
  const result = Buffer.from(data);
  let changed=0,removed=0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=y*width+x;
    // A one-pixel subpixel blend softens the new cut without a hard jagged mask.
    let minimum=alpha[i];
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      const xx=x+dx,yy=y+dy;
      if(xx>=0&&xx<width&&yy>=0&&yy<height) {
        const neighbor=yy*width+xx;
        if(background[neighbor] && data[neighbor*4+3]>=8) minimum=Math.min(minimum,alpha[neighbor]);
      }
    }
    const next=Math.round((alpha[i]+minimum)/2);
    if(next!==data[i*4+3]) changed++;
    removed+=data[i*4+3]-next;
    result[i*4+3]=next;
  }
  // Interior facial pixels must be byte-identical, including opacity.
  for(let y=Math.floor(height*.30);y<height*.42;y++) for(let x=Math.floor(width*.42);x<width*.58;x++) {
    const i=(y*width+x)*4;
    if(!data.subarray(i,i+4).equals(result.subarray(i,i+4))) throw new Error('Protected face region changed at '+x+','+y+' '+[...data.subarray(i,i+4)]+' -> '+[...result.subarray(i,i+4)]);
  }
  return {data:result,changed,removedArea:removed/255};
}

async function main() {
  if(process.argv[2]==='--apply') {
    const run = inside(path.join(root,'tmp/portrait-review'),process.argv[3]||'');
    const manifest=JSON.parse(fs.readFileSync(path.join(run,'manifest.json')));
    // Validate the whole batch before making any replacement.
    for(const row of manifest.files) {
      if(hash(fs.readFileSync(inside(root,row.file)))!==row.before) throw new Error('Original changed: '+row.file);
      if(hash(fs.readFileSync(inside(run,row.staged)))!==row.after) throw new Error('Preview changed: '+row.file);
    }
    for(const row of manifest.files) {
      const target=inside(root,row.file),temporary=target+'.edge-cleanup.tmp';
      fs.copyFileSync(inside(run,row.staged),temporary,fs.constants.COPYFILE_EXCL);
      fs.renameSync(temporary,target);
      row.applied=true;
      fs.writeFileSync(path.join(run,'manifest.json'),JSON.stringify(manifest,null,2));
    }
    console.log('Applied '+manifest.files.length+' reviewed assets. Backups: '+path.join(run,'originals'));
    return;
  }
  const candidates=JSON.parse(fs.readFileSync(audit)).filter(row=>row.ratio>.18);
  const run=fs.mkdtempSync(path.join(root,'tmp/portrait-review/cleanup-'));
  const manifest={method:'connected-white-matte-alpha-only',files:[]};
  const tiles=[];
  for(let index=0;index<candidates.length;index++) {
    const row=candidates[index],relative='public'+row.src,file=inside(root,relative);
    const original=fs.readFileSync(file),meta=await sharp(original).metadata();
    if(!meta.hasAlpha) throw new Error('Source lacks transparency: '+file);
    const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let clean;
    try { clean=cleanAlpha(data,info.width,info.height); } catch(error) {throw new Error(file+': '+error.message);}
    const staged='cleaned/'+relative,backup='originals/'+relative;
    fs.mkdirSync(path.dirname(inside(run,staged)),{recursive:true});
    fs.mkdirSync(path.dirname(inside(run,backup)),{recursive:true});
    fs.writeFileSync(inside(run,backup),original,{flag:'wx'});
    const output=await sharp(clean.data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
    fs.writeFileSync(inside(run,staged),output,{flag:'wx'});
    manifest.files.push({file:relative,staged,backup,before:hash(original),after:hash(output),changedPixels:clean.changed,removedArea:clean.removedArea,players:row.players});
    const webpRelative=relative.replace(/\.png$/,'.webp');
    if(fs.existsSync(inside(root,webpRelative))) {
      const originalWebp=fs.readFileSync(inside(root,webpRelative));
      const cleanedWebp=await sharp(output).webp({quality:80,effort:4}).toBuffer();
      const webpStaged='cleaned/'+webpRelative,webpBackup='originals/'+webpRelative;
      fs.writeFileSync(inside(run,webpBackup),originalWebp,{flag:'wx'});
      fs.writeFileSync(inside(run,webpStaged),cleanedWebp,{flag:'wx'});
      manifest.files.push({file:webpRelative,staged:webpStaged,backup:webpBackup,before:hash(originalWebp),after:hash(cleanedWebp)});
    }
    for(let side=0;side<2;side++) {
      const tile=await sharp(side?output:original).resize(210,210).flatten({background:'#172231'}).png().toBuffer();
      tiles.push({input:tile,left:(index%3)*440+side*215,top:Math.floor(index/3)*238});
    }
    const label=Buffer.from('<svg width="430" height="24"><text x="5" y="17" fill="white" font-size="13">'+path.basename(file)+' - before / after</text></svg>');
    tiles.push({input:label,left:(index%3)*440,top:Math.floor(index/3)*238+212});
  }
  fs.writeFileSync(path.join(run,'manifest.json'),JSON.stringify(manifest,null,2));
  await sharp({create:{width:1320,height:Math.ceil(candidates.length/3)*238,channels:3,background:'#172231'}}).composite(tiles).png().toFile(path.join(run,'comparison.png'));
  console.log(run);
}
if(require.main===module) main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={cleanAlpha};

