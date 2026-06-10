# Passover Seating Manager — PRD

## Original Problem Statement
Web app for managing seating at a large-scale Passover hotel program with 1,000+ guests across multiple ballrooms. Two sides:
- **Guest-facing intake form** (mobile-friendly, no login)
- **Staff admin dashboard** (named JWT logins, multi-admin, full audit trail)

Originally bootstrapped in Replit on Node/Express/Postgres/Drizzle. Ported to Emergent on **FastAPI + SQLAlchemy + Supabase Postgres + React** while preserving the original schema and product decisions.

## Stack (Production)
- **Backend:** FastAPI (Python) + SQLAlchemy async + asyncpg
- **Database:** Supabase Postgres (transaction pooler, statement_cache_size=0)
- **Frontend:** React 19 + react-router-dom + axios + Tailwind CSS + lucide-react
- **Auth:** JWT (HS256), 12h expiry, bcrypt password hashing, Bearer-token via localStorage
- **Fuzzy matching:** rapidfuzz WRatio scorer (threshold 0.60)

## User Personas
1. **Guest** — fills out intake form once (or resubmits if invoice flagged duplicate). No login.
2. **Staff member** — logs in with username/password, manages guests, posts notes, resolves preferences.
3. **Admin** — everything staff can do + creates/deactivates staff users.

## Core Requirements (static)
- Guests submit: fullName, invoiceNumber, partySize, up to 5 seatingPreferences, highChairNeeded + count, specialNotes.
- Duplicate detection by invoiceNumber — flag, never overwrite.
- Mutual / one-way / unresolved preference buckets with fuzzy match suggestions.
- Live stats: total guests, total people, % seated, % unassigned, duplicates, unresolved prefs, high chairs.
- Every staff write action logged with staff_member_name + timestamp.
- Multiple admins, no cap.

## Implemented (Phase 1 + Phase 2 — 2026-01)
### Backend (`/app/backend/server.py`, `db.py`)
- Auto-creates full Postgres schema on startup (Phase 1 + 2 + forward-compat tables for Phase 3-5)
- Auto-seeds admin user (Eitanp) on startup
- Public: `POST /api/guests`, `GET /api/guests/check-invoice/{n}`
- Auth: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- Guests: `GET /api/guests` (search/filter/sort), `GET /api/guests/{id}`, `PATCH /api/guests/{id}`, `GET /api/guests/unassigned`, `GET /api/guests/stats`
- Notes: `GET/POST/DELETE /api/guests/{id}/notes`
- Preferences: `GET /api/preferences/mutual|one-way|unresolved`, `PATCH /api/preferences/{id}/resolve`, `GET /api/guests/{id}/preference-resolutions`
- Activity: `GET /api/activity-log` (filterable)
- Staff (admin): `GET/POST/PATCH /api/staff`

### Frontend (`/app/frontend/src/`)
- `/` — Guest IntakeForm (Phase 1 — mobile-friendly, stone-themed, with live duplicate warning)
- `/confirmation` — Submission summary with optional duplicate banner
- `/staff/login` — JWT login
- `/staff` — Admin dashboard with 5 tabs (Guest List, Unassigned Queue, Preferences, Activity Log, Staff Admin), sticky stats bar polling every 8s, side-drawer guest detail with notes thread

### Database (Supabase Postgres)
All Phase 1 + 2 + future-phase tables created: `guests`, `staff_users`, `staff_notes`, `preference_resolutions`, `ballrooms`, `tables`, `seat_assignments`, `canvas_objects`, `activity_log`, `archives`.

## Test Status
- **Backend:** 39/39 pytest cases pass (auth, guest CRUD with dup detection, filters/sort/stats, notes, preferences mutual/one-way/unresolved + resolve, activity log, admin staff mgmt)
- **Frontend:** All critical flows verified via Playwright (intake submit, duplicate warning, login, dashboard tabs, search/filter/drawer/notes, prefs subtabs, activity log, staff CRUD, logout)
- **One bug fixed during testing:** Dashboard.jsx useEffect-returning-Promise crash (resolved)

## Backlog — Phases 3-5
### P0 / Phase 3: Table Management + Seating Assignment
- CRUD for `tables` (number, label, shape, dimensions, capacity, ballroom)
- Assign guest → table with party-keep-together + preference-aware logic
- Auto-suggest seating engine (mutual matches first, then by party size)
- Color-coded table fill status (green/yellow/blue/gray)
- "Physically seated" checklist per table

### P1 / Phase 4: Ballroom Canvas Designer
- Per-ballroom canvas with snap-to-grid
- Build from scratch (dimensions, walls, fixed elements) OR upload floor plan image and trace
- Placeable: round/rect/square tables, bar/buffet/carving stations, stages, dance floor, entrance/exit, pillars, blockers
- Drag-drop tables, live fill status indicators, hover guest tooltips
- Auto-arrange respecting aisle width + preference groups
- Multi-ballroom tabs, move tables across ballrooms
- PDF/PNG export (with names or table-numbers-only)

### P2 / Phase 5: Operations Polish
- CSV import from QuickBooks (bulk guest add)
- Print views: per-table cards, master list, per-ballroom summary
- Live editing indicators + soft-lock warnings (websockets)
- Year-to-year archive + reset (preserve ballroom layouts as templates)

## Next Tasks
1. **Push current build to GitHub** (Save to GitHub from chat input)
2. **Phase 3 kickoff** — table management + seating assignment + auto-suggest

## Multi-Tenant SaaS Backlog (when ready to sell)
- Add `organization_id` foreign key to all tenant-owned tables (guests, ballrooms, tables, staff_users)
- Add org signup + Stripe subscription (Stripe test keys already in env)
- Per-org admin invite flow
- Per-org subdomain or workspace routing
