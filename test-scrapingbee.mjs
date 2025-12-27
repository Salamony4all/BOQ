import 'dotenv/config';
import ScrapingBeeScraper from './server/scrapingBeeScraper.js';

async function test() {
    console.log('=== Testing ScrapingBee Scraper ===\n');
    console.log('API Key configured:', !!process.env.SCRAPINGBEE_API_KEY);

    if (!process.env.SCRAPINGBEE_API_KEY) {
        console.log('\n❌ SCRAPINGBEE_API_KEY not set in .env');
        console.log('Get a free key at: https://www.scrapingbee.com');
        console.log('Add to .env: SCRAPINGBEE_API_KEY=your_key_here');
        process.exit(1);
    }

    const scraper = new ScrapingBeeScraper();

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
    }
}

test();
