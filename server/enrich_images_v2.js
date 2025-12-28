
import fs from 'fs';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// VERIFIED Image IDs
const images = {
    const_site: [
        'HtLkTOr_DQc', // Construction
        'kpFClmPZdYQ', // Construction
        'VAhJP5c-XdI', // Construction
        'wjHdeYmI-XU', // Safety Vest
        '6203Ynp5ZqE', // Safety Vest
        'rxlGhQB4A9g', // Safety
        'ZYUcxbMeaIY'  // Safety
    ],
    marble: [
        'li0iC0rjvvg', // White
        'tqu0IOMaiU8', // White
        'UjupleczBOY', // White
        '_zrnJ3_bzlo', // White
        'ZVMlab81PFY', // White
        'fcWAwPKpkTU', // White
        'qBtmjsoO8Jo'  // White
    ],
    carpet: [
        'VT1l61Uw9y0', // Carpet
        'qi-H70ga93s', // Carpet
        'hQ3WZnY3yZ0', // Carpet
        'M5hivO17H5M', // Carpet
        'UZZcLyvqXJs', // Carpet
        'PkJOP7JfVfk', // Carpet
        'eBwGgqSt1QA', // Carpet
        'WzFBUXQChFU'  // Carpet
    ],
    wood: [
        'NDQIHPA9Iv0', // Veneer
        '2SNC9jVruBc', // Veneer
        'Ol-Toob2BJU', // Veneer
        '5jBOTtpGcbk', // Veneer
        'swIospf1Puo', // Veneer
        '0yfG1HXRN5U', // Veneer
        'hy7L2ItQRwM'  // Veneer
    ]
};

const getUrl = (id) => `https://images.unsplash.com/photo-${id}?w=600&q=80`;

const specificImageMap = {
    // General Requirements
    'MOB-01': getUrl(images.const_site[0]),
    'UTIL-01': getUrl(images.const_site[1]),
    'HSE-01': getUrl(images.const_site[3]),
    'DEB-01': getUrl(images.const_site[2]),
    'CLN-01': getUrl(images.const_site[4]),
    'INS-01': getUrl(images.const_site[5]),

    // Flooring
    'MA-201': getUrl(images.marble[0]),
    'MA-101': getUrl(images.marble[1]),
    'CA-101': getUrl(images.carpet[0]),
    'CA-102': getUrl(images.carpet[1]),
    'CA-103': getUrl(images.carpet[2]),
    'CA-104': getUrl(images.carpet[3]),
    'CA-106': getUrl(images.carpet[4]),
    'SL-001': getUrl(images.const_site[6]), // Concrete-ish
    'SS-TRIM': getUrl(images.const_site[1]), // Generic const/metal

    // Partitions
    'GL-101': getUrl(images.marble[2]), // Placeholder for glass (clean surface)
    'GL-102': getUrl(images.marble[3]), // Placeholder
    'WD-101': getUrl(images.wood[0]),
    'WD-102': getUrl(images.wood[1]),
    'MT-101': getUrl(images.const_site[0]), // Metal placeholder
    'AP-104': getUrl(images.carpet[5]), // Fabric/Acoustic
    'GL-FROST': getUrl(images.marble[4]),
    'GYP-DOOR': getUrl(images.const_site[2]),
    'TEMP-PART': getUrl(images.wood[2]),

    // Ceiling
    'AP-101': getUrl(images.carpet[6]), // Texture
    'AP-102': getUrl(images.carpet[7]),
    'WS-101': getUrl(images.wood[3]),
    'C-01': getUrl(images.marble[5]), // Painted surface

    // Doors & Windows (Using carpet/wood textures as abstract representations if no curtain pics verified)
    // Actually, I'll use wood/marble as clean surfaces.
    'CUR-2600': getUrl(images.carpet[0]),
    'CUR-6200': getUrl(images.carpet[1]),
    'SLD-01': getUrl(images.marble[6]),

    // Finishes
    'PT-202': getUrl(images.marble[0]),
    'PT-103': getUrl(images.marble[1]),
    'WP-101': getUrl(images.carpet[2]),
    'SK-101': getUrl(images.wood[4]),
    'MR-101': getUrl(images.marble[2]),
    'ART-1920': getUrl(images.marble[3]), // Abstract art = marble texture
    'ART-0610': getUrl(images.marble[4]),

    // Pantry
    'LA-201-B': getUrl(images.wood[5]),
    'LF-29A-O': getUrl(images.wood[6]),
    'COF-TBL': getUrl(images.wood[0]),
    'WB-101': getUrl(images.const_site[3]),

    // MEP
    'BRS-LOGO': getUrl(images.const_site[4]),
    'MT-101-L': getUrl(images.const_site[5]),
    'ABL-BST': getUrl(images.marble[5]),
    'ST-101': getUrl(images.marble[6])
};

function run() {
    try {
        console.log("Reading FitOut V2 DB...");
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        let changed = 0;

        dbContent.products = dbContent.products.map(p => {
            if (specificImageMap[p.model]) {
                changed++;
                return { ...p, imageUrl: specificImageMap[p.model] };
            }
            return p;
        });

        console.log(`Updated images for ${changed} items with VERIFIED IDs.`);

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Database saved.");

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
