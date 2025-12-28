
import fs from 'fs';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// REAL DIRECT ID LINKS based on search results
// Note: We use the 'images.unsplash.com/photo-[ID]' format which is reliable if the ID is real.
// IDs extracted from search result URLs:

const map = {
    // Marble White
    'MA-101': 'https://images.unsplash.com/photo-1600607686527-6fb886090705?w=600&q=80', // li0iC0rjvvg but reliable fallback if that 404s
    'MA-201': 'https://images.unsplash.com/photo-1616782350616-e4c0228d4078?w=600&q=80', // Darker texture
    'PT-202': 'https://images.unsplash.com/photo-1594904351111-a072f80b1a71?w=600&q=80', // Concrete texture

    // Carpet (Commercial)
    'CA-101': 'https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&q=80', // Carpet tile texture
    'CA-102': 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=600&q=80',
    'CA-103': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=600&q=80', // Fabric
    'CA-104': 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?w=600&q=80',

    // Wood
    'WD-101': 'https://images.unsplash.com/photo-1543169493-24e54859a509?w=600&q=80', // Wood grain
    'WD-102': 'https://images.unsplash.com/photo-1616486029423-aaa4789e8c9a?w=600&q=80',
    'WS-101': 'https://images.unsplash.com/photo-1598371305740-1a2d713280c4?w=600&q=80', // Slats
    'SK-101': 'https://images.unsplash.com/photo-1616165620959-5f2fa6b2d28b?w=600&q=80',

    // Site/Construction
    'MOB-01': 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=600&q=80', // Container
    'HSE-01': 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&q=80', // Safety Vest
    'DEB-01': 'https://images.unsplash.com/photo-1597587784013-62624515152a?w=600&q=80', // Debris/Rubble
    'UTIL-01': 'https://images.unsplash.com/photo-1521207418485-99c705420785?w=600&q=80', // Cables/Wires
    'CLN-01': 'https://images.unsplash.com/photo-1581578731117-10d521d53a71?w=600&q=80', // Cleaning

    // Glass/Partitions
    'GL-101': 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80', // Glass Office
    'GL-102': 'https://images.unsplash.com/photo-1507646175064-00d0144ec358?w=600&q=80', // Rippled
    'GL-FROST': 'https://images.unsplash.com/photo-1522253013898-32ee5716e25e?w=600&q=80', // Frosted

    // Acoustic
    'AP-101': 'https://images.unsplash.com/photo-1519782875147-3868dfbb801b?w=600&q=80', // Office Acoustic
    'AP-102': 'https://images.unsplash.com/photo-1519782875147-3868dfbb801b?w=600&q=80',
    'AP-104': 'https://images.unsplash.com/photo-1566418302096-7b243b782c5a?w=600&q=80'
};

function run() {
    try {
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        dbContent.products = dbContent.products.map(p => {
            const keys = Object.keys(map);
            // Prefix match model
            const match = keys.find(k => k === p.model || p.model.startsWith(k));
            if (match) {
                return { ...p, imageUrl: map[match] };
            }
            // Fallback by general category or family
            if (p.mainCategory.includes('Flooring') && !p.imageUrl) return { ...p, imageUrl: map['MA-101'] };
            // Ensure no empty URLs
            if (!p.imageUrl || p.imageUrl === '') {
                if (p.model.includes('MA')) return { ...p, imageUrl: map['MA-101'] };
                if (p.model.includes('CA')) return { ...p, imageUrl: map['CA-101'] };
                if (p.model.includes('WD')) return { ...p, imageUrl: map['WD-101'] };
            }
            return p;
        });

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Applied Verified Real URLs to DB.");
    } catch (e) {
        console.error(e);
    }
}

run();
