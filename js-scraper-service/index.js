/**
 * JS Scraper Microservice for Railway
 * 
 * This standalone service hosts all the JavaScript scrapers:
 * - ScraperService (Universal + Architonic)
 * - StructureScraper (Hierarchical Category Harvester)
 * 
 * Designed to be called from the main Vercel app as a sidecar.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import ScraperService from './scraper.js';
import StructureScraper from './structureScraper.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize scrapers
const scraperService = new ScraperService();
const structureScraper = new StructureScraper();

// Middleware
app.use(cors());
app.use(express.json());

// Task tracking for async operations
const tasks = new Map();

// ===================== HEALTH CHECK =====================
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'js-scraper-service',
        timestamp: new Date().toISOString(),
        scrapers: ['universal', 'architonic', 'structure']
    });
});

// ===================== TASK STATUS =====================
app.get('/tasks/:id', (req, res) => {
    const task = tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
});

// Cancel a task
app.delete('/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const task = tasks.get(taskId);
    if (task) {
        tasks.set(taskId, { ...task, status: 'cancelled', stage: 'Cancelled by user' });
        console.log(`🛑 Task ${taskId} cancelled.`);
        return res.json({ success: true, message: 'Task cancelled' });
    }
    res.status(404).json({ error: 'Task not found' });
});

// ===================== UNIVERSAL SCRAPER =====================
app.post('/scrape', async (req, res) => {
    try {
        const { url, name, sync = false } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`\n🌐 [JS Scraper Service] Received scrape request for: ${url}`);

        // Synchronous mode - wait for result (for simple/fast scrapes)
        if (sync) {
            console.log('   Running in SYNC mode...');
            const result = await scraperService.scrapeBrand(url);
            return res.json({
                success: true,
                products: result.products || [],
                brandInfo: result.brandInfo || { name: name || 'Unknown', logo: '' },
                productCount: (result.products || []).length
            });
        }

        // Async mode - return task ID immediately
        const taskId = `js_scrape_${Date.now()}`;
        const initialStage = url.includes('architonic.com')
            ? 'Initializing Architonic crawler...'
            : 'Initializing universal scraper...';

        tasks.set(taskId, {
            id: taskId,
            status: 'processing',
            progress: 10,
            stage: initialStage,
            brandName: name || 'Detecting...',
            startedAt: new Date().toISOString()
        });

        // Run scraping in background
        (async () => {
            try {
                const progressCallback = (progress, stage, detectedName = null) => {
                    const currentTask = tasks.get(taskId);
                    if (!currentTask || currentTask.status === 'cancelled') return;
                    tasks.set(taskId, {
                        ...currentTask,
                        progress,
                        stage,
                        brandName: detectedName || currentTask.brandName
                    });
                };
                progressCallback.isCancelled = () => tasks.get(taskId)?.status === 'cancelled';

                const result = await scraperService.scrapeBrand(url, progressCallback);

                const products = result.products || [];
                const brandName = name || result.brandInfo?.name || 'Unknown Brand';
                const brandLogo = result.brandInfo?.logo || '';

                tasks.set(taskId, {
                    id: taskId,
                    status: 'completed',
                    progress: 100,
                    stage: 'Complete!',
                    products,
                    brandInfo: { name: brandName, logo: brandLogo },
                    productCount: products.length,
                    completedAt: new Date().toISOString()
                });

                console.log(`✅ Task ${taskId} completed with ${products.length} products`);

            } catch (error) {
                console.error(`❌ Task ${taskId} failed:`, error.message);
                tasks.set(taskId, {
                    id: taskId,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }
        })();

        res.json({
            success: true,
            message: 'Scraping started in background',
            taskId
        });

    } catch (error) {
        console.error('Scrape endpoint error:', error);
        res.status(500).json({ error: 'Scraping failed', details: error.message });
    }
});

// ===================== STRUCTURE SCRAPER =====================
app.post('/scrape-structure', async (req, res) => {
    try {
        const { url, name, sync = false } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        console.log(`\n🏗️ [JS Scraper Service] Structure scrape request for: ${url}`);

        // Sync mode
        if (sync) {
            console.log('   Running in SYNC mode...');
            const result = await structureScraper.scrapeBrand(url, name);
            return res.json({
                success: true,
                products: result.products || [],
                brandInfo: result.brandInfo || { name: name || 'Unknown', logo: '' },
                productCount: (result.products || []).length
            });
        }

        // Async mode
        const taskId = `structure_${Date.now()}`;
        tasks.set(taskId, {
            id: taskId,
            status: 'processing',
            progress: 10,
            stage: 'Initializing structure harvester...',
            brandName: name || 'Detecting...',
            startedAt: new Date().toISOString()
        });

        // Run in background
        (async () => {
            try {
                const progressCallback = (progress, stage, detectedName = null) => {
                    const currentTask = tasks.get(taskId);
                    if (!currentTask || currentTask.status === 'cancelled') return;
                    tasks.set(taskId, {
                        ...currentTask,
                        progress,
                        stage,
                        brandName: detectedName || currentTask.brandName
                    });
                };
                progressCallback.isCancelled = () => tasks.get(taskId)?.status === 'cancelled';

                const result = await structureScraper.scrapeBrand(url, name, progressCallback);

                const products = result.products || [];
                const brandName = name || result.brandInfo?.name || 'Unknown Brand';

                tasks.set(taskId, {
                    id: taskId,
                    status: 'completed',
                    progress: 100,
                    stage: 'Harvest Complete!',
                    products,
                    brandInfo: result.brandInfo,
                    productCount: products.length,
                    completedAt: new Date().toISOString()
                });

                console.log(`✅ Structure task ${taskId} completed with ${products.length} products`);

            } catch (error) {
                console.error(`❌ Structure task ${taskId} failed:`, error.message);
                tasks.set(taskId, {
                    id: taskId,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }
        })();

        res.json({
            success: true,
            message: 'Structure scraping started in background',
            taskId
        });

    } catch (error) {
        console.error('Structure scrape endpoint error:', error);
        res.status(500).json({ error: 'Structure scraping failed', details: error.message });
    }
});

// ===================== ARCHITONIC SPECIFIC =====================
app.post('/scrape-architonic', async (req, res) => {
    try {
        const { url, name, sync = false } = req.body;

        if (!url || !url.includes('architonic.com')) {
            return res.status(400).json({ error: 'Valid Architonic URL is required' });
        }

        console.log(`\n🏛️ [JS Scraper Service] Architonic scrape request for: ${url}`);

        // Sync mode
        if (sync) {
            const result = await scraperService.scrapeArchitonic(url);
            return res.json({
                success: true,
                products: result.products || [],
                brandInfo: result.brandInfo || { name: name || 'Unknown', logo: '' },
                productCount: (result.products || []).length
            });
        }

        // Async mode
        const taskId = `architonic_${Date.now()}`;
        tasks.set(taskId, {
            id: taskId,
            status: 'processing',
            progress: 10,
            stage: 'Crawling Architonic collection...',
            brandName: name || 'Detecting...',
            startedAt: new Date().toISOString()
        });

        // Run in background
        (async () => {
            try {
                const progressCallback = (progress, stage, detectedName = null) => {
                    const currentTask = tasks.get(taskId);
                    if (!currentTask || currentTask.status === 'cancelled') return;
                    tasks.set(taskId, {
                        ...currentTask,
                        progress,
                        stage,
                        brandName: detectedName || currentTask.brandName
                    });
                };
                progressCallback.isCancelled = () => tasks.get(taskId)?.status === 'cancelled';

                const result = await scraperService.scrapeArchitonic(url, progressCallback);

                const products = result.products || [];
                const brandName = name || result.brandInfo?.name || 'Architonic Brand';

                tasks.set(taskId, {
                    id: taskId,
                    status: 'completed',
                    progress: 100,
                    stage: 'Architonic Harvest Complete!',
                    products,
                    brandInfo: result.brandInfo,
                    productCount: products.length,
                    completedAt: new Date().toISOString()
                });

                console.log(`✅ Architonic task ${taskId} completed with ${products.length} products`);

            } catch (error) {
                console.error(`❌ Architonic task ${taskId} failed:`, error.message);
                tasks.set(taskId, {
                    id: taskId,
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date().toISOString()
                });
            }
        })();

        res.json({
            success: true,
            message: 'Architonic scraping started in background',
            taskId
        });

    } catch (error) {
        console.error('Architonic scrape endpoint error:', error);
        res.status(500).json({ error: 'Architonic scraping failed', details: error.message });
    }
});




// ===================== START SERVER =====================
app.listen(PORT, () => {
    console.log(`\n🚀 JS Scraper Service running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 Universal scrape: POST /scrape`);
    console.log(`🏗️ Structure scrape: POST /scrape-structure`);
    console.log(`🏛️ Architonic scrape: POST /scrape-architonic`);
});
