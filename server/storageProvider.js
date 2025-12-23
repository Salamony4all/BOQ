import { createClient } from '@vercel/kv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';

// Initialize KV client with whatever prefix Vercel provided
const kv = createClient({
    url: process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const brandStorage = {
    async getAllBrands() {
        const hasKV = !!(process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

        if (isVercel && hasKV) {
            try {
                let keys = await kv.keys('brand:*');

                if (keys.length === 0) {
                    console.log('--- DB MIGRATION STARTING ---');
                    const possiblePaths = [
                        path.join(process.cwd(), 'server/data/brands'),
                        path.join(__dirname, 'data/brands'),
                        '/var/task/server/data/brands'
                    ];

                    for (const brandsPath of possiblePaths) {
                        try {
                            const exists = await fs.access(brandsPath).then(() => true).catch(() => false);
                            if (!exists) continue;

                            const localFiles = await fs.readdir(brandsPath);
                            const jsonFiles = localFiles.filter(f => f.endsWith('.json'));

                            if (jsonFiles.length > 0) {
                                for (const file of jsonFiles) {
                                    const content = await fs.readFile(path.join(brandsPath, file), 'utf8');
                                    const brand = JSON.parse(content);
                                    await kv.set(`brand:${brand.id}`, brand);
                                }
                                keys = await kv.keys('brand:*');
                                break;
                            }
                        } catch (e) { /* silent skip */ }
                    }
                }

                if (keys.length === 0) return [];
                const brands = await kv.mget(...keys);
                return brands.filter(Boolean);
            } catch (error) {
                console.error('Vercel KV error:', error);
                return [];
            }
        } else {
            // Local dev or Vercel without KV configured
            if (isVercel) return []; // Don't try local FS on Vercel without KV

            const brandsDir = path.join(__dirname, 'data/brands');
            try {
                await fs.mkdir(brandsDir, { recursive: true });
                const files = await fs.readdir(brandsDir);
                const jsonFiles = files.filter(f => f.endsWith('.json'));
                const brands = await Promise.all(jsonFiles.map(async file => {
                    try {
                        const content = await fs.readFile(path.join(brandsDir, file), 'utf8');
                        return JSON.parse(content);
                    } catch (e) { return null; }
                }));
                return brands.filter(b => b !== null);
            } catch (e) { return []; }
        }
    },

    async getBrandById(brandId) {
        const hasKV = !!(process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
        if (isVercel && hasKV) {
            try {
                return await kv.get(`brand:${brandId}`);
            } catch (error) { return null; }
        } else {
            const brands = await this.getAllBrands();
            return brands.find(b => String(b.id) === String(brandId));
        }
    },

    async saveBrand(brand) {
        const hasKV = !!(process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
        if (isVercel && hasKV) {
            try {
                await kv.set(`brand:${brand.id}`, brand);
                return true;
            } catch (error) { return false; }
        } else {
            if (isVercel) return false;
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
        const hasKV = !!(process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
        if (isVercel && hasKV) {
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
