
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { extractExcelData } from './fastExtractor.js';
import { CleanupService } from './cleanupService.js';
import ScraperService from './scraper.js';
import StructureScraper from './structureScraper.js';
import { ExcelDbManager } from './excelManager.js';
import { brandStorage } from './storageProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Initialize cleanup service
const cleanupService = new CleanupService();

// CORS configuration
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory
const isVercelLocal = process.env.VERCEL === '1';
app.use('/uploads', express.static(isVercelLocal ? '/tmp/uploads' : path.join(__dirname, '../uploads')));

// Multer configuration for file upload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const isVercel = process.env.VERCEL === '1';
    const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating uploads directory:', error);
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .xls and .xlsx files are allowed.'));
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload and extract endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const sessionId = req.headers['x-session-id'] || 'default';

    // Track file for cleanup
    cleanupService.trackFile(sessionId, filePath);

    // Extract data from Excel
    const extractedData = await extractExcelData(filePath, () => { });

    // Send final result
    res.json({
      success: true,
      data: extractedData,
      progress: 100,
      stage: 'Complete'
    });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({
      error: 'Failed to process Excel file',
      details: error.message
    });
  }
});

// Cleanup endpoint
app.post('/api/cleanup', async (req, res) => {
  const sessionId = req.body.sessionId || 'default';
  await cleanupService.cleanupSession(sessionId);
  res.json({ success: true });
});

// Image proxy endpoint - fetches external images and returns base64
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Fetch the image
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    res.json({ dataUrl, contentType });
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy image', details: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error'
  });
});

// Cleanup on server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await cleanupService.cleanupAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  await cleanupService.cleanupAll();
  process.exit(0);
});

// Reset/Cleanup endpoint for app initialization
app.post('/api/reset', async (req, res) => {
  console.log('Resetting application state...');
  await cleanupService.cleanupAll();
  // Re-create uploads directory immediately to ensure readiness
  const isVercel = process.env.VERCEL === '1';
  const uploadsDir = isVercel ? '/tmp/uploads' : path.join(__dirname, '../uploads');
  const imagesDir = path.join(uploadsDir, 'images');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(imagesDir, { recursive: true });
  } catch (e) { console.error('Error recreating dirs:', e); }
  res.json({ success: true, message: 'Environment reset complete' });
});

if (process.env.NODE_ENV !== 'production' || process.env.VITE_DEV_SERVER) {
  const server = app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);

    // Clean up on startup
    await cleanupService.cleanupAll();
  });
}


// ... existing code ...

// Brand persistence is now handled by brandStorage provider
// Initialized in separate module

const brandDiskStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const isVercel = process.env.VERCEL === '1';
    const brandsDir = isVercel ? '/tmp/uploads/brands' : path.join(__dirname, '../uploads/brands');
    try {
      await fs.mkdir(brandsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating brands directory:', error);
    }
    cb(null, brandsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const brandUpload = multer({
  storage: brandDiskStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.get('/api/brands', async (req, res) => {
  try {
    const brands = await brandStorage.getAllBrands();
    res.json(brands);
  } catch (error) {
    console.error("Failed to fetch brands:", error);
    res.status(500).json({ error: 'Failed to fetch brands' });
  }
});

app.delete('/api/brands/:id', async (req, res) => {
  try {
    const brandId = req.params.id;
    await brandStorage.deleteBrand(brandId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({ error: 'Failed to delete brand' });
  }
});



const scraperService = new ScraperService();
const structureScraper = new StructureScraper();
const dbManager = new ExcelDbManager();

// --- Task Manager for Background Scraping ---
const tasks = new Map();

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const task = tasks.get(taskId);
  if (task) {
    tasks.set(taskId, { ...task, status: 'cancelled', stage: 'Cancelled by user' });
    console.log(`🛑 Task ${taskId} cancelled by user.`);
    return res.json({ success: true, message: 'Task cancelled' });
  }
  res.status(404).json({ error: 'Task not found' });
});


// --- Scraping Endpoint ---
app.post('/api/scrape-brand', async (req, res) => {
  try {
    const { url } = req.body;

    // Extract brand name from URL if not provided
    let name = req.body.name;
    if (!name) {
      const urlObj = new URL(url);
      name = urlObj.hostname.replace('www.', '').split('.')[0].toUpperCase();
    }

    // Set defaults for optional fields
    const origin = req.body.origin || 'UNKNOWN';
    const budgetTier = req.body.budgetTier || 'mid';

    // Start scraping in background
    const taskId = `scrape_${Date.now()}`;
    tasks.set(taskId, { id: taskId, status: 'processing', progress: 10, stage: 'Starting harvest...', brandName: name });

    // Run in background
    (async () => {
      try {
        const result = await scraperService.scrapeBrand(url);
        const products = result.products || [];
        const brandLogo = result.brandInfo?.logo || '';

        const id = Date.now();
        const brandName = result.brandInfo?.name || name;
        const newBrand = {
          id,
          name: brandName,
          url,
          origin,
          budgetTier,
          logo: brandLogo,
          products,
          createdAt: new Date()
        };

        await brandStorage.saveBrand(newBrand);
        tasks.set(taskId, { id: taskId, status: 'completed', progress: 100, stage: 'Complete!', brand: newBrand, productCount: products.length });
      } catch (error) {
        console.error('Background scrape failed:', error);
        tasks.set(taskId, { id: taskId, status: 'failed', error: error.message });
      }
    })();

    res.json({
      success: true,
      message: 'Scraping started in background.',
      taskId: taskId
    });

  } catch (error) {
    console.error('Scraping failed:', error);
    res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
});

// --- AI-Powered Scraping Endpoint (Universal) ---
app.post('/api/scrape-ai', async (req, res) => {
  try {
    const { url, name, budgetTier = 'mid', origin = 'UNKNOWN', maxProducts = 10000 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Start background task
    const taskId = `ai_scrape_${Date.now()}`;
    const initialStage = url.includes('architonic.com') ? 'Detecting Architonic Collection...' : 'Initializing hierarchy harvest...';
    tasks.set(taskId, { id: taskId, status: 'processing', progress: 10, stage: initialStage, brandName: name || 'Detecting...' });

    // Run in background
    (async () => {
      try {
        let result;
        if (url.includes('architonic.com')) {
          // Use specialized Architonic scraper
          tasks.set(taskId, { ...tasks.get(taskId), stage: 'Crawling Architonic Collection...' });
          const progressCallback = (progress, stage, detectedName = null) => {
            const currentTask = tasks.get(taskId);
            if (!currentTask) return;
            tasks.set(taskId, {
              ...currentTask,
              progress,
              stage,
              brandName: detectedName || currentTask.brandName
            });
          };
          progressCallback.isCancelled = () => tasks.get(taskId)?.status === 'cancelled';
          result = await scraperService.scrapeBrand(url, progressCallback);
          tasks.set(taskId, { ...tasks.get(taskId), progress: 80, stage: 'Finalizing Architonic data...' });
        } else {
          // Use Universal Structure Scraper
          const progressCallback = (progress, stage, detectedName = null) => {
            const currentTask = tasks.get(taskId);
            if (!currentTask) return;
            tasks.set(taskId, {
              ...currentTask,
              progress,
              stage,
              brandName: detectedName || currentTask.brandName
            });
          };
          progressCallback.isCancelled = () => tasks.get(taskId)?.status === 'cancelled';
          result = await structureScraper.scrapeBrand(url, name, progressCallback);
        }

        const products = result.products || [];
        const brandNameFound = name || result.brandInfo?.name || 'Unknown Brand';
        const brandLogo = result.brandInfo?.logo || '';

        const id = Date.now();
        const newBrand = {
          id: id,
          name: brandNameFound,
          url,
          origin,
          budgetTier,
          logo: brandLogo,
          products,
          createdAt: new Date(),
          scrapedWith: url.includes('architonic.com') ? 'Architonic-Specialized' : 'Structure-Harvest'
        };

        await brandStorage.saveBrand(newBrand);
        tasks.set(taskId, {
          id: taskId,
          status: 'completed',
          progress: 100,
          stage: 'Harvest Complete!',
          brand: newBrand,
          productCount: products.length
        });
      } catch (error) {
        console.error('Background Scrape failed:', error);
        tasks.set(taskId, { id: taskId, status: 'failed', error: error.message });
      }
    })();

    res.json({
      success: true,
      message: 'Background hierarchical harvest started.',
      taskId
    });

  } catch (error) {
    console.error('AI Scraping failed:', error);
    res.status(500).json({ error: 'AI Scraping failed', details: error.message });
  }
});

// --- DB Management Endpoints ---
app.get('/api/brands/:id/export', async (req, res) => {
  try {
    const brandId = req.params.id;
    const brand = await brandStorage.getBrandById(brandId);

    if (!brand) {
      return res.status(404).send('Brand not found');
    }

    const workbook = await dbManager.exportToExcel(brand);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${brand.name.replace(/\s+/g, '_')}_products.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).send('Export failed');
  }
});

app.post('/api/brands/:id/import', upload.single('file'), async (req, res) => {
  try {
    const brandId = req.params.id;
    if (!req.file) return res.status(400).json({ error: 'No file' });

    const products = await dbManager.importFromExcel(req.file.path);

    brand.products = products; // Update products
    await brandStorage.saveBrand(brand);

    // Clean up uploaded file
    try { await fs.unlink(req.file.path); } catch (e) { }

    res.json({ success: true, count: products.length });

  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default app;
