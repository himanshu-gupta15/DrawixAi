# Dravix AI — Render Deployment Guide (Recommended)

Render is the ideal platform for **Dravix AI** because it runs your custom Node/Docker server (`server.ts`), which enables **persistent WebSockets (`/ws/insights`)**, **local ONNX inference**, and provides a **free managed PostgreSQL database** with zero function limits.

---

## Why Render is Superior for this Project

| Capability | Render (Docker / Node) | Vercel (Serverless) |
|---|---|---|
| **WebSockets (`/ws/insights`)** | ✅ Fully supported (persistent connection) | ❌ Disconnected by serverless lambdas |
| **Serverless Function Limit** | ✅ Unlimited (runs as a single container) | ❌ Max 12 functions on Hobby plan |
| **Local ONNX Inference** | ✅ Full disk & memory allocation | ❌ Severely constrained / bundle limits |
| **Built-in PostgreSQL** | ✅ Free managed PostgreSQL included | ❌ Requires third-party cloud DB setup |

---

## 3-Minute Deployment via Render Blueprint (Easiest)

We have created [`render.yaml`](./render.yaml), which automatically sets up both your web app and free PostgreSQL database in a single click.

### Step 1: Commit and Push your Changes to GitHub

Run this in your terminal:
```bash
git add .
git commit -m "feat: configure render deployment with dockerfile and render.yaml"
git push origin main
```

---

### Step 2: Deploy on Render

1. Log in to [dashboard.render.com](https://dashboard.render.com/) with your GitHub account.
2. Click **New +** in the top right and select **Blueprint**.
3. Connect your GitHub repository: `himanshu-gupta15/DrawixAi`.
4. Render will read [`render.yaml`](./render.yaml) and automatically detect:
   - **Service 1**: `dravix-postgres` (Free Managed PostgreSQL Database)
   - **Service 2**: `dravix-ai` (Web Service running your Docker container)
5. Fill in the optional environment variables when prompted:
   - `VECTOR_DATABASE_URL`: `https://your-cluster.cloud.qdrant.io:6333` *(from free [cloud.qdrant.io](https://cloud.qdrant.io))*
   - `VECTOR_DATABASE_API_KEY`: *(your Qdrant Cloud API key)*
   - `GROQ_API_KEY`: `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` *(from your .env)*
6. Click **Apply**.
7. Render will provision the database, build the Docker container, and give you your live URL (e.g. `https://dravix-ai.onrender.com`).

---

### Step 3: Run Database Ingestion (One-Time Setup)

Once the service is deployed, populate the knowledge base records:

1. In the Render Dashboard, click your `dravix-ai` Web Service.
2. Click the **Shell** tab on the left to open a terminal inside your live container.
3. Run:
   ```bash
   npx prisma db push
   npm run ingest
   ```
4. All 14 sources will be cleaned, versioned, embedded, and ready for queries.

---

### Verification Checklist

Once deployed, visit your Render URL:
- [x] **Home Dashboard** (`/`): Displays all 4 systems and metric badges.
- [x] **Knowledge Base** (`/knowledge-base`): Search policies with grounded citations and zero hallucinations.
- [x] **Voice Agent** (`/voice-agent`): Lead qualification dialogue with Asha.
- [x] **Multilingual** (`/multilingual`): Tagalog/Taglish and Indonesian regional bots.
- [x] **Live Insights** (`/live-insights`): Real-time audio streaming over native WebSockets with sub-second compliance nudges.
