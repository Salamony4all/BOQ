
import fs from 'fs';
import path from 'path';

// Define paths
const csvPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\FitOt.csv';
const newDbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

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

        const products = [];
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
                // unit: cols[4], // We don't strictly support unit in this schema typically, but valid if needed. Usually logic handles it. 
                // However, adding it as a property is fine, just won't be used by standard flow unless customized.
                // Actually, the previous turn added unit logic to fallback to 'Nos'.
                // I will add it if the schema allows extra fields. The schema is loose.
                imageUrl: cols[6] || '',
                price: parseFloat(cols[5]) || 0,
                productUrl: '' // Not in CSV
            };
            products.push(item);
        }

        const newBrand = {
            id: Date.now(),
            name: "FitOut V2",
            url: "",
            origin: "Local",
            budgetTier: "mid",
            logo: "",
            products: products
        };

        console.log(`Parsed ${products.length} items.`);

        console.log("Saving new FitOut V2 DB...");
        fs.writeFileSync(newDbPath, JSON.stringify(newBrand, null, 2), 'utf8');

        console.log(`Success! Created ${newDbPath}`);

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
