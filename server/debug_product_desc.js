
import { chromium } from 'playwright';

(async () => {
    console.log('Debugging Architonic Product Page...');
    const browser = await chromium.launch({ headless: false }); // Visible for debugging
    const page = await browser.newPage();

    // Use the product URL from the screenshot example or a similar one
    const url = 'https://www.architonic.com/en/p/narbutas-parthos-acoustic-columns/20732680';

    try {
        await page.goto(url, { waitUntil: 'networkidle' });
        console.log('Page loaded.');

        // Strategy 1: Find "About this product" and get following siblings
        console.log('\n--- Strategy 1: "About this product" Heading ---');
        const aboutSection = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, strong, b'));
            const aboutHeader = headings.find(el => el.innerText.includes('About this product'));

            if (aboutHeader) {
                let current = aboutHeader.nextElementSibling;
                let text = '';
                // Gather potential description elements following the header
                while (current && text.length < 1000) {
                    if (current.tagName === 'P' || current.tagName === 'UL' || current.tagName === 'DIV') {
                        text += current.innerText + '\n';
                    }
                    current = current.nextElementSibling;
                }
                return { found: true, text: text };
            }
            return { found: false };
        });
        console.log(aboutSection);

        // Strategy 2: Specific Selectors
        console.log('\n--- Strategy 2: Common Selectors ---');
        const selectors = [
            '.product-description',
            '#product-description',
            '.product-long-description',
            '.product-text',
            'div[class*="description"]'
        ];

        for (const sel of selectors) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                const text = await page.locator(sel).first().innerText();
                console.log(`Selector "${sel}": Found! Length: ${text.length}`);
                console.log(`Preview: ${text.substring(0, 100)}...`);
            } else {
                console.log(`Selector "${sel}": Not found.`);
            }
        }

        // Dump some HTML near "About this product" to see structure
        console.log('\n--- HTML Dump near "About this product" ---');
        const htmlContext = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('*'));
            const aboutHeader = headings.find(el => el.innerText && el.innerText.includes('About this product'));
            return aboutHeader ? aboutHeader.parentElement.outerHTML.substring(0, 2000) : 'Not found';
        });
        console.log(htmlContext);

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
})();
