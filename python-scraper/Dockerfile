FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir playwright

# Install playwright browsers
RUN playwright install chromium
RUN playwright install-deps chromium

COPY . .

# Expose port (railway sets PORT env var)
# CMD uses the $PORT env var if uvicorn supports it in shell form, 
# but usually list form ["uvicorn", ...] doesn't resolve vars.
# We will use sh -c 
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
