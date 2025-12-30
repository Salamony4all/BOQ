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

def scrape_url(url):
    try:
        logger.info(f"Starting extraction for {url}")
        
        # v0.3+ API change: headless is often passed to init or configure.
        # The error "Unknown parser argument: headless" on fetch() suggests fetch() interprets args as parser args (lxml),
        # not browser args, if the fetcher is already configured?
        # OR implementation details: fetch(url, **kwargs) -> if kwargs are not known, it passes them to parser?
        
        # Let's try explicit init with headless.
        # If deprecated warning happens, it's better than crash.
        # But we saw "Unknown parser argument" on fetch(..., headless=True). 
        # So headless=True is NOT a valid argument for fetch().
        
        # Let's try:
        # fetcher = DynamicFetcher(headless=True)
        # page = fetcher.fetch(url)
        
        # If init is deprecated, we might need:
        fetcher = DynamicFetcher(headless=True)
        
        page = fetcher.fetch(url)
        
        # Brand Info
        title = page.css('title::text').get() or "Unknown Brand"
        brand_name = title.split('|')[0].split('-')[0].strip()
        
        # Logo - try to find header logo
        logo = ""
        # Heuristics for logo
        logo_img = page.css('header img')
        if logo_img:
            # Scrapling/Parcel Selectors might return a list of elements/Selector objects.
            # If logo_img is truthy, we might need to get the first one.
            # And checking the error: 'Selectors' object has no attribute 'attrib'
            # This suggests logo_img is a list-like 'Selectors' object, not a single Element.
            # We should probably do: logo_img[0].attrib['src'] or similar.
            # But the safer Scrapling way:
            src = logo_img.attrib['src'] if hasattr(logo_img, 'attrib') else None
            # Actually, let's look at Scrapling docs pattern:
            # page.css('header img') -> Selectors
            # page.css('header img').attrib['src'] ?? No.
            
            # Standard pattern:
            # page.css('header img::attr(src)').get()
            
            src = page.css('header img::attr(src)').get()
            if src:
                logo = urljoin(url, src)
        
        products = []
        seen_urls = set()
        
        # Simple heuristic: Look for <a> tags that contain <img> and minimal text
        links = page.css('a')
        logger.info(f"Found {len(links)} links, analyzing potential products...")
        
        for link in links:
            # Scrapling/Patchright Selectors:
            # .attrib is usually on an Element, but 'link' here might be a Selector wrapper.
            # If so, it might not have .attrib.
            # Safe way in Scrapling/Parcel: link.css('::attr(href)').get()
            
            href = link.css('::attr(href)').get()
            # Fallback if link is actually an lxml element (shouldn't be if we iterate page.css)
            if href is None and hasattr(link, 'attrib'):
                href = link.attrib.get('href')
            
            if not href or href.startswith('#') or href.startswith('javascript'):
                continue
                
            full_url = urljoin(url, href)
            
            if full_url in seen_urls:
                continue
            
            # Check for image inside
            # link is a Selector/Element
            imgs = link.css('img')
            
            # Check for text (name)
            text = link.css('::text').get()
            if not text:
                # deeper check?
                text = "".join(link.css('::text').getall())
            
            if not text:
                continue
            text = text.strip()
            if len(text) < 3 or len(text) > 200:
                continue
                
            if imgs:
                # src = imgs[0].attrib.get('src') -> Error again if we blindly use .attrib
                # Better:
                img_src = imgs.css('::attr(src)').get() or imgs.css('::attr(data-src)').get()
                
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
