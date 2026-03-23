#!/usr/bin/env node
/**
 * Image Optimization Script
 * Converts PNG team logos and player portraits to WebP format
 * Reduces asset size from ~342MB to ~50-80MB
 *
 * Usage: node scripts/optimize-images.js
 * Requires: npm install sharp (run once before using)
 */

const fs = require('fs');
const path = require('path');

async function optimizeImages() {
    let sharp;
    try {
        sharp = require('sharp');
    } catch {
        console.error('sharp is not installed. Run: npm install sharp --save-dev');
        process.exit(1);
    }

    const assetsDir = path.join(__dirname, '..', 'public', 'assets');
    const teamsDir = path.join(assetsDir, 'teams');

    if (!fs.existsSync(teamsDir)) {
        console.error('Teams directory not found:', teamsDir);
        process.exit(1);
    }

    let converted = 0;
    let skipped = 0;
    let totalSaved = 0;

    const processFile = async (filePath) => {
        if (!filePath.endsWith('.png') && !filePath.endsWith('.jpg') && !filePath.endsWith('.jpeg')) {
            return;
        }

        const webpPath = filePath.replace(/\.(png|jpe?g)$/i, '.webp');

        // Skip if WebP already exists and is newer
        if (fs.existsSync(webpPath)) {
            const srcStat = fs.statSync(filePath);
            const webpStat = fs.statSync(webpPath);
            if (webpStat.mtimeMs >= srcStat.mtimeMs) {
                skipped++;
                return;
            }
        }

        try {
            const originalSize = fs.statSync(filePath).size;

            await sharp(filePath)
                .webp({ quality: 80, effort: 4 })
                .toFile(webpPath);

            const newSize = fs.statSync(webpPath).size;
            const saved = originalSize - newSize;
            totalSaved += saved;
            converted++;

            if (converted % 100 === 0) {
                console.log(`  Converted ${converted} images...`);
            }
        } catch (err) {
            console.warn(`  Warning: Failed to convert ${filePath}: ${err.message}`);
        }
    };

    const walkDir = async (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDir(fullPath);
            } else {
                await processFile(fullPath);
            }
        }
    };

    console.log('Optimizing images in public/assets/...');
    console.log('');

    // Process team logos and player portraits
    await walkDir(teamsDir);

    // Process root-level placeholder images
    const rootAssets = ['player_placeholder.png', 'team_placeholder.png', 'staff_placeholder.png']
        .map(f => path.join(__dirname, '..', 'public', f));

    for (const f of rootAssets) {
        if (fs.existsSync(f)) {
            await processFile(f);
        }
    }

    // Process flag SVGs are already small, skip those

    console.log('');
    console.log(`Done! Converted: ${converted}, Skipped: ${skipped}`);
    console.log(`Total saved: ${(totalSaved / 1024 / 1024).toFixed(1)}MB`);
    console.log('');
    console.log('Note: Original PNG/JPG files are preserved alongside WebP.');
    console.log('Update your image components to prefer .webp with .png fallback.');
}

optimizeImages().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
