const fs = require('fs-extra');
const path = require('path');

const nextDir = path.join(__dirname, '..', '.next');
const distDir = path.join(__dirname, '..', 'dist');

// Parse command line args to determine what to clean
const args = process.argv.slice(2);
const cleanDist = args.includes('--dist') || args.includes('--all');
const cleanNext = !args.includes('--dist') || args.includes('--all');

const deleteFolderRecursive = async (dirPath, retries = 5) => {
    try {
        if (fs.existsSync(dirPath)) {
            console.log(`Cleaning build directory: ${dirPath}`);
            await fs.remove(dirPath);
            console.log('Build directory cleaned successfully.');
        } else {
            console.log(`Build directory does not exist, skipping: ${dirPath}`);
        }
    } catch (err) {
        if (retries > 0) {
            console.warn(`Failed to clean directory. Retrying in 1s... (${retries} attempts left)`);
            console.warn(`Error: ${err.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return deleteFolderRecursive(dirPath, retries - 1);
        } else {
            console.error('Failed to clean build directory after multiple attempts.');
            console.error('This is likely due to file locking by another process (e.g., VS Code, terminal, or antivirus).');
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    }
};

async function main() {
    if (cleanNext) await deleteFolderRecursive(nextDir);
    if (cleanDist) await deleteFolderRecursive(distDir);
}

main();
