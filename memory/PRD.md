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

## Implemented (Phase 1 + Phase 2 + Phase 3 + Roster + Phase 4 — 2026-01)
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
- **Phase 3 additions:**
  - Ballrooms: `GET/POST/PATCH/DELETE /api/ballrooms` (admin for writes)
  - Tables: `GET/POST/PATCH/DELETE /api/tables` (filter by `ballroomId`), `GET /api/tables/{id}` (with seated guests)
  - Assignment: `POST /api/tables/{id}/assign` (with capacity check, `allowOverflow` override, preference-match metadata), `POST /api/tables/{id}/unassign/{guestId}`, `PATCH /api/tables/{id}/guests/{guestId}/seated`
  - Auto-suggest: `POST /api/seating/auto-suggest` (returns plan, no writes), `POST /api/seating/auto-suggest/apply` (applies the reviewed plan)
- **Roster additions (master booking list from QuickBooks):**
  - Public: `GET /api/roster/lookup/{invoice}` (used for invoice→name auto-fill), `GET /api/roster/search?q=` (used for preference autocomplete, supports `excludeInvoice`)
  - Staff: `GET /api/roster` (with search filter)
  - Admin: `POST /api/roster` (single), `POST /api/roster/import-csv` (multipart or raw CSV; case-insensitive headers; upsert by invoice), `DELETE /api/roster/{id}`
  - **Auto-link logic on guest submit:** When `linkedInvoiceNumbers` is sent parallel to `seatingPreferences`, each preference_resolution stores `linked_invoice_number`. If the linked invoice has already submitted → auto-confirm immediately. When ANY guest submits, any pending preference_resolution whose `linked_invoice_number` matches the new guest's invoice → auto-confirm (REVERSE direction). Result: zero fuzzy matching needed when both parties use the autocomplete.
- **Phase 4 additions (Ballroom Canvas Designer):**
  - `PATCH /api/ballrooms/{id}/floor-plan` — admin upload of base64 data-URL floor plan image
  - `GET /api/ballrooms/{id}/canvas-objects`, `POST /api/canvas-objects`, `PATCH /api/canvas-objects/{id}`, `DELETE /api/canvas-objects/{id}` — full CRUD for non-table canvas decorations
  - Frontend: full-screen `BallroomCanvas` (SVG) with grid, pan, zoom +/-/fit, palette of 12 placeable item types (3 table shapes + stage/dance floor/bar/buffet/carving/pillar/entrance/exit/blocker), drag-and-drop with snap-to-grid persistence, double-click table → reuses Phase 3 modal, floor plan image as semi-transparent SVG background

### Frontend (`/app/frontend/src/`)
- `/` — Guest IntakeForm (Phase 1 — mobile-friendly, stone-themed, with live duplicate warning)
- `/confirmation` — Submission summary with optional duplicate banner
- `/staff/login` — JWT login
- `/staff` — Admin dashboard with **7 tabs** (Guest List, Unassigned Queue, Tables & Seating, Preferences, **Roster**, Activity Log, Staff Admin), sticky stats bar polling every 8s, side-drawer guest detail with notes thread
- **Phase 3 — Tables tab:** Per-ballroom cards grid with color-coded fill (gray/blue/yellow/green), click table → side modal with seated guests, picker to assign unassigned guests, capacity overflow with confirm dialog, physically-seated toggle, Auto-Suggest modal with plan preview + apply, ballroom CRUD (admin)
- **Roster — IntakeForm + Admin tab:** Invoice number → 'we found your booking' banner with one-click name fill. Preference inputs → debounced autocomplete dropdown with green '✓ linked' indicator when picked. Admin Roster tab: CSV upload, manual add, search, delete. Discreet "Staff login" footer link on the public intake form.

### Database (Supabase Postgres)
All Phase 1 + 2 + future-phase tables created: `guests`, `staff_users`, `staff_notes`, `preference_resolutions`, `ballrooms`, `tables`, `seat_assignments`, `canvas_objects`, `activity_log`, `archives`.

## Test Status
- **Backend:** 125/125 pytest cases pass (Phase 1+2: 39 + Phase 3: 31 + Roster: 19 + Phase 4: 12 + Phase 4.5: 24)
- **Frontend:** All critical flows verified via Playwright across 5 testing iterations
- **Bugs fixed during iterations:** (i1) Dashboard.jsx useEffect-returning-Promise; (i2) server.py preference-match tuple-row access; (i3) db.py ALTER TABLE ordering; (i4) BallroomCanvas.jsx nullish-coalescing precedence on drag offset

## Phase 4.5 — Automated Seating & Inventory Logic (2026-02)
**Shipped:**
- DB switched to Supabase Postgres pooler (idempotent schema bootstrap, no data wipe).
- New `table_types` inventory + admin tab. Canvas "Add Table" palette is inventory-locked (no custom sizes).
- Visual seating indicators: **green** chairs for assigned seats, **gray** for empty, **red** table border + ⚠ when over-capacity. Combined-table groups use summed capacity.
- Auto-Assign engine: groups guests by `family_id`, prioritizes `near_family_id` adjacency, fills tables to capacity, and **combines** multiple tables under one `group_id` when a family > single-table capacity. Preview + Apply.
- Bulk guest import: CSV (raw + multipart) + Excel (.xlsx) + QuickBooks-style headers via column aliasing. Upserts by invoice_number.
- Skip / Dev login button on staff login (gated by `DEV_AUTH_BYPASS=1`).
- Guest list: new Table column with inline family-move dropdown. Capacity-exceeded → friendly UI error.

## Backlog — Remaining
### P0 / Phase 4: Ballroom Canvas Designer
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
