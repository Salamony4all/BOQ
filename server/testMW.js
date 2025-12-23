import axios from 'axios';
import * as cheerio from 'cheerio';

async function testMW() {
    const url = 'https://www.mwworkstation.com/products/desk-table.html';
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
        const res = await axios.get(url, {
            headers: { 'User-Agent': userAgent },
            timeout: 10000
        });
        const $ = cheerio.load(res.data);

        console.log('Title:', $('title').text());

        // Let's look for images and titles
        console.log('Links found:');
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && (href.includes('product') || text.length > 5)) {
                if (i < 20) console.log(` - ${text}: ${href}`);
            }
        });

        console.log('\nImages found:');
        $('img').each((i, el) => {
            const src = $(el).attr('src');
            const alt = $(el).attr('alt');
            if (src && !src.includes('logo') && i < 20) {
                console.log(` - ${alt}: ${src}`);
            }
        });

    } catch (e) {
        console.error('Error:', e.message);
    }
}

testMW();
