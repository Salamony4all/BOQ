import 'dotenv/config';
import BrowserlessScraper from './server/browserlessScraper.js';

async function test() {
    console.log('=== Testing Browserless Scraper ===\n');
    console.log('API Key configured:', !!process.env.BROWSERLESS_API_KEY);
    console.log('Key prefix:', process.env.BROWSERLESS_API_KEY?.substring(0, 10) + '...');

    const scraper = new BrowserlessScraper();

    if (!scraper.isConfigured()) {
        console.error('ERROR: Browserless not configured');
        process.exit(1);
    }

    try {
        console.log('\nStarting scrape of Bene (Architonic)...\n');

        const result = await scraper.scrapeBrand(
            'https://www.architonic.com/en/b/bene/collections/3101988/',
            (progress, message, brandName) => {
                console.log(`[${progress}%] ${message}${brandName ? ' - Brand: ' + brandName : ''}`);
            }
        );

        console.log('\n=== SCRAPE COMPLETE ===');
        console.log('Brand Name:', result.brandInfo.name);
        console.log('Brand Logo:', result.brandInfo.logo || 'Not found');
        console.log('Products Found:', result.products.length);

        if (result.products.length > 0) {
            console.log('\nFirst 3 products:');
            result.products.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.model}`);
                console.log(`     Category: ${p.mainCategory} > ${p.subCategory}`);
                console.log(`     Image: ${p.imageUrl?.substring(0, 50)}...`);
            });
        }

    } catch (error) {
        console.error('\n=== SCRAPE FAILED ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

test();
