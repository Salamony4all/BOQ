
import fs from 'fs';
import path from 'path';

// Define paths
const csvPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\FitOt.csv';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout-mid.json';

// Helper to parse CSV lines (simple handling for quoted strings)
function parseCSVLine(line) {
    const chars = line.split('');
    const fields = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < chars.length; i++) {
        const char = chars[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            fields.push(currentField.trim());
            currentField = '';
        } else {
            currentField += char;
        }
    }
    fields.push(currentField.trim());
    return fields;
}

function run() {
    try {
        console.log("Reading CSV...");
        const csvContent = fs.readFileSync(csvPath, 'utf8');
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

        // Header: Category,Sub-Category,Model_Code,Item_Description,UOM,Unit_Rate_OMR,Image_URL
        const headers = parseCSVLine(lines[0]);
        console.log("Headers:", headers);

        const newItems = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i]);
            if (cols.length < 5) continue; // Skip malformed rows

            // Map CSV to JSON structure
            const item = {
                mainCategory: cols[0],
                subCategory: cols[1],
                family: cols[2].split('-')[0] || 'General', // Derive family from Model Code prefix
                model: cols[2],
                description: cols[3].replace(/^"|"$/g, ''), // Remove wrapping quotes if any left
                unit: cols[4], // UOM - useful to store but currently DB uses 'unit' less, mostly implicitly? No, User wanted Unit.
                price: parseFloat(cols[5]) || 0,
                imageUrl: cols[6] || '',
                productUrl: '' // Not in CSV
            };
            newItems.push(item);
        }

        console.log(`Parsed ${newItems.length} items from CSV.`);

        console.log("Reading existing DB...");
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const products = dbContent.products || [];

        let added = 0;
        let updated = 0;

        newItems.forEach(newItem => {
            // Find existing by Model Code
            const existingIndex = products.findIndex(p => p.model === newItem.model);

            if (existingIndex !== -1) {
                // Update existing
                const existing = products[existingIndex];
                // Enrich: Update price, image, description if strictly better (longer?) or just overwrite
                // CSV seems to be master data here.
                products[existingIndex] = {
                    ...existing,
                    mainCategory: newItem.mainCategory || existing.mainCategory,
                    subCategory: newItem.subCategory || existing.subCategory,
                    description: newItem.description || existing.description,
                    price: newItem.price || existing.price,
                    imageUrl: newItem.imageUrl || existing.imageUrl
                };
                updated++;
            } else {
                // Add new
                products.push(newItem);
                added++;
            }
        });

        dbContent.products = products;

        console.log("Saving enriched DB...");
        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');

        console.log(`Success! Updated: ${updated}, Added: ${added}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
