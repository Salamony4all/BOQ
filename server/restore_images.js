
import fs from 'fs';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// KNOWN WORKING URLS from previous successful state
const pool = {
    site: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&q=80', // Site/Containers
    utils: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=600&q=80', // Utilities
    safety: 'https://images.unsplash.com/photo-1596464522906-8c4d29323382?w=600&q=80', // Safety
    debris: 'https://images.unsplash.com/photo-1581578731117-10d521d53a71?w=600&q=80', // Cleaning/Debris
    insurance: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80', // Paperwork

    marble: 'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=600&q=80', // Marble/Kitchen
    carpet: 'https://images.unsplash.com/photo-1563304245-c4524c78d06c?w=600&q=80', // Carpet/Rug
    concrete: 'https://images.unsplash.com/photo-1518709414768-a88981a4515d?w=600&q=80', // Concrete/Paint

    glass: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80', // Glass Office
    wood: 'https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?w=600&q=80', // Wood Texture
    metal: 'https://images.unsplash.com/photo-1535967657984-33230a1122bf?w=600&q=80', // Metal/Trim
    acoustic: 'https://images.unsplash.com/photo-1519782875147-3868dfbb801b?w=600&q=80', // Fabric/Acoustic

    curtain: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80', // Curtains
    paint: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&q=80', // Paint Texture
    art: 'https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600&q=80', // Art

    cabinet: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80', // Cabinetry
    furniture: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?w=600&q=80', // Table
    whiteboard: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&q=80', // Whiteboard (Generic)

    sanitary: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=600&q=80' // Bathroom
};

function run() {
    try {
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        dbContent.products = dbContent.products.map(p => {
            const m = p.model;
            const mc = p.mainCategory;
            const sc = p.subCategory;
            let url = pool.site; // Default

            if (m.includes('MOB')) url = pool.site;
            else if (m.includes('UTIL')) url = pool.utils;
            else if (m.includes('HSE')) url = pool.safety;
            else if (m.includes('DEB') || m.includes('CLN')) url = pool.debris;
            else if (m.includes('INS')) url = pool.insurance;

            else if (mc.includes('Flooring')) {
                if (sc.includes('Carpet')) url = pool.carpet;
                else if (sc.includes('Preparation')) url = pool.concrete;
                else url = pool.marble; // Stone
            }

            else if (mc.includes('Partitions')) {
                if (sc.includes('Glass')) url = pool.glass;
                else if (sc.includes('Wood')) url = pool.wood;
                else if (sc.includes('Metal')) url = pool.metal;
                else if (sc.includes('Acoustic')) url = pool.acoustic;
                else url = pool.glass;
            }

            else if (mc.includes('Ceiling')) {
                if (sc.includes('Wood')) url = pool.wood;
                else if (sc.includes('Painting')) url = pool.concrete;
                else url = pool.acoustic;
            }

            else if (mc.includes('Doors')) {
                if (sc.includes('Window')) url = pool.curtain;
                else url = pool.glass; // Sliding doors
            }

            else if (mc.includes('Finishes')) {
                if (sc.includes('Painting')) url = pool.paint;
                else if (sc.includes('Wallpaper')) url = pool.wood; // Texture
                else if (sc.includes('Skirting')) url = pool.wood;
                else if (sc.includes('Mirrors')) url = pool.glass;
                else if (sc.includes('Artwork')) url = pool.art;
            }

            else if (mc.includes('Pantry')) {
                if (sc.includes('Cabinet')) url = pool.cabinet;
                else if (sc.includes('Furniture')) url = pool.furniture;
                else url = pool.whiteboard;
            }

            else if (mc.includes('Electrical')) {
                if (sc.includes('Plumbing') || sc.includes('Sanitary')) url = pool.sanitary;
                else url = pool.metal; // Lighting/Logo
            }

            return { ...p, imageUrl: url };
        });

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Restored " + dbContent.products.length + " items with known working URLs.");

    } catch (e) {
        console.error(e);
    }
}

run();
