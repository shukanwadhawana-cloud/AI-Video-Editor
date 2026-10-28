FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8080
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium ffmpeg ca-certificates fonts-liberation fonts-noto-color-emoji \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcairo2 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY src ./src

RUN mkdir -p /data/projects

EXPOSE 8080
CMD ["npm", "start"]
