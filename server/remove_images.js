
import fs from 'fs';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

function run() {
    try {
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        dbContent.products = dbContent.products.map(p => ({
            ...p,
            imageUrl: ""
        }));

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log(`Removed images from ${dbContent.products.length} items.`);

    } catch (e) {
        console.error("Error updating DB:", e);
    }
}

run();
