# M7: native-capable single-host packaging; target-host build remains a release gate.
FROM node:22.18.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr tesseract-ocr-eng postgresql-client ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY python/requirements.txt python/requirements.txt
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -r python/requirements.txt
COPY . .
ENV SPLITCART_DEV_AUTH=0
RUN npm run build && mkdir -p /app/.data/images && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=3000 SPLITCART_STORAGE_DIR=/app/.data/images SPLITCART_PYTHON=/app/.venv/bin/python
EXPOSE 3000
CMD ["npm","start"]
