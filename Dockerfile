# Use an official Node.js image
FROM node:23

# Install system dependencies required for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    pkg-config \
    libsqlite3-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpangocairo-1.0-0 \
    libatk1.0-0 \
    libcups2 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libgbm-dev \
    libasound2 \
    libx11-xcb1 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libegl1 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    xdg-utils \
    wget \
    curl

# Set working directory inside container
WORKDIR /app

# Copy package files for caching and install dependencies with build-from-source flag
COPY package*.json ./
RUN npm install --legacy-peer-deps --build-from-source

# Force rebuild of better-sqlite3 from source
RUN npm rebuild better-sqlite3 --build-from-source

# Copy the rest of the application's code
COPY . .

# Build TypeScript code (adjust command if necessary)
RUN npm run build

# Run the application
CMD ["node", "dist/index.js"]
