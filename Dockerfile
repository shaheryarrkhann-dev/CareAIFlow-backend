# Node 20+ required for pdf-to-img and other tooling
FROM node:20-bookworm

# System deps: native modules (canvas), Puppeteer/Chromium, Prisma/OpenSSL on Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libgbm-dev \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libnss3 \
    libxss1 \
    libdrm-dev \
    libatspi2.0-0 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    openssl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

# postinstall runs "prisma generate" but schema is not copied yet — skip lifecycle scripts here
RUN npm install --prefer-offline --no-audit --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /tmp/.npm /root/.npm

# Prisma schema must exist before generate
COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npx prisma generate

EXPOSE 4000

CMD ["npm", "start"]
