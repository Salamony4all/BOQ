import sys
import json
import logging
from urllib.parse import urljoin, urlparse

# Configure logging to console
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    from scrapling import DynamicFetcher
except ImportError as e:
    logger.error(f"CRITICAL: Failed to import scrapling: {e}")
    import traceback
    logger.error(traceback.format_exc())
    DynamicFetcher = None

# === CONFIGURATION ===
PRODUCT_KEYWORDS = ['product', 'products', 'item', 'shop', 'collection', 'category', 'furniture', 'chair', 'desk', 'table', 'seating']
EXCLUDE_KEYWORDS = ['contact', 'about', 'login', 'cart', 'privacy', 'social', 'news', 'blog', 'terms', 'careers', 'account', 'faq', 'instagram', 'facebook', 'twitter', 'youtube', 'linkedin']
IMAGE_EXCLUDE = ['logo', 'icon', 'arrow', 'chevron', 'placeholder', 'blank', 'loading', 'spinner', 'social', 'banner']


def is_valid_product_image(url):
    """Check if image URL is likely a product image, not UI element."""
    if not url or len(url) < 10:
        return False
    lower = url.lower()
    return not any(term in lower for term in IMAGE_EXCLUDE)


def extract_products_from_page(page, base_url, brand_name, category='General'):
    """
    Extract products from a page using multiple strategies.
    Mirrors the approach from structureScraper.js.
    """
    products = []
    seen = set()
    
    # === STRATEGY 1: WooCommerce product containers ===
    woo_selectors = [
        'li.product',
        '.products .product',
        '.product-item',
        '.product-card',
        '[class*="product-item"]',
        '[class*="product-card"]'
    ]
    
    for selector in woo_selectors:
        try:
            containers = page.css(selector)
            if containers and len(containers) > 0:
                logger.info(f"Found {len(containers)} containers with selector: {selector}")
                
                for container in containers:
                    try:
                        # Extract title
                        title = None
                        for title_sel in ['h2::text', 'h3::text', '.woocommerce-loop-product__title::text', '.product-title::text', '.title::text', 'a::attr(title)']:
                            title = container.css(title_sel).get()
                            if title and len(title.strip()) > 2:
                                title = title.strip()
                                break
                        
                        if not title:
                            # Try getting text from main link
                            link_text = container.css('a::text').get()
                            if link_text and len(link_text.strip()) > 2:
                                title = link_text.strip()
                        
                        if not title or title.lower() in seen:
                            continue
                        
                        # Extract image
                        img_src = (
                            container.css('img::attr(src)').get() or
                            container.css('img::attr(data-src)').get() or
                            container.css('img::attr(data-lazy-src)').get()
                        )
                        
                        # Check srcset for better quality
                        srcset = container.css('img::attr(srcset)').get()
                        if srcset:
                            # Take the first URL from srcset
                            img_src = srcset.split(',')[0].strip().split(' ')[0] or img_src
                        
                        if not img_src or not is_valid_product_image(img_src):
                            continue
                        
                        # Extract product URL
                        product_url = container.css('a::attr(href)').get()
                        if not product_url:
                            continue
                        
                        full_img = urljoin(base_url, img_src)
                        full_url = urljoin(base_url, product_url)
                        
                        if full_url in seen:
                            continue
                        
                        seen.add(title.lower())
                        seen.add(full_url)
                        
                        products.append({
                            "name": title,
                            "link": full_url,
                            "image": full_img,
                            "category": category,
                            "source": "woocommerce"
                        })
                        
                    except Exception as e:
                        continue
                        
        except Exception as e:
            continue
    
    # === STRATEGY 2: Generic container detection (like structureScraper.js) ===
    if len(products) < 5:
        try:
            # Look for div/li/article that contains both img and link
            containers = page.css('div, li, article, section')
            
            for container in containers:
                try:
                    # Must have image
                    img = container.css('img')
                    if not img:
                        continue
                    
                    # Must have link
                    link = container.css('a[href]')
                    if not link:
                        continue
                    
                    # Check for heading or substantial text
                    heading = container.css('h1, h2, h3, h4, h5, .title, .name')
                    link_text = link.css('::text').get() or ""
                    
                    # Get the name
                    title = None
                    if heading:
                        title = heading.css('::text').get()
                    if not title and len(link_text.strip()) > 5:
                        title = link_text.strip()
                    
                    if not title or len(title) < 3 or title.lower() in seen:
                        continue
                    
                    # Get image
                    img_src = (
                        img.css('::attr(src)').get() or
                        img.css('::attr(data-src)').get()
                    )
                    
                    if not img_src or not is_valid_product_image(img_src):
                        continue
                    
                    # Get URL
                    href = link.css('::attr(href)').get()
                    if not href:
                        continue
                    
                    full_url = urljoin(base_url, href)
                    full_img = urljoin(base_url, img_src)
                    
                    if full_url in seen:
                        continue
                    
                    # Skip if already added
                    if any(p['link'] == full_url for p in products):
                        continue
                    
                    seen.add(title.lower())
                    seen.add(full_url)
                    
                    products.append({
                        "name": title,
                        "link": full_url,
                        "image": full_img,
                        "category": category,
                        "source": "generic"
                    })
                    
                except:
                    continue
                    
        except Exception as e:
            logger.warning(f"Generic extraction error: {e}")
    
    # === STRATEGY 3: JSON-LD Structured Data ===
    try:
        scripts = page.css('script[type="application/ld+json"]::text').getall()
        if not isinstance(scripts, list):
            single = page.css('script[type="application/ld+json"]::text').get()
            scripts = [single] if single else []
        
        for script in scripts:
            try:
                data = json.loads(script)
                items = data.get('@graph', [data]) if isinstance(data, dict) else (data if isinstance(data, list) else [])
                
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    
                    item_type = item.get('@type', '')
                    if isinstance(item_type, list):
                        item_type = item_type[0]
                    
                    if item_type == 'Product':
                        p_name = item.get('name')
                        p_img = item.get('image')
                        if isinstance(p_img, list):
                            p_img = p_img[0]
                        elif isinstance(p_img, dict):
                            p_img = p_img.get('url')
                        
                        p_url = item.get('url') or base_url
                        
                        if p_name and p_img:
                            full_url = urljoin(base_url, p_url)
                            full_img = urljoin(base_url, p_img)
                            
                            if full_url not in seen and p_name.lower() not in seen:
                                products.append({
                                    "name": p_name,
                                    "link": full_url,
                                    "image": full_img,
                                    "category": category,
                                    "source": "json-ld"
                                })
                                seen.add(full_url)
                                seen.add(p_name.lower())
                    
                    elif item_type == 'ItemList':
                        for li in item.get('itemListElement', []):
                            if isinstance(li, dict):
                                product = li.get('item')
                                if product and isinstance(product, dict):
                                    p_name = product.get('name')
                                    p_url = product.get('url') or product.get('@id')
                                    p_img = product.get('image')
                                    
                                    if p_name and p_url:
                                        full_url = urljoin(base_url, p_url)
                                        full_img = urljoin(base_url, p_img) if p_img else ""
                                        
                                        if full_url not in seen:
                                            products.append({
                                                "name": p_name,
                                                "link": full_url,
                                                "image": full_img,
                                                "category": category,
                                                "source": "json-ld-list"
                                            })
                                            seen.add(full_url)
            except:
                continue
    except Exception as e:
        logger.warning(f"JSON-LD extraction error: {e}")
    
    return products, seen


