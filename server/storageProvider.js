import { kv } from '@vercel/kv';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === '1';
const BRANDS_DIR = isVercel ? '/tmp/server/data/brands' : path.join(__dirname, 'data/brands');

export const brandStorage = {
    async getAllBrands() {
        const hasKV = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        if (isVercel && hasKV) {
            try {
                let keys = await kv.keys('brand:*');

                // --- Migration Logic ---
                if (keys.length === 0) {
                    console.log('Migrating local brands to Vercel KV...');
                    try {
                        const localFiles = await fs.readdir(path.join(__dirname, 'data/brands'));
                        const jsonFiles = localFiles.filter(f => f.endsWith('.json'));
                        for (const file of jsonFiles) {
                            const content = await fs.readFile(path.join(__dirname, 'data/brands', file), 'utf8');
                            const brand = JSON.parse(content);
                            await kv.set(`brand:${brand.id}`, brand);
                        }
                        keys = await kv.keys('brand:*');
                    } catch (migrationError) {
                        console.error('Migration failed:', migrationError);
                    }
                }
                // -----------------------

                if (keys.length === 0) return [];
                const brands = await kv.mget(...keys);
                return brands.filter(Boolean);
            } catch (error) {
                console.error('Vercel KV error (getAllBrands):', error);
                return [];
            }
        } else {
            try {
                await fs.mkdir(BRANDS_DIR, { recursive: true });
                const files = await fs.readdir(BRANDS_DIR);
                const jsonFiles = files.filter(f => f.endsWith('.json'));
                const brands = await Promise.all(jsonFiles.map(async file => {
                    try {
                        const content = await fs.readFile(path.join(BRANDS_DIR, file), 'utf8');
                        return JSON.parse(content);
                    } catch (e) {
                        return null;
                    }
                }));
                return brands.filter(b => b !== null);
            } catch (e) {
                return [];
            }
        }
    },

    async getBrandById(brandId) {
        const hasKV = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        if (isVercel && hasKV) {
            try {
                return await kv.get(`brand:${brandId}`);
            } catch (error) {
                console.error('Vercel KV error (getBrandById):', error);
                return null;
            }
        } else {
            const brands = await this.getAllBrands();
            return brands.find(b => String(b.id) === String(brandId));
        }
    },

    async saveBrand(brand) {
        const hasKV = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        if (isVercel && hasKV) {
            try {
                await kv.set(`brand:${brand.id}`, brand);
                return true;
            } catch (error) {
                console.error('Vercel KV error (saveBrand):', error);
                return false;
            }
        } else {
            try {
                const sanitizedName = brand.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
                const filename = `${sanitizedName}-${brand.budgetTier}.json`;
                await fs.mkdir(BRANDS_DIR, { recursive: true });
                await fs.writeFile(path.join(BRANDS_DIR, filename), JSON.stringify(brand, null, 2));
                return true;
            } catch (error) {
                console.error('Local FS error (saveBrand):', error);
                return false;
            }
        }
    },

    async deleteBrand(brandId) {
        const hasKV = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        if (isVercel && hasKV) {
            try {
                await kv.del(`brand:${brandId}`);
                return true;
            } catch (error) {
                console.error('Vercel KV error (deleteBrand):', error);
                return false;
            }
        } else {
            try {
                const files = await fs.readdir(BRANDS_DIR);
                for (const file of files) {
                    const fullPath = path.join(BRANDS_DIR, file);
                    const content = await fs.readFile(fullPath, 'utf8');
                    const data = JSON.parse(content);
                    if (String(data.id) === String(brandId)) {
                        await fs.unlink(fullPath);
                        return true;
                    }
                }
                return false;
            } catch (error) {
                console.error('Local FS error (deleteBrand):', error);
                return false;
            }
        }
    }
};
