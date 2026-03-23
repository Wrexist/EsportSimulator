
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(__dirname, '../public/assets/staff/Esport_Manager_Staff_Market_Expanded (1).xlsx');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    if (data.length > 0) {
        console.log(Object.keys(data[0]).join(','));
    }
} catch (error) {
    console.error(error);
}
