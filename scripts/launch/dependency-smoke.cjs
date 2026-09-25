// Exercise the native/image and spreadsheet APIs affected by L06 overrides.
// Synthetic inputs only; never reads or rewrites shipped portraits or careers.
const assert = require('node:assert/strict');
const sharp = require('sharp');
const imgly = require('@imgly/background-removal-node');
const xlsx = require('xlsx');

async function main() {
  const source = await sharp({create:{width:2,height:2,channels:4,background:{r:40,g:90,b:130,alpha:1}}}).png().toBuffer();
  const mask = new Blob([new Uint8Array([0,255,255,0])], {type:'image/x-alpha8;width=2;height=2'});
  const result = await imgly.applySegmentationMask(new Blob([source],{type:'image/png'}), mask);
  const pixels = await sharp(Buffer.from(await result.arrayBuffer())).raw().toBuffer();
  assert.deepEqual([...pixels].filter((_,i)=>i%4===3), [0,255,255,0]);
  // The encoder may quantize invisible RGB; visible pixels must retain color.
  assert.deepEqual([...pixels.subarray(4,12)], [40,90,130,255,40,90,130,255]);
  await assert.rejects(imgly.applySegmentationMask(new Blob([source],{type:'image/png'}), mask, {model:'invalid'}));
  const webp = await sharp(source).webp({lossless:true}).toBuffer();
  assert.equal((await sharp(webp).metadata()).format,'webp');
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{name:'dunk',rating:88}]),'Players');
  const restored = xlsx.read(xlsx.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
  assert.deepEqual(xlsx.utils.sheet_to_json(restored.Sheets.Players),[{name:'dunk',rating:88}]);
  assert.equal(typeof require('onnxruntime-node').InferenceSession.create,'function');
  console.log(JSON.stringify({passed:true,sharp:sharp.versions.sharp,xlsx:xlsx.version,
    checks:['IMG.LY PNG decode/mask/encode with Sharp + Zod + Lodash overrides','invalid model rejected','lossless WebP codec','XLSX workbook round trip','ONNX native binding load'],
    limitations:['No model inference/download or paid generation performed. Electron tested separately.']},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
