# Dravix AI — Vercel Deployment Guide

This guide walks you through deploying **Dravix AI** to Vercel with external cloud database providers (PostgreSQL + Qdrant Cloud).

---

## Architecture Considerations on Vercel

| Feature | Support on Vercel | Details |
|---|---|---|
| **Next.js Frontend & Pages** | ✅ Full Support | Fast global edge delivery for UI. |
| **Q2 Knowledge Base & Search** | ✅ Full Support | Powered by cloud PostgreSQL + Qdrant Cloud. |
| **Q1 Voice Agent (Asha)** | ✅ Full Support | Uses Browser Web Speech API + `/api/voice/calls/*` REST routes. |
| **Q3 Multilingual Bots** | ✅ Full Support | Uses Browser ASR/TTS + `/api/multilingual/*` REST routes. |
| **Q4 Real-time Live Insights** | ⚠️ WebSocket Limitation | Vercel Serverless terminates persistent WebSockets (`/ws/insights`). For live audio streaming, run the custom server (`server.ts`) or host the WebSocket on Render/Railway. |

---

## Step 1: Set Up Free Cloud Databases

Because Vercel runs in the cloud, it cannot connect to your local Docker containers (`localhost:5433` and `localhost:6333`). You need free cloud instances:

### 1. Cloud PostgreSQL (Neon Serverless — Recommended)
1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Create a new project (e.g. `dravix-ai`).
3. Copy the **Direct Connection String** (or Pooled connection string):
   ```
   postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

*(Alternative: You can also use [Supabase](https://supabase.com) free PostgreSQL).*

### 2. Cloud Qdrant (Qdrant Cloud Free Tier)
1. Go to [cloud.qdrant.io](https://cloud.qdrant.io) and create a free account.
2. Create a free 1GB cluster (e.g. `dravix-cluster`).
3. Under Cluster Details, copy your **Cluster Endpoint**:
   ```
   https://xyz-example.cloud.qdrant.io:6333
   ```
4. Click **Data Access Control / API Keys** and generate an API key.

---

## Step 2: Push Schema & Ingest Data into Cloud Databases

Before deploying to Vercel, populate your cloud databases from your local machine:

1. In your local terminal, temporarily point your environment to the cloud databases:
   ```bash
   export DATABASE_URL="postgresql://user:password@ep-xyz.aws.neon.tech/neondb?sslmode=require"
   export VECTOR_DATABASE_URL="https://xyz-example.cloud.qdrant.io:6333"
   export VECTOR_DATABASE_API_KEY="your-qdrant-api-key-here"
   ```

2. Push the Prisma schema to create the tables in your cloud PostgreSQL:
   ```bash
   npx prisma db push
   ```

3. Run the ingestion script to process documents and populate Qdrant Cloud:
   ```bash
   npm run ingest
   ```
   *You will see the 14 documents processed, cleaned, embedded, and uploaded to your cloud Qdrant cluster.*

---

## Step 3: Push Code to GitHub

1. If your git repository isn't already committed and pushed to GitHub:
   ```bash
   git add .
   git commit -m "feat: configure Vercel deployment with cloud databases"
   git push origin main
   ```

---

## Step 4: Import and Deploy on Vercel

1. Log in to [vercel.com](https://vercel.com) and click **"Add New Project"**.
2. Select your `DravixAi` repository from GitHub.
3. Configure the **Build and Output Settings** (Defaults are pre-configured):
   - **Framework Preset**: Next.js
   - **Build Command**: `prisma generate && next build` *(already set in package.json)*
   - **Install Command**: `npm install`
4. Expand **Environment Variables** and add the following:

| Environment Variable | Value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:password@ep-xyz.aws.neon.tech/neondb?sslmode=require` | Cloud Postgres connection |
| `VECTOR_DATABASE_URL` | `https://xyz-example.cloud.qdrant.io:6333` | Cloud Qdrant endpoint |
| `VECTOR_DATABASE_API_KEY` | `your-qdrant-api-key` | Cloud Qdrant authentication |
| `LLM_API_KEY` *(Optional)* | Anthropic or Groq API key | Enables LLM phrasing layer |

5. Click **Deploy**.
6. Vercel will install dependencies, generate the Prisma client, build the Next.js static and dynamic routes, and provide your live production URL (e.g. `https://dravix-ai.vercel.app`).

---

## Step 5: Handling Q4 (Live Insights) on Production

- Pages **`/`**, **`/knowledge-base`**, **`/voice-agent`**, and **`/multilingual`** function completely on Vercel.
- For **`/live-insights`** (Q4):
  - In a live video demo or assessment presentation, you can demonstrate Q4 using your local server (`npm run dev`), which runs `server.ts` with real-time WebSockets on `http://localhost:3100`.
  - If you need Q4 live on the internet, deploy the single Docker image (`server.ts`) to **Render** or **Railway**, which support WebSockets with zero configuration.
