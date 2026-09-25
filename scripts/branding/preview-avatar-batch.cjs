const sharp = require('sharp');
const path = require('node:path');
const records = require('../../data/player-portrait-reviewed.json');
const count = Number(process.argv[2] || 15);
const name = process.argv[3] || 'latest-batch';
const background = process.argv.includes('--light') ? '#e6e9ee' : '#15243a';
if (!Number.isInteger(count) || count < 1 || count > records.length || !/^[a-z0-9-]+$/.test(name)) throw Error('Use a valid count and simple filename');
async function main() {
  const rows=process.argv.includes('--first') ? records.slice(0,count) : records.slice(-count), tiles=[];
  for(const [i,r] of rows.entries()) tiles.push({input:await sharp(`public${r.destination}`).resize(150,150).png().toBuffer(),left:(i%5)*160+5,top:Math.floor(i/5)*160+5});
  const output=path.join('docs/ui-review/portraits',name+'.png');
  await sharp({create:{width:800,height:Math.ceil(count/5)*160,channels:4,background}}).composite(tiles).png().toFile(output);
  console.log(output);
}
main().catch(e=>{console.error(e);process.exitCode=1});
