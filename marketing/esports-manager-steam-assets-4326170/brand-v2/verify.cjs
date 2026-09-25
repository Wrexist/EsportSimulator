const fs=require('fs'),path=require('path'),assert=require('assert/strict'),sharp=require('sharp'),crypto=require('crypto');
const root=path.join(path.dirname(__dirname),'UPLOAD-READY-v2');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'asset-manifest.json')));
 const required={'Main Capsule':[1232,706],'Header Capsule':[920,430],'Small Capsule':[462,174],'Vertical Capsule':[748,896],'Library Capsule':[600,900],'Library Header':[920,430],'Library Hero':[3840,1240],'Library Logo':[1280,720],'Page Background':[1438,810],'App Icon':[184,184],'Description extra image':[1460,600],'Event Cover':[800,450],'Event Header':[1920,622]};
 for(const a of manifest.assets){const b=fs.readFileSync(path.join(root,a.file));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),a.sha256);const m=await sharp(b).metadata();assert.deepEqual([m.width,m.height],[a.width,a.height]);if(required[a.field])assert.deepEqual([m.width,m.height],required[a.field]);if(a.field==='Library Logo'){assert.ok(m.hasAlpha);const s=await sharp(b).stats();assert.equal(s.channels[3].min,0);assert.equal(s.channels[3].max,255);}}
 const ico=fs.readFileSync(path.join(root,'04-APP-ICONS/shortcut_icon.ico'));assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7);
 for(let i=0;i<7;i++){const p=6+16*i,offset=ico.readUInt32LE(p+12),len=ico.readUInt32LE(p+8);const m=await sharp(ico.subarray(offset,offset+len)).metadata();assert.deepEqual([m.width,m.height],[manifest.icoSizes[i],manifest.icoSizes[i]]);}
 const result={passed:true,images:manifest.assets.length,icoFrames:7,realAlpha:true,dimensions:'Matched explicit Steam field requirements',steamUpload:false};
 fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(result,null,2));console.log(result);
})().catch(e=>{console.error(e);process.exitCode=1});
