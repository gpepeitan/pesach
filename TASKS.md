# ArrangeMySeats — Engineering Roadmap

> Source of truth for tasks. Update this file as work progresses.
> `[x]` = done · `[ ]` = open · `[~]` = in progress

---

## Phase 4 — Ballroom Canvas (current focus)

### Visual cleanup & precision
- [x] Hide grid lines on the canvas (snapping still works)
- [x] Add toolbar toggle to turn snap on/off
- [x] Make grid cells smaller (configurable, default 6 in)

### Room boundary & dimensions
- [x] Show width/height labels on the edges of the room (blueprint style)
- [x] Side-panel inputs to edit room dimensions live
- [x] Resize the room boundary in real time when dimensions change

### Floor-plan upload (image / PDF)
- [x] Upload image (PNG/JPG) as background layer
- [x] Upload PDF (first page rendered client-side via `pdfjs-dist`)
- [x] Two-click calibration ("this line equals  X ft") that sets `pxPerFt`
- [x] Toggle floor-plan visibility (show/hide)
- [x] Opacity slider on the floor-plan layer
- [x] Persist calibration / opacity / visibility on the ballroom

### Chairs around tables
- [x] Auto-place chairs around each table by capacity
  - Round  → evenly distributed around the perimeter
  - Rect/Square → walking the perimeter
- [x] Re-render automatically when capacity changes

### Table dimensions
- [x] Display table dimensions as label under the object ("60in round", "8ft × 4ft")
- [x] Side-panel inputs for `widthIn` / `lengthIn`
- [x] Drag corner handles to resize
- [x] Backend stores `width_in` / `length_in` on the `tables` table

### Universal resize & rotation
- [x] Four corner resize handles on every object & table
- [x] Top rotation handle
- [x] Rotation snaps to 45° by default; Shift = free rotate

### Doors
- [x] Single door object (floor-plan-style arc + slab)
- [x] Double door variant
- [x] Configurable swing direction (left / right) and hinge side
- [x] Auto-snap to nearest wall on placement and on release

### Multi-room connected layout
- [x] Placeable room objects (`room_ballroom`, `room_bathroom`, `room_hallway`)
- [x] Rooms render as labelled boundaries inside the shared canvas
- [x] Separate tabs ("Add Ballroom" on dashboard) still exist for fully-separate venues

### Bathrooms
- [x] Bathroom placeable from the palette (labelable, resizable)

### Drag-bug fix
- [x] Window-level `pointerup` / `pointercancel` ensures drag always stops, even outside the canvas

### Navigation (added after first frontend pass)
- [x] Mouse-wheel zoom (cursor-anchored)
- [x] Space-bar + drag = pan anywhere (works even over objects)
- [x] Middle-click drag = pan
- [x] Cursor feedback (grab / grabbing / crosshair)
- [x] BUG fix: doors now have a proper hit area and are selectable
- [x] BUG fix: calibration captures clicks on the floor-plan image (not only on the empty canvas)

---

## Phase 4.5 — Automated Seating & Inventory Logic (DONE 2026-02)

### Table Inventory (staff-defined, not hardcoded)
- [x] `table_types` table + CRUD (`/api/table-types`)
- [x] Admin "Table Inventory" tab in the dashboard
- [x] Canvas "Add Table" palette dynamically loads only inventory items — no custom sizes
- [x] Creating a table from the palette POSTs with `typeId` and inherits shape/seats/dims

### Visual seating indicators
- [x] Chair = green when a guest is assigned to that seat, gray when empty
- [x] Table = red border + ⚠ when seated count exceeds effective capacity
- [x] Combined-table groups (same `group_id`) use summed capacity so the anchor isn't red

### Automated seating engine
- [x] Group unassigned guests by `family_id`
- [x] Prioritize seating families adjacent to `near_family_id` (adjacency bonus)
- [x] Fill tables to capacity before opening a new one
- [x] Combine multiple tables under one `group_id` when a family > any single table
- [x] Reserved-group tables are excluded from other families' single-table fits
- [x] `POST /api/seating/auto-assign` — apply=true persists, apply=false previews
- [x] Auto-Assign modal in Guest List with Preview + Apply

### Bulk import (CSV / Excel / QuickBooks)
- [x] `POST /api/guests/bulk-import` — accepts raw CSV, multipart CSV, multipart .xlsx
- [x] Bulk Import modal in Guest List
- [x] Column aliasing (full_name/name, invoice_number/invoice, party_size/guests, etc.)
- [x] Upserts by invoice_number, returns inserted/updated/skipped + per-row errors

### Skip / Dev login
- [x] `POST /api/auth/dev-login` gated by `DEV_AUTH_BYPASS=1` in backend/.env
- [x] Yellow "Skip / Dev login" button on the staff login page

### Guest list table column
- [x] New "Table" column shows assigned table number
- [x] Inline `<select>` moves the entire family (`POST /api/guests/family/move`)
- [x] Friendly error when family won't fit the target table (409 capacity_exceeded)

### Database moved to Supabase (per user request 2026-02)
- [x] `DATABASE_URL` switched to Supabase transaction pooler
- [x] Idempotent schema bootstrap on startup (no data wipe risk)

---

## Phase 5 — Commercial Readiness (NEXT)

The full brief is preserved in [`FUTURE_COMMERCIAL_READINESS.md`](./FUTURE_COMMERCIAL_READINESS.md).
Do **not** start until canvas Phase 4 is fully signed off by the program directors.

- [ ] Multi-tenant Firestore (silo every event / program by `programId`)
- [ ] Role-based access control (Admin / Staff)
- [ ] `.env.example` populated for **every** required key (already started for backend & frontend)
- [ ] Firebase Hosting prod vs dev split + CI/CD
- [ ] Program onboarding flow (unique `programId`, scoped URLs & queries)
- [ ] Firestore Security Rules audit (no cross-tenant reads/writes)
- [ ] `TERMS.md`, `PRIVACY.md`, `CONTACT.md` scaffolding
- [ ] Strip debug logs / TODOs / hard-coded test data

> Reminder from the product owner: **"Don't connect to Supabase yet — connect locally first."**
> Phase 5 work should validate against the local Postgres setup before any production wiring.

---

## Operational protocol (every session)

1. Read this file before starting.
2. Mark items `[~]` when you begin, `[x]` when verified done.
3. Append a session entry to [`PROGRESS_LOG.md`](./PROGRESS_LOG.md) before closing the session.
4. Use "Save to GitHub" from the chat UI to push to `main` at end of session.
