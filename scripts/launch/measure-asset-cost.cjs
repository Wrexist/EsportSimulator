const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const root=path.resolve(__dirname,'../..');
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]); }
function census(dir) {
    const files=walk(path.join(root,dir)).map(file=>({path:path.relative(root,file).replaceAll('\\','/'),bytes:fs.statSync(file).size}));
    const byExtension={};
    for(const file of files) {const ext=path.extname(file.path)||'(none)';byExtension[ext]=(byExtension[ext]||0)+file.bytes;}
    return {count:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),byExtension,largest:files.sort((a,b)=>b.bytes-a.bytes).slice(0,20)};
}
const chunks=walk(path.join(root,'.next/static/chunks')).filter(file=>file.endsWith('.js')).map(file=>{const bytes=fs.readFileSync(file);return {path:path.relative(root,file).replaceAll('\\','/'),bytes:bytes.length,gzipBytes:zlib.gzipSync(bytes).length};});
const result={version:1,build:fs.readFileSync(path.join(root,'.next/BUILD_ID'),'utf8').trim(),public:census('public'),jsChunks:{count:chunks.length,bytes:chunks.reduce((n,f)=>n+f.bytes,0),gzipBytes:chunks.reduce((n,f)=>n+f.gzipBytes,0),largest:chunks.sort((a,b)=>b.bytes-a.bytes).slice(0,15)},limitation:'On-disk public and build chunk census, not network transfer, loaded-per-route cost, decoded image memory or packaged inclusion. L08 holds remain.'};
fs.writeFileSync(path.join(root,'docs/launch-readiness/evidence/L27-asset-cost.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({publicFiles:result.public.count,publicBytes:result.public.bytes,chunkBytes:result.jsChunks.bytes,gzipBytes:result.jsChunks.gzipBytes}));
