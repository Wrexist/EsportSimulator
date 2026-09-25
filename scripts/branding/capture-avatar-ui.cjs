// Isolated browser context: no existing career/save data is read or changed.
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.AVATAR_REVIEW_URL || 'http://127.0.0.1:3372';
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/new-game', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByPlaceholder('Enter your name...').waitFor({ timeout: 180000 });
    await page.getByPlaceholder('Enter your name...').fill('Avatar Review');
    await page.getByRole('button', { name: 'Choose Existing Team' }).click();
    await page.getByRole('heading', { name: /Choose Your Team/ }).waitFor({ timeout: 60000 });
    await page.locator('img[src*="polished-"]').first().waitFor({ timeout: 60000 });
    const viewports = [];
    for (const [width, height] of [[1920, 1080], [1280, 720]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(async () => {
        await document.fonts.ready;
        const visible = Array.from(document.images).filter(img => {
          const box = img.getBoundingClientRect();
          return box.width && box.height && box.bottom > 0 && box.top < innerHeight;
        });
        await Promise.race([
          Promise.all(visible.map(img => img.decode().catch(() => {}))),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Visible portrait decode timed out')), 30000)),
        ]);
      });
      const rows = await page.locator('img[src*="polished-"]').evaluateAll(images => images.filter(img => {
        const box = img.getBoundingClientRect();
        return box.width && box.height && box.bottom > 0 && box.top < innerHeight;
      }).map(img => ({ alt: img.alt, src: img.src, loaded: img.complete && img.naturalWidth > 0 })));
      if (!rows.length || rows.some(row => !row.loaded)) throw new Error('Portraits failed to decode');
      const screenshot = `docs/ui-review/portraits/avatar-team-selection-${width}-jersey.png`;
      await page.screenshot({ path: screenshot });
      viewports.push({ viewport: [width, height], route: '/new-game', screenshot, rows });
    }
    fs.writeFileSync('docs/ui-review/portraits/avatar-ui-evidence-jersey.json', JSON.stringify({ capturedAt: new Date().toISOString(), isolatedContext: true, careerCreated: false, errors, viewports }, null, 2) + '\n');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ viewports: viewports.map(v => ({ viewport: v.viewport, loadedPortraits: v.rows.length })), errors }));
    await context.close();
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
