const { cleanAlpha } = require('../scripts/clean-portrait-edges.cjs') as {
  cleanAlpha: (pixels: Buffer, width: number, height: number) => {data: Buffer}
}

test('removes connected white matte while keeping enclosed white facial highlights', () => {
  const pixels = Buffer.alloc(40 * 40 * 4)
  for (let y=5;y<35;y++) for (let x=5;x<35;x++) {
    const index=(y*40+x)*4
    pixels.fill(40,index,index+3)
    pixels[index+3]=255
  }
  const matte=(20*40+5)*4, highlight=(10*40+17)*4
  pixels.fill(250,matte,matte+3)
  pixels.fill(255,highlight,highlight+3)
  const original=Buffer.from(pixels)
  const {data}=cleanAlpha(pixels,40,40)
  expect(data[matte+3]).toBe(0)
  expect(data.subarray(highlight,highlight+4)).toEqual(pixels.subarray(highlight,highlight+4))
  expect(pixels).toEqual(original)
  for(let i=0;i<data.length;i+=4) {
    expect(data.subarray(i,i+3)).toEqual(original.subarray(i,i+3))
    expect(data[i+3]).toBeLessThanOrEqual(original[i+3])
  }
})
