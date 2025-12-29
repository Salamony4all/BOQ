import { createClient } from '@vercel/kv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';

// Support multiple Vercel environment naming conventions
const KV_URL = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_TOKEN;

// Initialize KV client
let kv = null;
if (KV_URL && KV_TOKEN) {
    try {
        kv = createClient({ url: KV_URL, token: KV_TOKEN });
    } catch (e) {
        console.error('[Storage] Failed to initialize KV client:', e.message);
    }
}

async function getLocalBrands() {
    // Try multiple possible paths where Vercel/Node might place the data
    const possiblePaths = [
        isVercel ? '/tmp/data/brands' : path.join(process.cwd(), 'server/data/brands'),
        path.join(process.cwd(), 'server/data/brands'),
        path.join(__dirname, 'data/brands'),
        '/var/task/server/data/brands'
    ];

    const allBrands = [];
    const seenIds = new Set();

    for (const brandsPath of possiblePaths) {
        try {
            const files = await fs.readdir(brandsPath);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            if (jsonFiles.length > 0) {
                console.log(`[Storage] Found ${jsonFiles.length} brands in ${brandsPath}`);
                const brands = await Promise.all(jsonFiles.map(async file => {
                    try {
                        const content = await fs.readFile(path.join(brandsPath, file), 'utf8');
                        return JSON.parse(content);
                    } catch (e) { return null; }
                }));

                for (const brand of brands) {
                    if (brand && !seenIds.has(brand.id)) {
                        seenIds.add(brand.id);
                        allBrands.push(brand);
                    }
                }
            }
        } catch (e) { /* silent skip */ }
    }
    return allBrands;
}

export const brandStorage = {
    async getAllBrands() {
        if (isVercel && kv) {
            try {
                let keys = await kv.keys('brand:*');

                // If KV is empty, try to migrate from local bundled data
                if (keys.length === 0) {
                    console.log('[Storage] KV empty, attempting migration...');
                    const localBrands = await getLocalBrands();
                    if (localBrands.length > 0) {
                        for (const brand of localBrands) {
                            await kv.set(`brand:${brand.id}`, brand);
                        }
                        keys = await kv.keys('brand:*');
                        console.log(`[Storage] Migrated ${localBrands.length} brands to KV.`);
                    }
                }

                if (keys.length === 0) {
                    // Even if KV empty, return local brands
                    return await getLocalBrands();
                }

                // 1. Get KV Brands
                const kvBrandsRaw = await kv.mget(...keys);
                const kvBrands = kvBrandsRaw.filter(Boolean);

                // 2. Get Local Brands (Filesystem / Tmp)
                // We MUST check local storage too, because fallback saves go there
                const localBrands = await getLocalBrands();

                // 3. Merge them (KV takes precedence if ID matches)
                const brandMap = new Map();

                // Add local first
                localBrands.forEach(b => brandMap.set(String(b.id), b));

                // Overwrite with KV (newer)
                kvBrands.forEach(b => brandMap.set(String(b.id), b));

                return Array.from(brandMap.values());
            } catch (error) {
                console.error('[Storage] Vercel KV error:', error.message);
                // Fallback to local data if KV fails
                return await getLocalBrands();
            }
        } else {
            // Local dev or Vercel without KV - use local data
            return await getLocalBrands();
        }
    },

    async getBrandById(brandId) {
        if (kv) {
            try {
                const brand = await kv.get(`brand:${brandId}`);
                if (brand) return brand;
            } catch (error) { /* fallback */ }
        }
        const brands = await this.getAllBrands();
        return brands.find(b => String(b.id) === String(brandId));
    },

    async saveBrand(brand) {
        if (kv) {
            try {
                await kv.set(`brand:${brand.id}`, brand);
                return true;
            } catch (error) { return false; }
        } else {
            // Local dev save OR Vercel /tmp fallback
            try {
                // On Vercel, use /tmp/data/brands. On local, use server/data/brands
                const baseDir = isVercel ? '/tmp/data/brands' : path.join(__dirname, 'data/brands');

                const sanitizedName = brand.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const filename = `${sanitizedName}-${brand.budgetTier || 'mid'}.json`;

                await fs.mkdir(baseDir, { recursive: true });
                await fs.writeFile(path.join(baseDir, filename), JSON.stringify(brand, null, 2));
                return true;
            } catch (error) {
                console.error('[Storage] Filesystem save failed:', error);
                return false;
            }
        }
    },

    async deleteBrand(brandId) {
        if (kv) {
            try {
                await kv.del(`brand:${brandId}`);
                return true;
            } catch (error) { return false; }
        } else {
            try {
                const baseDir = isVercel ? '/tmp/data/brands' : path.join(__dirname, 'data/brands');
                // Check if dir exists first
                try {
                    await fs.access(baseDir);
                } catch { return false; }

                const files = await fs.readdir(baseDir);
                for (const file of files) {
                    const fullPath = path.join(baseDir, file);
                    const content = await fs.readFile(fullPath, 'utf8');
                    const data = JSON.parse(content);
                    if (String(data.id) === String(brandId)) {
                        await fs.unlink(fullPath);
                        return true;
                    }
                }
                return false;
            } catch (error) { return false; }
        }
    }
};
