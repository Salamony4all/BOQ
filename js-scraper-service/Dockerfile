# JS Scraper Service - Railway Dockerfile
# Uses Playwright with Chromium for web scraping

FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Railway uses PORT env var
ENV PORT=3002

# Start the service
CMD ["npm", "start"]
