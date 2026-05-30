# Outbreak Detection System — Prototype

End-to-end prototype: Telegram bot (7-step questionnaire) + PostgreSQL + surveillance dashboard.

---

## Stack

- **Bot**: node-telegram-bot-api
- **API + dashboard server**: Express
- **Database**: PostgreSQL with PostGIS extension
- **Dashboard**: Single-page HTML (Chart.js)

---

## Setup

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+ with PostGIS extension
- A Telegram bot token from [@BotFather](https://t.me/botfather)

### 2. Create the database

```bash
createdb mydatabase
psql mydatabase -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env and fill in:
#   TELEGRAM_BOT_TOKEN=...
#   DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
```

### 5. Run migrations

```bash
npm run db:migrate
```

### 6. Start the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

---

## What you get

| Feature | Where |
|---|---|
| 7-step Telegram questionnaire | Chat with your bot |
| GPS capture (optional) | Step 2 of the questionnaire |
| Report storage (PostGIS) | PostgreSQL |
| Surveillance dashboard | http://localhost:3000 |
| Live alert banner (3+ reports / 48h) | Dashboard header |
| Symptom breakdown chart | Dashboard |
| Daily trend chart | Dashboard |
| Status management (new → reviewed → escalated → closed) | Dashboard table |

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/reports` | List reports. Params: `days`, `district`, `symptom`, `status` |
| GET | `/api/stats` | Aggregated stats for charts. Param: `days` |
| GET | `/api/alerts` | Districts with ≥3 reports in 48h |
| PATCH | `/api/reports/:id/status` | Update report status |
| GET | `/api/cluster` | PostGIS radius query. Params: `lat`, `lng`, `radius_km`, `days` |

---

## Bot commands

| Command | Action |
|---|---|
| `/start` | Welcome message |
| `/report` | Start a new report (7 questions) |
| `/status` | Top signals from the last 7 days |

---

## Next steps (post-prototype)

- Add Redis for session persistence (currently in-memory)
- Add CUSUM / EARS detection on `daily_district_signals` view
- Add Leaflet map tab to dashboard (lat/lng already stored)
- Add multi-language support (Arabic first)
- Add webhook mode for Telegram (replace polling)
- Add role-based auth to dashboard
- Add Telegram alert channel for surveillance team notifications
