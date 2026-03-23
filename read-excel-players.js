/**
 * Read Excel file to extract player image URLs
 * Run with: node read-excel-players.js
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const excelPath = path.join(__dirname, 'Thunderbit_901eab_20260102_235323.xlsx');

// Read the workbook
const workbook = XLSX.readFile(excelPath);

// Get the first sheet
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

// Convert to JSON
const data = XLSX.utils.sheet_to_json(worksheet);

console.log('=== Excel Data Analysis ===\n');
console.log(`Total rows: ${data.length}`);
console.log(`Columns: ${Object.keys(data[0] || {}).join(', ')}`);
console.log('\nFirst 5 rows:');
data.slice(0, 5).forEach((row, i) => {
    console.log(`\n--- Row ${i + 1} ---`);
    Object.entries(row).forEach(([key, value]) => {
        const displayValue = String(value).length > 80 ? String(value).substring(0, 80) + '...' : value;
        console.log(`  ${key}: ${displayValue}`);
    });
});

// Save full data to JSON for inspection
fs.writeFileSync(
    path.join(__dirname, 'player-excel-data.json'),
    JSON.stringify(data, null, 2),
    'utf8'
);

console.log('\n\nFull data saved to player-excel-data.json');
