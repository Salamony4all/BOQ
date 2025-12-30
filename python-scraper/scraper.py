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

def scrape_url(url):
    try:
        logger.info(f"Starting extraction for {url}")
        
        # Use DynamicFetcher
        fetcher = DynamicFetcher()
        # Newer Scrapling versions moved configuration to a method or argument of fetch?
        # Or maybe the deprecated arg 'headless' in init caused the warning/error.
        # Let's simple try without arguments first (default is usually headless anyway).
        page = fetcher.fetch(url, headless=True)
        
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
