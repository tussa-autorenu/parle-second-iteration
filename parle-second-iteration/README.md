# Parle Tesla Control Service (Supabase / No-Docker) — Second Iteration

This repo is **Tussa's Tesla abstraction layer**.
- Supabase OAuth login happens in **Char3's Marketplace API**
- This service is protected with **service-to-service auth**: `x-parle-api-key`
- This repo uses **Supabase Postgres** (hosted) so you **do not need Docker**.

What this service does:
- Normalized **telemetry**: list vehicles, get vehicle state (cached in-memory).
- Reliable **commands**: wake-first, unlock, enable-drive, lock, etc.
- **Idempotency**: safe for double-taps/retries via `requestId`.
- **Audit logs**: every command is recorded for debugging/ops.
- **Scale-ready**: stateless API design; add Redis later in production if desired.

---

## 1) One-time dependencies to install (on your computer)

### Required
- **Node.js 20+** (includes npm)

### Optional but helpful
- Git
- Postman (or just use curl)

---

## 2) Create a Supabase project (required)

1. Create a project in Supabase.
2. Go to **Project Settings → Database → Connection string**
3. Copy the **Postgres connection string**.
   - If you later see DB connection limit errors, use the **Session pooler** connection string.

---

## 3) Project dependencies (install inside the repo)

From the repo folder:

```bash
npm install
```

---

## 4) Run locally (no Docker)

### Step A — create env file
```powershell
Copy-Item .env.example .env
```

### Step B — edit `.env`
Set:
- `DATABASE_URL` to your Supabase Postgres connection string
- `PARLE_API_KEY` to a strong shared secret (you will share this with Char3 backend)

### Step C — run migrations + seed
```bash
npx prisma migrate deploy
npm run db:seed
```

### Step D — start Tesla mock (for local testing)
Open a **second** PowerShell window in the repo folder and run:
```powershell
$env:PORT=9090
node .\src\tesla-mock\server.js
```

### Step E — start the API
Back in the first PowerShell window:
```bash
npm run dev
```

Swagger UI: http://localhost:8080/docs  
Health check: http://localhost:8080/healthz

---

## 5) How to test

### A) Run tests
```bash
npm test
```

### B) Manual API tests (copy/paste)

All calls must include:
- `x-parle-api-key: <matches your .env PARLE_API_KEY>`

#### 1) List vehicles
```bash
curl -H "x-parle-api-key: dev_key_change_me" http://localhost:8080/vehicles
```

#### 2) Get a vehicle + state
```bash
curl -H "x-parle-api-key: dev_key_change_me" http://localhost:8080/vehicles/derby-01
```

#### 3) Unlock (wake-first)
```bash
curl -X POST -H "x-parle-api-key: dev_key_change_me" http://localhost:8080/vehicles/derby-01/unlock
```

#### 4) Enable drive (wake-first)
```bash
curl -X POST -H "x-parle-api-key: dev_key_change_me" http://localhost:8080/vehicles/derby-01/enable-drive
```

#### 5) Ready shortcut (wake -> unlock -> enable-drive)
```bash
curl -X POST -H "x-parle-api-key: dev_key_change_me" http://localhost:8080/vehicles/derby-01/ready
```

#### 6) View command logs
```bash
curl -H "x-parle-api-key: dev_key_change_me" "http://localhost:8080/logs/commands?limit=20"
```

---

## 6) How Char3 should call this service

Required headers:
- `x-parle-api-key: <shared_secret>`
- `x-triggered-by: <supabase_user_id | system | admin>` (for audit logs)
- `x-request-id: <uuid>` (recommended; idempotency + tracing)

---

## Notes
- This version uses **in-memory caching** for telemetry. That’s fine for local dev.
- For production scale, add Redis later so multiple instances share cache.



## Optional: Redis (for production scale)

If you set `REDIS_URL`, this service will use Redis for shared telemetry cache across multiple instances.



## Quick load test (sanity check)

Install (dev dependency already included):
```powershell
npm i
```

Run:
```powershell
npx autocannon -c 50 -d 20 -H "x-parle-api-key=dev_key_change_me" http://localhost:8080/healthz
```
