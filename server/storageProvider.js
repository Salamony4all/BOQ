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
        path.join(process.cwd(), 'server/data/brands'),
        path.join(__dirname, 'data/brands'),
        '/var/task/server/data/brands'
    ];

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
                return brands.filter(b => b !== null);
            }
        } catch (e) { /* silent skip */ }
    }
    return [];
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

                if (keys.length === 0) return [];
                const brands = await kv.mget(...keys);
                return brands.filter(Boolean);
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
            // Local dev save
            if (isVercel) {
                console.warn('[Storage] Cannot save brand to local disk on Vercel - KV is required.');
                return false;
            }
            try {
                const brandsDir = path.join(__dirname, 'data/brands');
                const sanitizedName = brand.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const filename = `${sanitizedName}-${brand.budgetTier || 'mid'}.json`;
                await fs.mkdir(brandsDir, { recursive: true });
                await fs.writeFile(path.join(brandsDir, filename), JSON.stringify(brand, null, 2));
                return true;
            } catch (error) { return false; }
        }
    },

    async deleteBrand(brandId) {
        if (kv) {
            try {
                await kv.del(`brand:${brandId}`);
                return true;
            } catch (error) { return false; }
        } else {
            if (isVercel) return false;
            try {
                const brandsDir = path.join(__dirname, 'data/brands');
                const files = await fs.readdir(brandsDir);
                for (const file of files) {
                    const fullPath = path.join(brandsDir, file);
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
