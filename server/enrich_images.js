
import fs from 'fs';
import path from 'path';

const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// Mapping of keywords to representative Unsplash images
const imageMap = [
    { keywords: ['mobilization', 'site setup', 'temporary office'], url: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&q=80' },
    { keywords: ['electricity', 'water', 'utilities', 'cable'], url: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&q=80' },
    { keywords: ['safety', 'ppe', 'helmet'], url: 'https://images.unsplash.com/photo-1596464522906-8c4d29323382?w=600&q=80' },
    { keywords: ['cleaning', 'waste', 'debris', 'housekeeping'], url: 'https://images.unsplash.com/photo-1581578731117-10d521d53a71?w=600&q=80' },
    { keywords: ['insurance', 'document'], url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80' },
    { keywords: ['marble', 'stone flooring'], url: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=600&q=80' },
    { keywords: ['carpet'], url: 'https://images.unsplash.com/photo-1563304245-c4524c78d06c?w=600&q=80' },
    { keywords: ['self leveling', 'screed', 'cement'], url: 'https://images.unsplash.com/photo-1518709414768-a88981a4515d?w=600&q=80' }, // Concrete texture
    { keywords: ['stainless steel', 'trim', 'metal'], url: 'https://images.unsplash.com/photo-1535967657984-33230a1122bf?w=600&q=80' },
    { keywords: ['glass partition', 'toughened glass'], url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80' },
    { keywords: ['wood cladding', 'veneer', 'mdf'], url: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=600&q=80' },
    { keywords: ['acoustic', 'soundproof'], url: 'https://images.unsplash.com/photo-1519782875147-3868dfbb801b?w=600&q=80' }, // Fabric texture
    { keywords: ['gypsum', 'partition', 'drywall'], url: 'https://images.unsplash.com/photo-1595846519845-68e298c2edd8?w=600&q=80' },
    { keywords: ['curtain', 'blind'], url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80' },
    { keywords: ['paint', 'textured'], url: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&q=80' },
    { keywords: ['wallpaper'], url: 'https://images.unsplash.com/photo-1615800098779-1be32e60cca3?w=600&q=80' },
    { keywords: ['skirting', 'wood'], url: 'https://images.unsplash.com/photo-1615873968403-89bd7c32458f?w=600&q=80' }, // Wood floor detail
    { keywords: ['mirror'], url: 'https://images.unsplash.com/photo-1618220252344-836e3e94f421?w=600&q=80' },
    { keywords: ['art', 'artwork'], url: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600&q=80' },
    { keywords: ['cabinet', 'joinery', 'kitchen'], url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80' },
    { keywords: ['lighting', 'led', 'logo'], url: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=600&q=80' },
    { keywords: ['sanitary', 'plumbing', 'sink', 'ablution'], url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&q=80' },
    { keywords: ['table', 'coffee'], url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=600&q=80' }
];

function getImageUrl(text) {
    const lowerText = text.toLowerCase();
    for (const entry of imageMap) {
        if (entry.keywords.some(k => lowerText.includes(k))) {
            return entry.url;
        }
    }
    // Fallback?
    return 'https://placehold.co/600x400?text=' + encodeURIComponent(text.substring(0, 20));
}

function run() {
    try {
        console.log("Reading DB...");
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        let updatedCount = 0;

        dbContent.products = dbContent.products.map(p => {
            // Check if existing image is a broken fitoutapp link or empty
            if (!p.imageUrl || p.imageUrl.includes('fitoutapp.com')) {
                const combinedText = `${p.subCategory} ${p.description} ${p.model}`;
                const newUrl = getImageUrl(combinedText);
                updatedCount++;
                return { ...p, imageUrl: newUrl };
            }
            return p;
        });

        console.log(`Updated images for ${updatedCount} items.`);

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Database saved.");

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
