
import fs from 'fs';
const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// Manually verified "Reference/Scene" images based on Model Descriptions
// These are illustrative, not just textures (unless texture is the best fit for clarity)

const descriptionMap = {
    // Construction Site Setup
    'MOB-01': 'https://images.unsplash.com/photo-1590247813693-5541d1c609fd?w=600&q=80', // Containers/Site Office
    'UTIL-01': 'https://images.unsplash.com/photo-1455849318743-b2233052fcff?w=600&q=80', // Industrial cables/utilities
    'HSE-01': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&q=80', // Safety Vest/Checklist
    'DEB-01': 'https://images.unsplash.com/photo-1581578731117-10d521d53a71?w=600&q=80', // Cleaning/Maintenance
    'CLN-01': 'https://images.unsplash.com/photo-1527515545081-5db816ae285e?w=600&q=80', // Cleaning

    // Flooring
    'MA-201': 'https://images.unsplash.com/photo-1620025950153-f75e2978a3d3?w=600&q=80', // Dark polished stone floor
    'MA-101': 'https://images.unsplash.com/photo-1599690940540-349f7ba304d9?w=600&q=80', // White marble floor installed
    'CA-101': 'https://images.unsplash.com/photo-1563717232235-9614488b0d1b?w=600&q=80', // Office carpet tiles grey
    'CA-102': 'https://images.unsplash.com/photo-1563717232235-9614488b0d1b?w=600&q=80', // Same
    'CA-103': 'https://images.unsplash.com/photo-1534349762230-e0cadf78f5da?w=600&q=80', // Fabric/Carpet detail
    'CA-104': 'https://images.unsplash.com/photo-1574968844883-29a508920cb9?w=600&q=80', // Grey carpet texture
    'SL-001': 'https://images.unsplash.com/photo-1518709414768-a88981a4515d?w=600&q=80', // Self leveling/cement

    // Partitions
    'GL-101': 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=600&q=80', // Glass office partition
    'GL-102': 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=600&q=80', // Modern office glass
    'WD-101': 'https://images.unsplash.com/photo-1595133481232-a7457a41fc9a?w=600&q=80', // Wood wall interior
    'WD-102': 'https://images.unsplash.com/photo-1595133481232-a7457a41fc9a?w=600&q=80',
    'AP-104': 'https://images.unsplash.com/photo-1549416878-b97f8c052a34?w=600&q=80', // Acoustic wall
    'TEMP-PART': 'https://images.unsplash.com/photo-1589136709893-b78ee2081594?w=600&q=80', // Board/Temp wall

    // Ceiling
    'AP-101': 'https://images.unsplash.com/photo-1595515106969-1ce29569ff53?w=600&q=80', // White ceiling
    'WS-101': 'https://images.unsplash.com/photo-1615800098779-1be32e60cca3?w=600&q=80', // Wood slats
    'C-01': 'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=600&q=80', // Painted ceiling

    // Doors/Windows
    'CUR-2600': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80', // Curtain
    'CUR-6200': 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&q=80',
    'SLD-01': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80', // Sliding glass door

    // Pantry
    'LA-201-B': 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=600&q=80', // Kitchen Cabinet
    'LF-29A-O': 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=600&q=80', // Kitchen Overhead
    'COF-TBL': 'https://images.unsplash.com/photo-1577140917170-285929fb55b7?w=600&q=80', // Coffee Table
    'WB-101': 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=600&q=80', // Whiteboard

    // Finishes
    'PT-202': 'https://images.unsplash.com/photo-1562663474-6cbb3eaa4d14?w=600&q=80', // Paint
    'ART-1920': 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=600&q=80' // Art
};

function run() {
    try {
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        dbContent.products = dbContent.products.map(p => {
            // Exact match preferred
            if (descriptionMap[p.model]) {
                return { ...p, imageUrl: descriptionMap[p.model] };
            }

            const desc = p.description.toLowerCase();
            let url = ''; // Default empty

            // Description-based matching
            if (desc.includes('marble') || desc.includes('stone')) url = descriptionMap['MA-101'];
            else if (desc.includes('carpet')) url = descriptionMap['CA-101'];
            else if (desc.includes('glass') && desc.includes('partition')) url = descriptionMap['GL-101'];
            else if (desc.includes('wood') && desc.includes('cladding')) url = descriptionMap['WD-101'];
            else if (desc.includes('kitchen') || desc.includes('cabinet')) url = descriptionMap['LA-201-B'];
            else if (desc.includes('curtain')) url = descriptionMap['CUR-2600'];
            else if (desc.includes('safety') || desc.includes('ppe')) url = descriptionMap['HSE-01'];

            // Fallback to Category
            if (!url) {
                if (p.mainCategory.includes('Flooring')) url = descriptionMap['MA-101'];
                else if (p.mainCategory.includes('Partitions')) url = descriptionMap['GL-101'];
            }

            if (url) return { ...p, imageUrl: url };
            return p;
        });

        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Applied Descriptive Reference Images.");
    } catch (e) {
        console.error(e);
    }
}

run();
