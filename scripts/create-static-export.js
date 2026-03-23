const fs = require('fs-extra');
const path = require('path');

async function createStaticExport() {
    console.log('📦 Creating static export for Electron...');

    const sourceDir = path.join(__dirname, '.next', 'server', 'app');
    const staticDir = path.join(__dirname, '.next', 'static');
    const outDir = path.join(__dirname, 'out');

    try {
        // Clean out directory
        await fs.remove(outDir);

        // Copy app files
        if (await fs.pathExists(sourceDir)) {
            await fs.copy(sourceDir, outDir);
            console.log('✓ Copied app files');
        }

        // Copy static files
        if (await fs.pathExists(staticDir)) {
            const outStaticDir = path.join(outDir, '_next', 'static');
            await fs.ensureDir(outStaticDir);
            await fs.copy(staticDir, outStaticDir);
            console.log('✓ Copied static files');
        }

        console.log('✅ Static export created successfully!');
    } catch (error) {
        console.error('❌ Error creating static export:', error);
        process.exit(1);
    }
}

createStaticExport();
