const fs = require('node:fs');
const { randomInt } = require('node:crypto');
const sharp = require('sharp');
const records = require('../../data/player-portrait-reviewed.json');
const known = ['niko','m0nesy','donk','sh1ro','twistzz','karrigan','aleksib','b1t','w0nderful','hunter-','xantares','woxic','hooxi','jabbi','s1mple','electronic','jks','nitr0','snappi','perfecto','art','insani','blamef','krimz','jw','boombl4'];
async function main() {
  const candidates = records.filter(r => known.includes(r.source.split('/').pop().split('.')[0]));
  for (let i=candidates.length-1;i>0;i--) { const j=randomInt(i+1); [candidates[i],candidates[j]]=[candidates[j],candidates[i]]; }
  const sample=candidates.slice(0,6), tiles=[];
  for(const [i,r] of sample.entries()) {
    const left=(i%3)*256, top=Math.floor(i/3)*280;
    tiles.push({input:await sharp('public'+r.destination).resize(240,240).png().toBuffer(),left:left+8,top});
    const name=r.source.split('/').pop().split('.')[0];
    tiles.push({input:Buffer.from(`<svg width="256" height="40"><text x="128" y="25" text-anchor="middle" font-family="Arial" font-size="19" fill="#eef3ff">${name}</text></svg>`),left,top:top+240});
  }
  await sharp({create:{width:768,height:560,channels:4,background:'#15243a'}}).composite(tiles).png().toFile('docs/ui-review/portraits/known-player-examples.png');
  fs.writeFileSync('docs/ui-review/portraits/known-player-examples.json',JSON.stringify(sample.map(r=>({id:r.id,reference:r.source,image:r.destination})),null,2)+'\n');
  console.log(sample.map(r=>r.source.split('/').pop()).join(', '));
}
main().catch(e=>{console.error(e);process.exitCode=1});
