from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging
import os
from scraper import scrape_url

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

class ScrapeRequest(BaseModel):
    url: str

import asyncio
@app.post("/scrape")
async def scrape_endpoint(req: ScrapeRequest):
    logger.info(f"Received scrape request for: {req.url}")
    try:
        loop = asyncio.get_event_loop()
        # Run synchronous Scrapling in a separate thread to avoid "Sync Loop inside Async Loop" error
        data = await loop.run_in_executor(None, scrape_url, req.url)
        return data
    except Exception as e:
        logger.error(f"Scrape failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
