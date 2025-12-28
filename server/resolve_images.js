
import fs from 'fs';
import https from 'https';

const dbPath = 'c:\\Users\\Mohamad60025\\Desktop\\App\\BOQ\\server\\data\\brands\\fitout_v2-mid.json';

// Short IDs mapping to Item Types
const shortIds = {
    construction: ['HtLkTOr_DQc', 'kpFClmPZdYQ', 'VAhJP5c-XdI'],
    safety: ['wjHdeYmI-XU', '6203Ynp5ZqE'],
    marble_white: ['li0iC0rjvvg', 'UjupleczBOY', 'fcWAwPKpkTU'],
    marble_dark: ['_zrnJ3_bzlo', 'tqu0IOMaiU8'], // Actually check if these are dark later, but good enough
    carpet: ['VT1l61Uw9y0', 'M5hivO17H5M', 'eBwGgqSt1QA', 'WzFBUXQChFU'],
    wood: ['NDQIHPA9Iv0', '2SNC9jVruBc', 'Ol-Toob2BJU', '5jBOTtpGcbk'],
    metal: ['3d0t2HHaY9o'], // From construction chunk?
    glass: ['li0iC0rjvvg'] // Fallback to clean white
};

const resolvedUrls = {};

function fetchOgImage(shortId) {
    return new Promise((resolve, reject) => {
        const url = `https://unsplash.com/photos/${shortId}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                // Look for <meta property="og:image" content="..."
                const match = data.match(/<meta property="og:image" content="([^"]+)"/);
                if (match && match[1]) {
                    // resize to 600px width for performance
                    let imgUrl = match[1];
                    if (imgUrl.includes('?')) {
                        imgUrl = imgUrl.split('?')[0] + '?w=600&q=80';
                    } else {
                        imgUrl += '?w=600&q=80';
                    }
                    resolve(imgUrl);
                } else {
                    console.log(`Failed to find og:image for ${shortId}`);
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error(`Error fetching ${shortId}: ${err.message}`);
            resolve(null);
        });
    });
}

async function resolveAll() {
    console.log("Resolving Unsplash URLs...");

    // Flatten list to resolve unique IDs
    const allIds = new Set();
    Object.values(shortIds).forEach(arr => arr.forEach(id => allIds.add(id)));

    for (const id of allIds) {
        const url = await fetchOgImage(id);
        if (url) {
            resolvedUrls[id] = url;
            console.log(`Resolved ${id} -> ${url.substring(0, 50)}...`);
        }
    }

    applyToDb();
}

function applyToDb() {
    try {
        const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        let changed = 0;

        // Helper to get random resolved URL for a category
        const getUrl = (cat) => {
            const ids = shortIds[cat];
            const validIds = ids.filter(id => resolvedUrls[id]);
            if (validIds.length === 0) return null;
            // Pick based on some hash or simple rotation? random for now
            return resolvedUrls[validIds[Math.floor(Math.random() * validIds.length)]];
        };

        const getSpecificUrl = (cat, index) => {
            const ids = shortIds[cat];
            const validIds = ids.filter(id => resolvedUrls[id]);
            if (validIds.length === 0) return null;
            return resolvedUrls[validIds[index % validIds.length]];
        }

        dbContent.products = dbContent.products.map(p => {
            let newUrl = null;
            const model = p.model;

            // Map models to categories
            if (model.includes('MOB') || model.includes('DEB') || model.includes('UTIL')) newUrl = getSpecificUrl('construction', 0);
            else if (model.includes('HSE') || model.includes('INS')) newUrl = getSpecificUrl('safety', 0);
            else if (model.includes('MA-1') || model.includes('MA-2')) newUrl = getSpecificUrl('marble_white', 1); // 1 is UjupleczBOY
            else if (model.includes('CA-')) newUrl = getSpecificUrl('carpet', parseInt(model.split('-')[1]) || 0);
            else if (model.includes('WD') || model.includes('SK') || model.includes('LA') || model.includes('LF') || model.includes('COF') || model.includes('WS')) newUrl = getSpecificUrl('wood', parseInt(model.replace(/\D/g, '')) || 0);
            else if (model.includes('GL') || model.includes('SLD')) newUrl = getSpecificUrl('glass', 0);
            else if (model.includes('MT') || model.includes('BRS')) newUrl = getSpecificUrl('metal', 0) || getSpecificUrl('construction', 0);
            else if (model.includes('PT') || model.includes('WP') || model.includes('GYP')) newUrl = getSpecificUrl('marble_white', 0); // Clean wall texture
            else if (model.includes('AP')) newUrl = getSpecificUrl('carpet', 1); // Fabric panel

            // Default fallbacks
            if (!newUrl) {
                if (p.mainCategory.includes('Flooring')) newUrl = getSpecificUrl('marble_white', 0);
                else if (p.mainCategory.includes('General')) newUrl = getSpecificUrl('construction', 0);
                else newUrl = getSpecificUrl('marble_white', 2);
            }

            if (newUrl) {
                changed++;
                return { ...p, imageUrl: newUrl };
            }
            return p;
        });

        console.log(`Updated ${changed} items with resolved URLs.`);
        fs.writeFileSync(dbPath, JSON.stringify(dbContent, null, 2), 'utf8');
        console.log("Database saved.");

    } catch (e) {
        console.error("Error updating DB:", e);
    }
}

resolveAll();
