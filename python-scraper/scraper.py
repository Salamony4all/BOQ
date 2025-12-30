import sys
import json
import logging
from urllib.parse import urljoin

# Configure logging to console
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    from scrapling import DynamicFetcher
except ImportError as e:
    logger.error(f"CRITICAL: Failed to import scrapling: {e}")
    # Don't pass, let it crash or define a dummy to avoid NameError if you want to keep running for health checks
    # But for debugging, we want to know.
    import traceback
    logger.error(traceback.format_exc())
    DynamicFetcher = None

    try:
        logger.info(f"Starting extraction for {url}")
        
        # Scrapling's DynamicFetcher (sync) inside FastAPI (async) causes:
        # "Playwright Sync API inside the asyncio loop. Please use the Async API"
        # Since we are in a lightweight service, usually we can just use AsyncFetcher 
        # OR run the sync fetcher in a thread.
        # Let's try switching to AsyncFether? 
        # But for stability with camoufox, some docs suggest sync. 
        # Simplest fix: Run the logic in a thread so it doesn't block the async loop.
        # But we need to refactor scrape_url to be sync blocking, and call it via run_in_executor in main.py?
        
        # Actually, let's keep scrape_url sync, but ensure we don't start Playwright Sync inside the async event loop thread directly?
        # Actually, FastAPI runs endpoints in a threadpool if they are defined as 'def', 
        # and in the main loop if defined as 'async def'.
        # Our main.py has `async def scrape_endpoint`.
        # So we are IN the loop. Calling sync playwright here crashes.
        
        # We should use `AsyncFetcher`!
        from scrapling import AsyncFetcher
        
        # We need to await it, so scrape_url must be async.
        # Refactoring to async.
        pass
    except:
        pass

async def scrape_url(url):
    try:
        logger.info(f"Starting extraction for {url}")
        from scrapling import AsyncFetcher
        
        fetcher = AsyncFetcher() 
        page = await fetcher.fetch(url, headless=True)
        
        # Brand Info
        title = page.css('title::text').get() or "Unknown Brand"
        brand_name = title.split('|')[0].split('-')[0].strip()
        
        # Logo - try to find header logo
        logo = ""
        # Heuristics for logo
        logo_img = page.css('header img')
        if logo_img:
            src = logo_img.attrib.get('src')
            if src:
                logo = urljoin(url, src)
        
        products = []
        seen_urls = set()
        
        # Simple heuristic: Look for <a> tags that contain <img> and minimal text
        links = page.css('a')
        logger.info(f"Found {len(links)} links, analyzing potential products...")
        
        for link in links:
            href = link.attrib.get('href')
            if not href or href.startswith('#') or href.startswith('javascript'):
                continue
                
            full_url = urljoin(url, href)
            
            if full_url in seen_urls:
                continue
            
            # Check for image inside
            imgs = link.css('img')
            
            # Check for text (name)
            text = link.text
            if not text:
                continue
            text = text.strip()
            if len(text) < 3 or len(text) > 200:
                continue
                
            if imgs:
                img_src = imgs[0].attrib.get('src') or imgs[0].attrib.get('data-src')
                if img_src:
                    full_img_src = urljoin(url, img_src)
                    
                    products.append({
                        "name": text,
                        "link": full_url,
                        "image": full_img_src
                    })
                    seen_urls.add(full_url)
        
        logger.info(f"Extracted {len(products)} potential products.")
        
        result = {
            "products": products,
            "brandInfo": {
                "name": brand_name,
                "logo": logo
            }
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        # Re-raise to be handled by API caller
        raise e
