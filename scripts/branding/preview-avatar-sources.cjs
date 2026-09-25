const fs = require('node:fs');
const sharp = require('sharp');
const input = process.argv[2];
const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
(async () => {
  for(let start=0;start<rows.length;start+=30) {
    const slice=rows.slice(start,start+30), tiles=[];
    for(const [i,row] of slice.entries()) {
      tiles.push({input:await sharp(row.source).resize(180,190,{fit:'contain',background:'#334150'}).png().toBuffer(),left:(i%5)*200+10,top:Math.floor(i/5)*220});
      tiles.push({input:Buffer.from(`<svg width="200" height="30"><text x="8" y="18" fill="white" font-size="11">${start+i+1}: ${escape(row.source.split('/').slice(-3).join('/'))}</text></svg>`),left:(i%5)*200,top:Math.floor(i/5)*220+190});
    }
    const out=input.replace(/\.json$/,`-sources-${start+1}.png`);
    await sharp({create:{width:1000,height:Math.ceil(slice.length/5)*220,channels:4,background:'#334150'}}).composite(tiles).png().toFile(out);
    console.log(out);
  }
})().catch(e=>{console.error(e);process.exitCode=1});
