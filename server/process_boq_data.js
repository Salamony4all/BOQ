
import fs from 'fs';
import path from 'path';

const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout-mid.json';
const txtPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\extracted_text.txt';

const categoryMap = {
    'WALL FINISHES': { main: 'Finishes', sub: 'Wall Finishes' },
    'FLOOR FINISHES': { main: 'Flooring', sub: 'Floor Finishes' },
    'CEILING': { main: 'Ceiling', sub: 'False Ceiling' },
    'SKIRTING': { main: 'Flooring', sub: 'Skirting' },
    'SKIRING': { main: 'Flooring', sub: 'Skirting' }, // Typo in PDF
    'DOORS': { main: 'Doors & Windows', sub: 'Doors' },
    'WINDOW': { main: 'Doors & Windows', sub: 'Treatments' }
};

function parseText(text) {
    const items = [];
    // Regex to split by Bill No.
    // Matches: Bill No. 2.1 ... content ... UOM Qty Rate Amount
    // Note: The text file has newlines in weird places. We should normalize spaces.
    const cleanText = text.replace(/\s+/g, ' ');

    // Pattern: Bill No\. [\d\.]+\s+(.*?)\s+(Item Code [A-Z0-9\-]+|As per specifications)?\s+([a-zA-Z0-9]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d,.]+)
    // But sometimes headers are mixed.
    // Let's iterate through "Bill No." occurrences.

    const parts = cleanText.split(/Bill No\. \d+\.\d+/);
    // Skip first empty part
    for (let i = 1; i < parts.length; i++) {
        let part = parts[i].trim();

        // Extract numbers from the end: Amount(last), Rate, Qty, UOM
        // Value pattern: [UOM] [Qty] [Rate] [Amount]
        // Amount: 1,234.00 or 104.000
        // Rate: 26 or 8000
        // Qty: 4
        // UOM: m2, m, No., LS

        // Regex for the tail parts
        const tailRegex = /([a-zA-Z0-9\.]+)\s+([\d\.]+)\s+([\d\.]+)\s+([\d,\.]+)\s*$/;
        const tailMatch = part.match(tailRegex);

        if (tailMatch) {
            const uom = tailMatch[1];
            const qty = parseFloat(tailMatch[2]);
            const rate = parseFloat(tailMatch[3].replace(/,/g, ''));
            const content = part.substring(0, tailMatch.index).trim();

            // Extract Item Code
            let model = '';
            let description = content;
            let itemCodeMatch = content.match(/Item [Cc]ode\s+([A-Z0-9\-]+(\s+and\s+[A-Z0-9\-]+)?)/);

            if (itemCodeMatch) {
                model = itemCodeMatch[1];
                // Remove Item Code from description
                description = content.replace(itemCodeMatch[0], '').trim();
            } else {
                model = 'Generic';
            }

            // clean description of header info
            // Header info usually: LOCATION, LOCATION, CATEGORY
            // We can try to extract category from the start

            let mainCat = 'FitOut';
            let subCat = 'General';

            // Try to find known categories in the text
            for (const [key, map] of Object.entries(categoryMap)) {
                if (description.includes(key) || description.includes(key.replace(' ', '  '))) { // Check for double spaces too in raw
                    mainCat = map.main;
                    subCat = map.sub;
                    // Optionally remove the location header part if possible, but it's hard to distinguish from desc.
                    // We'll keep the full description for context, maybe trim header if it's UPPERCASE
                    break;
                }
            }

            // Clean specific leading Location text if plain uppercase
            // Simple heuristic replacement of the matched category keyword from description? No, keeps context.

            items.push({
                mainCategory: mainCat,
                subCategory: subCat,
                family: model.split('-')[0] || 'General',
                model: model,
                description: description,
                price: rate,
                imageUrl: '',
                productUrl: ''
            });
        }
    }
    return items;
}


function run() {
    try {
        const rawText = fs.readFileSync(txtPath, 'utf8');
        const newItems = parseText(rawText);

        const dbAndContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const products = dbAndContent.products;

        let addedCount = 0;
        let updatedCount = 0;

        newItems.forEach(item => {
            // Check if model exists
            const existing = products.find(p => p.model === item.model && p.model !== 'Generic');

            if (existing) {
                // Update price if cleaner/newer? items in BOQ are specific, price is the RATE.
                // We overwrite price.
                existing.price = item.price;
                updatedCount++;
            } else {
                // Add new
                // If generic, we might duplicate unless we check description similarity.
                // For now, accept multiple Generics or uniquify them?
                // Let's filter Generics if description is very similar? 
                // Creating unique models for Generics
                if (item.model === 'Generic') {
                    item.model = `GEN-${Math.floor(Math.random() * 10000)}`;
                }
                products.push(item);
                addedCount++;
            }
        });

        dbAndContent.products = products;
        fs.writeFileSync(dbPath, JSON.stringify(dbAndContent, null, 2), 'utf8');
        console.log(`Processed ${newItems.length} items.`);
        console.log(`Updated: ${updatedCount}, Added: ${addedCount}`);

    } catch (e) {
        console.error("Error processing:", e);
    }
}

run();
