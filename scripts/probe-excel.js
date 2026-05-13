const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'public/assets/staff/Esport_Manager_Staff_Market_Expanded (1).xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;

    console.log("Sheets:", sheetNames);

    sheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length > 0) {
            console.log(`\n--- Sheet: ${sheetName} (First Row/Headers) ---`);
            console.log(data[0]);
            console.log(`(Row 2 sample):`, data[1]);
        }
    });

} catch (err) {
    console.error("Error reading excel:", err);
}
