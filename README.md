# Passover Seating Manager

A web app for managing seating at a large-scale Passover hotel program (1,000+ guests, multiple ballrooms).

- **Guest side:** mobile-friendly intake form (no login)
- **Staff side:** JWT-authenticated admin dashboard with multi-admin support, guest list with filters/search/sort, unassigned queue, preferences graph (mutual / one-way / unresolved with fuzzy matching), live stats, per-guest notes, full activity log

## Stack
- **Backend:** FastAPI + SQLAlchemy (async) + asyncpg + bcrypt + PyJWT + rapidfuzz
- **Database:** Supabase Postgres (transaction pooler)
- **Frontend:** React 19 + react-router-dom + axios + Tailwind CSS + lucide-react
- **Auth:** JWT (HS256), 12h expiry, bcrypt password hashing

## Setup

### 1. Database (Supabase)
1. Create a free project at [supabase.com](https://supabase.com)
2. Click the green **Connect** button at the top of the dashboard
3. Choose the **Transaction pooler** tab and copy the URI
4. Replace `[YOUR-PASSWORD]` with your DB password
5. URL-encode any special characters in the password (`!` → `%21`, `@` → `%40`, etc.)

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edit .env: fill in DATABASE_URL, JWT_SECRET, ADMIN_*
pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```
The first startup will:
- Create all tables idempotently
- Seed the admin user from `ADMIN_USERNAME` / `ADMIN_PASSWORD`

### 3. Frontend
```bash
cd frontend
cp .env.example .env
# Edit .env: set REACT_APP_BACKEND_URL
yarn install
yarn start
```
Visit `http://localhost:3000` for the guest intake form, or `/staff/login` for staff access.

## Project Status

**Phase 1 (Complete):** Guest intake form, duplicate detection by invoice number, preference resolution records.

**Phase 2 (Complete):** Staff admin dashboard with auth, guest management, preferences graph, stats bar, notes, activity log.

**Phase 3 (Planned):** Table management + seating assignment + auto-suggest engine.

**Phase 4 (Planned):** Ballroom floor-plan canvas designer with drag-drop, floor-plan upload, auto-arrange.

**Phase 5 (Planned):** CSV import (QuickBooks), print views, soft-locks for concurrent editing, year-to-year archive.

## Test Account
After first startup, log in at `/staff/login` using whatever `ADMIN_USERNAME` / `ADMIN_PASSWORD` you set in `backend/.env`.

## Schema
Auto-created on backend startup. See `backend/db.py` → `SCHEMA_SQL` for the full DDL. Tables: `guests`, `staff_users`, `staff_notes`, `preference_resolutions`, `ballrooms`, `tables`, `seat_assignments`, `canvas_objects`, `activity_log`, `archives`.

## License
Private.
