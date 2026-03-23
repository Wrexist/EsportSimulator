// Script to examine Excel file structure
const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.join(process.cwd(), 'public', 'assets', 'Players_teams.xlsx');

console.log('Reading Excel file:', excelPath);

try {
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Get headers (first row)
    const data = XLSX.utils.sheet_to_json(sheet);

    console.log('\n=== HEADERS (Column Names) ===');
    if (data.length > 0) {
        console.log(Object.keys(data[0]));
    }

    console.log('\n=== FIRST 3 ROWS (as objects) ===');
    data.slice(0, 3).forEach((row, idx) => {
        console.log(`\n--- Team ${idx + 1} ---`);
        console.log('Team Rank:', row['Team Rank']);
        console.log('Team Name:', row['Team Name']);
        console.log('Team Logo:', row['Team Logo']?.substring(0, 80) + '...');
        console.log('Player 1:', row['Player 1 Name'], '-', row['Player 1 Country']);
        console.log('Player 2:', row['Player 2 Name'], '-', row['Player 2 Country']);
        console.log('Player 3:', row['Player 3 Name'], '-', row['Player 3 Country']);
        console.log('Player 4:', row['Player 4 Name'], '-', row['Player 4 Country']);
        console.log('Player 5:', row['Player 5 Name'], '-', row['Player 5 Country']);
    });

    console.log(`\n=== TOTAL TEAMS: ${data.length} ===`);
} catch (err) {
    console.error('Error reading file:', err.message);
}
