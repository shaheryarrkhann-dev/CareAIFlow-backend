# Use Node.js base image (v20+ required for pdf-to-img compatibility)
FROM node:20

# Install system dependencies required for canvas, PDF processing, and Puppeteer
# Clean up aggressively to save space
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    # Chromium dependencies for Puppeteer
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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/archives/*

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
# Set npm cache to temp location and clean after install to save disk space
ENV NPM_CONFIG_CACHE=/tmp/.npm
# Ensure Puppeteer downloads Chromium during install
ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer
# Install dependencies with space-saving measures
RUN npm install --prefer-offline --no-audit \
    && npm cache clean --force \
    && rm -rf /tmp/.npm \
    && rm -rf /root/.npm

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the application
COPY . .

# Expose the port your app is running on
EXPOSE 4000

# Start the apps
# Schema updates are handled via 'prisma db push' in CI/CD deployment workflow
CMD npm start
