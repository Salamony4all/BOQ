/**
 * ScrapingBee Cloud Scraper
 * Uses ScrapingBee API for web scraping with anti-bot bypass - works on Vercel serverless
 */

import { ScrapingBeeClient } from 'scrapingbee';
import * as cheerio from 'cheerio';

class ScrapingBeeScraper {
    constructor() {
        this.apiKey = process.env.SCRAPINGBEE_API_KEY;
        this.client = this.apiKey ? new ScrapingBeeClient(this.apiKey) : null;
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    }

    /**
     * Check if ScrapingBee is configured
     */
    isConfigured() {
        // Double check process.env in case it loaded late
        if (!this.apiKey && process.env.SCRAPINGBEE_API_KEY) {
            this.apiKey = process.env.SCRAPINGBEE_API_KEY;
            this.client = new ScrapingBeeClient(this.apiKey);
        }
        return !!this.apiKey;
    }

    /**
     * Fetch a page using ScrapingBee with premium proxies
     */
    async fetchPage(url, options = {}) {
        if (!this.client) {
            throw new Error('ScrapingBee API key not configured');
        }

        console.log(`📡 Fetching: ${url}`);

        try {
            const response = await this.client.get({
                url: url,
                params: {
                    // Use premium proxy for anti-bot bypass
                    // Note: render_js causes 500 errors on Architonic, so we use static HTML
                    premium_proxy: 'true',
                    country_code: 'de', // Germany - closer to Architonic's origin
                    ...options.params
                }
            });

            if (response.status !== 200) {
                throw new Error(`ScrapingBee returned status ${response.status}`);
            }

            return response.data.toString();
        } catch (error) {
            console.error(`❌ ScrapingBee error for ${url}:`, error.message);
            throw error;
        }
    }

    /**
     * Extract brand info from page HTML
     */
    extractBrandInfo(html, url) {
        const $ = cheerio.load(html);

        let name = $('h1').first().text().trim();
        if (name) {
            name = name
                .replace(/Collections by/i, '')
                .replace(/Products by/i, '')
                .replace(/Collections/i, '')
                .replace(/Products/i, '')
                .trim();
        }

        if (!name || name.length < 2) {
            name = $('title').text().split(/[|–\-:]/)[0].trim() || 'Unknown';
        }

        let logo = '';
        const logoSelectors = ['img[src*="logo"]', '.logo img', 'header img'];
        for (const sel of logoSelectors) {
            const src = $(sel).first().attr('src');
            if (src) {
                logo = src.startsWith('http') ? src : new URL(src, url).href;
                break;
            }
        }

        return { name, logo };
    }

