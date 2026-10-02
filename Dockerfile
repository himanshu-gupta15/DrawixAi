FROM node:22-slim

# Install system dependencies (OpenSSL needed for Prisma)
RUN apt-get update && apt-get install -y openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy project source
COPY . .

# Generate Prisma client and build Next.js
RUN npx prisma generate
RUN npm run build

ENV PORT=3100
ENV NODE_ENV=production

EXPOSE 3100

# Run custom server (Next.js + WebSockets in a single process)
CMD ["npm", "start"]
