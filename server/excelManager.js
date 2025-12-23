/**
 * Excel Database Manager
 * Handles import/export of brand product data to/from Excel
 */

import ExcelJS from 'exceljs';

class ExcelDbManager {
    async exportToExcel(brandData) {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Products');

        sheet.columns = [
            { header: 'Main Category', key: 'mainCategory', width: 20 },
            { header: 'Sub Category', key: 'subCategory', width: 20 },
            { header: 'Family', key: 'family', width: 20 },
            { header: 'Model', key: 'model', width: 25 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Image URL', key: 'imageUrl', width: 30 },
            { header: 'Price', key: 'price', width: 15 }
        ];

        if (brandData.products) {
            sheet.addRows(brandData.products);
        }
        return workbook;
    }

    async importFromExcel(filePath) {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.getWorksheet(1);
        const products = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const vals = row.values;
            if (vals.length > 0) {
                products.push({
                    mainCategory: vals[1] || '',
                    subCategory: vals[2] || '',
                    family: vals[3] || '',
                    model: vals[4] || '',
                    description: vals[5] || '',
                    imageUrl: vals[6] || '',
                    price: vals[7] || 0
                });
            }
        });
        return products;
    }
}

export { ExcelDbManager };
