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
            # Fallback
            if href is None and hasattr(link, 'attrib'):
                href = link.attrib.get('href')
            
            if not href or href.startswith('#') or href.startswith('javascript'):
                continue
                
            full_url = urljoin(url, href)
            
            if full_url in seen_urls:
                continue
            
            # Check for image inside
            # link is a Selector/Element. `img` selector inside `a`
            imgs = link.css('img')
            
            # Check for text (name)
            # Use recursive text extraction (xpath .//text()) to capture text in h2, span, etc.
            text = None
            try:
                # Try XPath for recursive text
                if hasattr(link, 'xpath'):
                    all_text_nodes = link.xpath('.//text()').getall()
                    text = " ".join([t.strip() for t in all_text_nodes if t.strip()])
                else:
                    # Fallback to CSS descendants
                    # Note: ' *::text' selects all text nodes of all descendants
                    text_nodes = link.css('*::text') 
                    if hasattr(text_nodes, 'getall'):
                        text = " ".join([t.strip() for t in text_nodes.getall() if t.strip()])
            except:
                pass
            
            # Fallback to direct text if recursive failed or wasn't supported
            if not text:
                 try:
                    text = link.css('::text').get()
                 except: 
                    pass
            
            # If no text found in <a>, maybe it's usually adjacent? 
            # But let's stick to containment for now.
            if not text:
                # Sometimes the image has alt text
                if imgs:
                    text = imgs.css('::attr(alt)').get()
            
            if not text:
                continue
                
            text = text.strip()
            
            # Heuristic: Is this a product URL?
            is_product_url = '/product/' in full_url or '/item/' in full_url or '/shop/' in full_url
            
            # Relaxed length check if it looks like a product URL
            if is_product_url:
                 if len(text) < 2: # Very short
                     continue
            else:
                 if len(text) < 3 or len(text) > 300:
                     continue
            
            # Filter out common UI elements
            low_text = text.lower()
            if any(x == low_text for x in ['menu', 'home', 'login', 'cart']): # Exact match for short words
                continue
            if not is_product_url and any(x in low_text for x in ['instagram', 'facebook', 'twitter', 'policy', 'terms']):
                continue

            if imgs:
                # Better image src extraction
                img_src = (
                    imgs.css('::attr(src)').get() or 
                    imgs.css('::attr(data-src)').get() or 
                    imgs.css('::attr(srcset)').get() # simplistic
                )
                
                # If srcset, take first URL
                if img_src and ',' in img_src:
                    img_src = img_src.split(',')[0].strip().split(' ')[0]
                
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