    /**
     * Extract collection links from Architonic page
     */
    extractCollectionLinks(html, baseUrl) {
        const $ = cheerio.load(html);
        const links = new Set();

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            try {
                const fullUrl = new URL(href, baseUrl).href;
                if (fullUrl.includes('architonic.com') &&
                    (fullUrl.includes('/collection/') ||
                        fullUrl.includes('/collections/') ||
                        fullUrl.includes('/products/'))) {
                    links.add(fullUrl);
                }
            } catch (e) { }
        });

        return [...links].slice(0, 15); // Limit for API credits
    }

    /**
     * Extract product links from a collection page
     */
    extractProductLinks(html) {
        const $ = cheerio.load(html);
        const links = new Set();

        $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (href && /\/p\/[a-z0-9-]+\d+\/?/i.test(href)) {
                try {
                    const fullUrl = new URL(href, 'https://www.architonic.com').href;
                    links.add(fullUrl);
                } catch (e) { }
            }
        });

        return [...links].slice(0, 50); // Limit per collection
    }

    /**
     * Extract product details from a product page
     */
    extractProductDetails(html, url) {
        const $ = cheerio.load(html);

        const name = $('h1').first().text().trim() || '';

        // Get image
        let imageUrl = '';
        const imgSelectors = [
            'img.opacity-100',
            'img[src*="/product/"]',
            '#product-page img',
            'main img'
        ];

        for (const sel of imgSelectors) {
            const src = $(sel).first().attr('src');
            if (src && src.includes('architonic.com') && !src.includes('logo') && !src.includes('/family/')) {
                imageUrl = src;
                break;
            }
        }

        // Fallback: find any large product image
        if (!imageUrl) {
            $('img').each((i, el) => {
                const src = $(el).attr('src');
                if (src && src.includes('architonic.com') && !src.includes('logo')) {
                    imageUrl = src;
                    return false;
                }
            });
        }

        // Get description
        let description = $('meta[name="description"]').attr('content') || '';
        if (!description || description.length < 30) {
            description = $('.product-description, #description, .details-content').first().text().trim() || name;
        }

        // Get variant ID from URL
        let model = name;
        try {
            const urlParts = url.split('/').filter(Boolean);
            const lastPart = urlParts[urlParts.length - 1];
            const idMatch = lastPart.match(/-(\d+)$/);
            if (idMatch && idMatch[1]) {
                model = `${name} #${idMatch[1]}`;
            }
        } catch (e) { }

        return { name, model, imageUrl, description };
    }

    /**
     * Main scrape method for Architonic
     */
    async scrapeArchitonic(url, onProgress = null) {
        console.log(`\n🐝 [ScrapingBee] Starting Architonic Scrape: ${url}`);

        const allProducts = [];
        let brandName = 'Architonic Brand';
        let brandLogo = '';

        try {
            if (onProgress) onProgress(10, 'Connecting to ScrapingBee...');

            // Fetch main page
            if (onProgress) onProgress(15, 'Fetching brand page...');
            const mainHtml = await this.fetchPage(url, {
                params: { wait: 5000 }
            });

            // Check for blocking
            if (mainHtml.includes('403') || mainHtml.includes('Access Denied')) {
                throw new Error('Site returned 403 - access blocked');
            }

            // Extract brand info
            if (onProgress) onProgress(20, 'Extracting brand info...');
            const brandInfo = this.extractBrandInfo(mainHtml, url);
            brandName = brandInfo.name;
            brandLogo = brandInfo.logo;
            console.log(`   Brand: ${brandName}`);
            if (onProgress) onProgress(25, `Found: ${brandName}`, brandName);

            // Get collection links
            if (onProgress) onProgress(30, 'Finding collections...');
            const collectionLinks = this.extractCollectionLinks(mainHtml, url);
            console.log(`   Found ${collectionLinks.length} collections`);

            // Also get direct product links from main page
            const directProducts = this.extractProductLinks(mainHtml);
            console.log(`   Found ${directProducts.length} direct product links`);

            // Scrape each collection
            let collectionIndex = 0;
            for (const collUrl of collectionLinks) {
                collectionIndex++;
                const progress = 30 + Math.round((collectionIndex / collectionLinks.length) * 30);

                try {
                    if (onProgress) onProgress(progress, `Scraping collection ${collectionIndex}/${collectionLinks.length}...`);

                    const collHtml = await this.fetchPage(collUrl, { params: { wait: 3000 } });

                    // Get collection name from HTML
                    const $ = cheerio.load(collHtml);
                    const collectionName = $('h1').first().text().trim() || 'Collection';

                    // Get product links
                    const productLinks = this.extractProductLinks(collHtml);
                    console.log(`   📦 ${collectionName}: ${productLinks.length} products`);

                    // Scrape each product (limit to save API credits)
                    for (const prodUrl of productLinks.slice(0, 20)) {
                        try {
                            const prodHtml = await this.fetchPage(prodUrl, { params: { wait: 2000 } });
                            const product = this.extractProductDetails(prodHtml, prodUrl);

                            if (product.name && product.imageUrl) {
                                allProducts.push({
                                    mainCategory: 'Furniture',
                                    subCategory: collectionName,
                                    family: brandName,
                                    model: product.model,
                                    description: product.description,
                                    imageUrl: product.imageUrl,
                                    productUrl: prodUrl,
                                    price: 0
                                });

                                if (onProgress) {
                                    const prog = Math.min(85, progress + (allProducts.length % 10));
                                    onProgress(prog, `[${allProducts.length}] ${product.model}`);
                                }
                            }
                        } catch (prodError) {
                            console.log(`   ⚠️ Failed product: ${prodUrl.substring(0, 50)}...`);
                        }
                    }
                } catch (collError) {
                    console.log(`   ⚠️ Failed collection: ${collUrl.substring(0, 50)}...`);
                }
            }

            // Scrape direct products if we haven't found enough
            if (allProducts.length < 30 && directProducts.length > 0) {
                if (onProgress) onProgress(75, 'Scraping featured products...');

                for (const prodUrl of directProducts.slice(0, 15)) {
                    try {
                        const prodHtml = await this.fetchPage(prodUrl, { params: { wait: 2000 } });
                        const product = this.extractProductDetails(prodHtml, prodUrl);

                        if (product.name && product.imageUrl) {
                            allProducts.push({
                                mainCategory: 'Furniture',
                                subCategory: 'Featured',
                                family: brandName,
                                model: product.model,
                                description: product.description,
                                imageUrl: product.imageUrl,
                                productUrl: prodUrl,
                                price: 0
                            });
                        }
                    } catch (e) { }
                }
            }

            if (onProgress) onProgress(95, 'Finalizing...');

        } catch (error) {
            console.error('ScrapingBee scrape error:', error.message);

            if (allProducts.length > 0) {
                console.log(`⚠️ Partial result: ${allProducts.length} products`);
                if (onProgress) onProgress(90, `Partial: ${allProducts.length} products`);
            } else {
                throw new Error(`Scraping failed: ${error.message}`);
            }
        }

        // Deduplicate
        const seen = new Set();
        const uniqueProducts = allProducts.filter(p => {
            const key = `${p.model}|${p.imageUrl}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`\n✅ ScrapingBee complete: ${uniqueProducts.length} products`);
        if (onProgress) onProgress(100, 'Complete!');

        return {
            products: uniqueProducts,
            brandInfo: { name: brandName, logo: brandLogo }
        };
    }

    /**
     * Universal scrape for non-Architonic sites
     */
    async scrapeUniversal(url, onProgress = null) {
        console.log(`\n🐝 [ScrapingBee] Starting Universal Scrape: ${url}`);

        const allProducts = [];
        const baseUrl = new URL(url).origin;

        try {
            if (onProgress) onProgress(15, 'Fetching page...');

            // Use JS rendering for general sites (better for SPAs/lazy load)
            const html = await this.fetchPage(url, { params: { wait: 5000, render_js: 'true' } });

            if (onProgress) onProgress(30, 'Extracting brand info...');
            const brandInfo = this.extractBrandInfo(html, url);
            if (onProgress) onProgress(40, `Found: ${brandInfo.name}`, brandInfo.name);

            if (onProgress) onProgress(50, 'Extracting products...');

            // Helper to extract products from a given HTML
            const extractFromHtml = (htmlSource, categoryName = 'General') => {
                const $ = cheerio.load(htmlSource);
                const found = [];
                const selectors = ['.product', '.product-item', '.product-card', '[class*="product"]', 'li.item', 'div.item']; // Added more generic selectors

                for (const selector of selectors) {
                    $(selector).each((i, el) => {
                        const $el = $(el);
                        // Try various title/name selectors
                        let title = $el.find('h2, h3, h4, h5, .title, .name, .product-name').first().text().trim();
                        // Special for Amara: checks for generic text if heading missing
                        if (!title) title = $el.find('a').first().text().trim();

                        // Image extraction
                        let imgSrc = $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src');
                        let link = $el.find('a[href]').first().attr('href');

                        // Clean up relative URLs
                        if (imgSrc && !imgSrc.startsWith('http')) imgSrc = new URL(imgSrc, baseUrl).href;
                        if (link && !link.startsWith('http') && link) link = new URL(link, baseUrl).href;

                        if (title && title.length > 2 && imgSrc && !imgSrc.includes('logo')) {
                            found.push({
                                mainCategory: 'Products',
                                subCategory: categoryName,
                                family: brandInfo.name,
                                model: title,
                                description: title,
                                imageUrl: imgSrc,
                                productUrl: link || url,
                                price: 0
                            });
                        }
                    });
                    if (found.length > 0) break;
                }
                return found;
            };
            // 1. Try generic extraction on main page
            const mainPageProducts = extractFromHtml(html);
            allProducts.push(...mainPageProducts);

            // 2. Always look for Categories (Amara Art style) to ensure full coverage
            // The main page oftentimes only shows a subset.
            console.log(`   Main page yielded ${mainPageProducts.length} products. Scanning for comprehensive categories...`);
            if (onProgress) onProgress(60, 'Scanning for categories...');

            const $ = cheerio.load(html);
            const categoryLinks = [];

            // Amara Art / regex style sidebar detection
            console.log('   --- Scanning all links for categories ---');
            $('a').each((i, el) => {
                const $el = $(el);
                const href = $el.attr('href');
                if (!href || href.includes('javascript') || href === '#') return;

                const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href;
                if (fullUrl === url || categoryLinks.some(c => c.url === fullUrl)) return;

                // Strategy 1: Check Anchor Text
                let text = $el.text().replace(/\s+/g, ' ').trim();
                let match = text.match(/^(.+?)\s*\(\s*(\d+)\s*\)$/);

                // Strategy 2: Check Parent Text (if count is sibling)
                if (!match) {
                    const parentText = $el.parent().text().replace(/\s+/g, ' ').trim();
                    match = parentText.match(/^(.+?)\s*\(\s*(\d+)\s*\)$/);
                }

                // Strategy 3: URL Pattern Fallback (Amara uses /product-category/)
                const isAmaraCategory = fullUrl.includes('/product-category/');

                if (match) {
                    const name = match[1].trim();
                    const count = match[2];
                    console.log(`      ✅ MATCHED CATEGORY (Regex): "${name}" (${count} items)`);
                    categoryLinks.push({ url: fullUrl, name: name });
                } else if (isAmaraCategory) {
                    // Extract name from URL if possible
                    const nameFromUrl = fullUrl.split('/').filter(x => x).pop().replace(/-/g, ' ').toUpperCase();
                    console.log(`      ✅ MATCHED CATEGORY (URL): "${nameFromUrl}"`);
                    categoryLinks.push({ url: fullUrl, name: nameFromUrl });
                }
            });

            if (categoryLinks.length > 0) {
                console.log(`   Found ${categoryLinks.length} categories. Starting deep scan...`);

                // Fetch each category
                for (let i = 0; i < categoryLinks.length; i++) {
                    const cat = categoryLinks[i];
                    if (onProgress) onProgress(60 + Math.round((i / categoryLinks.length) * 30), `Scraping category: ${cat.name}...`);

                    try {
                        let currentUrl = cat.url;
                        let pageNum = 1;
                        let hasNextPage = true;

                        while (hasNextPage && pageNum <= 5) { // Limit to 5 pages per category to save credits/time
                            console.log(`      Fetching ${cat.name} Page ${pageNum}...`);

                            // Check if configured
                            if (!this.isConfigured()) {
                                if (process.env.SCRAPINGBEE_API_KEY) this.client = new ScrapingBeeClient(process.env.SCRAPINGBEE_API_KEY);
                            }

                            const catHtml = await this.fetchPage(currentUrl, { params: { wait: 3000, render_js: 'true' } });
                            const catProducts = extractFromHtml(catHtml, cat.name);

                            if (catProducts.length === 0) {
                                break;
                            }

                            console.log(`      Found ${catProducts.length} products in ${cat.name} (Page ${pageNum})`);
                            allProducts.push(...catProducts);

                            // Detect Next Page
                            const $cat = cheerio.load(catHtml);
                            const nextLink = $cat('a.next, a.next-page, a[rel="next"], .pagination a:last-child').first().attr('href');

                            if (nextLink && pageNum < 5) {
                                currentUrl = nextLink.startsWith('http') ? nextLink : new URL(nextLink, baseUrl).href;
                                pageNum++;
                                // Small delay between pages
                                await new Promise(r => setTimeout(r, 1000));
                            } else {
                                hasNextPage = false;
                            }
                        }

                    } catch (e) {
                        console.error(`      Failed to scrape ${cat.name}: ${e.message}`);
                    }
                }
            }

            if (onProgress) onProgress(90, `Found total ${allProducts.length} products`);

        } catch (error) {
            console.error('ScrapingBee universal error:', error.message);
            throw error;
        }

        console.log(`\n✅ Universal scrape complete: ${allProducts.length} products`);
        if (onProgress) onProgress(100, 'Complete!');

        return {
            products: allProducts,
            brandInfo: this.extractBrandInfo(allProducts.length ? '<html></html>' : '<html></html>', url) // Fallback
        };
    }

    /**
     * Main entry point
     */
    async scrapeBrand(url, onProgress = null) {
        if (!this.isConfigured()) {
            throw new Error('ScrapingBee API key not configured. Please add SCRAPINGBEE_API_KEY to your environment variables. Get a free key at https://scrapingbee.com');
        }

        if (url.includes('architonic.com')) {
            return await this.scrapeArchitonic(url, onProgress);
        } else {
            return await this.scrapeUniversal(url, onProgress);
        }
    }
}

export default ScrapingBeeScraper;