def discover_category_pages(page, base_url):
    """
    Find category/collection pages to crawl.
    Mirrors discoverHierarchyLinks from structureScraper.js.
    """
    categories = []
    seen = set()
    
    try:
        # Look in navigation and sidebar
        nav_links = page.css('nav a, header a, .menu a, .navigation a, .sidebar a, a')
        
        for link in nav_links:
            try:
                href = link.css('::attr(href)').get()
                if not href or href == '#' or href.startswith('javascript'):
                    continue
                
                text = link.css('::text').get() or ""
                text = text.strip()
                
                full_url = urljoin(base_url, href)
                
                # Must be same domain
                if not full_url.startswith(base_url):
                    continue
                
                if full_url in seen or full_url == base_url:
                    continue
                
                href_lower = href.lower()
                text_lower = text.lower()
                
                # Skip excluded URLs
                if any(ex in href_lower for ex in EXCLUDE_KEYWORDS):
                    continue
                
                # Check for product-related keywords
                is_product_link = any(kw in href_lower or kw in text_lower for kw in PRODUCT_KEYWORDS)
                
                if is_product_link and len(text) > 2 and len(text) < 50:
                    seen.add(full_url)
                    categories.append({
                        "url": full_url,
                        "title": text if text else "Products"
                    })
                    
            except:
                continue
                
    except Exception as e:
        logger.warning(f"Category discovery error: {e}")
    
    return categories


