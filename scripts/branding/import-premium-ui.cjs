const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'esport-ui-assets'),dest=path.join(root,'public/esport-ui-assets');
async function main(){
 const files=[];
 for(const group of ['backgrounds','facilities','equipment','crests']){
  fs.mkdirSync(path.join(dest,group),{recursive:true});
  for(const name of fs.readdirSync(path.join(source,group)).filter(n=>n.endsWith('.png')&&!n.includes('sheet'))){
   const src=path.join(source,group,name),original=path.join(dest,group,name),webp=original.replace(/\.png$/,'.webp');
   fs.copyFileSync(src,original);
   const width=group==='backgrounds'?1920:group==='facilities'?1100:640;
   // Supplied equipment tiles include the sheet divider and a sliver of the
   // neighboring row. Keep the source PNG; crop only that margin in delivery art.
   let delivery=sharp(src);
   if(group==='equipment') delivery=delivery.extract({left:4,top:4,width:707,height:500});
   await delivery.resize({width,withoutEnlargement:true}).webp({quality:84,effort:5}).toFile(webp);
   for(const file of [original,webp]){const bytes=fs.readFileSync(file),meta=await sharp(file).metadata();files.push({path:path.relative(root,file).replaceAll('\\','/'),source:path.relative(root,src).replaceAll('\\','/'),width:meta.width,height:meta.height,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}
  }
 }
 fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({portraitsImported:false,basis:'Owner supplied visual pack and requested integration; original PNGs retained, WebP derivatives made by existing sharp pipeline.',files},null,2));
 console.log(JSON.stringify({files:files.length,webpBytes:files.filter(x=>x.path.endsWith('.webp')).reduce((s,x)=>s+x.bytes,0)}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