def find_pagination(page, base_url):
    """Find pagination links on current page."""
    pagination_urls = []
    seen = set()
    
    try:
        selectors = ['.pagination a', '.pager a', 'a[class*="page"]', 'a[href*="page="]', 'a.next', 'a[rel="next"]']
        
        for sel in selectors:
            try:
                links = page.css(sel)
                for link in links:
                    href = link.css('::attr(href)').get()
                    if href and not href.startswith('#') and not href.startswith('javascript'):
                        full_url = urljoin(base_url, href)
                        if full_url.startswith(base_url) and full_url not in seen:
                            seen.add(full_url)
                            pagination_urls.append(full_url)
            except:
                continue
                
    except Exception as e:
        logger.warning(f"Pagination error: {e}")
    
    return pagination_urls[:10]  # Limit to 10 pages


def scrape_url(url):
    """Main scraping function."""
    try:
        logger.info(f"Starting extraction for {url}")
        
        fetcher = DynamicFetcher(headless=True)
        page = fetcher.fetch(url)
        
        base_url = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        
        # Brand Info
        title = page.css('title::text').get() or "Unknown Brand"
        brand_name = title.split('|')[0].split('-')[0].strip()
        
        # Logo
        logo = ""
        logo_selectors = [
            'header img[src*="logo"]::attr(src)',
            '.logo img::attr(src)',
            '[class*="logo"] img::attr(src)',
            'header img::attr(src)'
        ]
        for sel in logo_selectors:
            src = page.css(sel).get()
            if src:
                logo = urljoin(url, src)
                break
        
        all_products = []
        all_seen = set()
        
        # === PHASE 1: Extract from current page ===
        logger.info("Phase 1: Extracting from main page...")
        products, seen = extract_products_from_page(page, base_url, brand_name, 'Homepage')
        all_products.extend(products)
        all_seen.update(seen)
        logger.info(f"Found {len(products)} products on main page")
        
        # === PHASE 2: Discover and crawl category pages ===
        categories = discover_category_pages(page, base_url)
        logger.info(f"Phase 2: Discovered {len(categories)} category pages")
        
        # Also try common product page URLs if no categories found
        if len(categories) == 0:
            common_paths = ['/products/', '/product/', '/shop/', '/collection/', '/collections/', '/catalogue/']
            for path in common_paths:
                try:
                    test_url = urljoin(base_url, path)
                    categories.append({"url": test_url, "title": path.strip('/')})
                except:
                    continue
        
        # Crawl discovered categories (limit to 10)
        for cat in categories[:10]:
            cat_url = cat['url']
            cat_title = cat['title']
            
            if cat_url in all_seen:
                continue
            all_seen.add(cat_url)
            
            try:
                logger.info(f"Crawling category: {cat_title} ({cat_url})")
                cat_page = fetcher.fetch(cat_url)
                
                products, seen = extract_products_from_page(cat_page, base_url, brand_name, cat_title)
                all_products.extend(products)
                all_seen.update(seen)
                logger.info(f"Found {len(products)} products in {cat_title}")
                
                # Check for pagination in category
                pagination = find_pagination(cat_page, base_url)
                for pg_url in pagination[:3]:  # Limit pagination depth
                    if pg_url not in all_seen:
                        all_seen.add(pg_url)
                        try:
                            logger.info(f"Following pagination: {pg_url}")
                            pg_page = fetcher.fetch(pg_url)
                            products, seen = extract_products_from_page(pg_page, base_url, brand_name, cat_title)
                            all_products.extend(products)
                            all_seen.update(seen)
                            logger.info(f"Found {len(products)} products on page")
                        except Exception as e:
                            logger.warning(f"Pagination error: {e}")
                            continue
                            
            except Exception as e:
                logger.warning(f"Error crawling category {cat_url}: {e}")
                continue
        
        # === DEDUPLICATE ===
        unique_products = []
        seen_keys = set()
        for p in all_products:
            key = f"{p['name']}|{p['link']}".lower()
            if key not in seen_keys and is_valid_product_image(p.get('image', '')):
                seen_keys.add(key)
                unique_products.append(p)
        
        logger.info(f"Total unique products: {len(unique_products)}")
        
        result = {
            "products": unique_products,
            "brandInfo": {
                "name": brand_name,
                "logo": logo
            }
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Extraction error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise e
