# Changelog — ArrangeMySeats / Passover Seating Manager

All notable changes are tracked here in reverse-chronological order.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Public Deployment Setup] — 2026-07-05

### Added
- Render Blueprint config for the FastAPI backend (`render.yaml`) with free web service settings and required secret placeholders.
- Vercel SPA rewrite config for the React frontend (`frontend/vercel.json`).
- Backend and frontend `.env.example` files for public deployment.
- `DEPLOYMENT.md` with step-by-step Render, Vercel, Supabase, and CORS setup.

### Changed
- Backend CORS can now be restricted with `CORS_ORIGINS` instead of always allowing every origin.

---

## [Phase 4 Completion Polish] — 2026-07-05

### Added
- Smart canvas alignment guides for drag and resize interactions. Tables and objects now snap to nearby edge and midpoint alignments against other placed items and the room boundary.
- Ctrl/Cmd multi-selected tables and objects now move/rotate together as a group and persist each changed item.

### Changed
- Palette placement is drag-only. The prior click-to-center fallback and staff-facing copy were removed so objects drop exactly where released.

---

## [Phase 6 — Canvas UX & Ops Polish] — 2026-02

### Added
- **Persisted undo / redo (per-staff, DB-backed)** via `POST /api/history/undo`,
  `POST /api/history/redo`, `GET /api/history/stack`. New `action_history` table
  records before+after JSON snapshots for tables, canvas-objects, and guests.
- **Global keyboard shortcuts** Ctrl+Z (undo) / Ctrl+Y / Ctrl+Shift+Z (redo) wired
  both in the dashboard header and inside the BallroomCanvas. Typing in inputs is ignored.
- **Conflict detection** (`GET /api/seating/conflicts`) — flags:
  `over_capacity` (group-aware), `family_split`, `near_family_not_at_same_table`,
  `one_way_preference`. Each table with a conflict shows a red dot badge on the canvas.
- **Analytics tab** with 10 cards (submissions, people, seated, unassigned, partial,
  tables, total capacity, table-utilization %, high chairs, active conflicts) backed
  by `GET /api/analytics/summary`.
- **Canvas palette: divider line & text label tools** (`palette-line`, `palette-text`).
  Text labels are double-click-to-edit.
- **HTML5 drag-from-palette**: palette tiles are now `draggable`; dropping on the
  canvas places the object at the cursor (not the centre). Click-to-centre kept as fallback.
- **Ctrl/Cmd+click multi-select**, **Delete/Backspace** to remove selection (single
  or multi). Toolbar buttons: undo, redo, delete, toggle guest panel, print.
- **Canvas guest panel** (floating, toggleable, draggable family cards). Dropping a
  family card on a table calls `/api/guests/family/move` and seats the whole family.
- **Guest drawer edit mode**: invoice number, family ID, near-family ID, seating
  preferences (up to 5), table assignment (moves whole family). Writes through
  `PATCH /api/guests/{id}` + `POST /api/guests/family/move`.
- **PDF export** (jsPDF + html-to-image): clean floor-plan page + master seating
  list sorted by last name.

### Changed
- `PATCH /api/guests/{id}` now accepts `invoiceNumber` and `seatingPreferences`.
- `update_guest` / `update_table` / `update_canvas_object` all record history.

### Fixed
- **Sticky drag bug, hardened**: pointermove/up/cancel attached to `window`; also
  resets on `blur`, `visibilitychange (hidden)`, and `Escape`. The bug can no
  longer regress when the cursor exits the canvas or browser.
- **Group-aware over-capacity detection**: conflicts now aggregate seated counts
  across all tables sharing a `group_id` and compare against the group capacity,
  not the per-table capacity (so combined-table overflow surfaces correctly).
- **family_split conflict** tagging now attaches the entry to every member table,
  not just the first.

### Mobile-friendly responsive pass (2026-02-12, same release)
- Dashboard header collapses (logo shortened, user name hidden, Logout text hidden) on `<sm`.
- Stats bar becomes a horizontally-scrolling strip on `<sm` with smaller type.
- Tab bar scrolls horizontally on `<sm` with `no-scrollbar` utility.
- All data tables (Guest List, Inventory, Roster, Staff, Activity Log, Auto-Assign plan, Bulk Import) wrap in `overflow-x-auto` with `min-w` so columns don't collapse.
- GuestList hides low-priority columns at `<sm` (invoice, family, flags, submitted) and at `<md` (status).
- GuestDrawer is full-width on `<sm` (drops `max-w-lg`).
- BallroomCanvas: palette is hidden by default on `<sm`, opens as a sliding tray; properties side panel becomes a bottom sheet (max-h 55vh, sticky bottom) on `<sm`; canvas guest panel fills the screen on `<sm`; toolbar wraps + scrolls.
- iOS niceties in `index.css`: `touch-action: none` on the SVG canvas so pointer drags work without page zoom; `-webkit-tap-highlight-color: transparent`.

### Tests
- `backend/tests/test_phase6.py` (7) + `backend/tests/test_phase6_extended.py` (4) — **11/11 passing**.

---

## [Phase 4.5 — Automated Seating & Inventory Logic] — 2026-02

(See PROGRESS_LOG.md for the full breakdown.)

- DB switched to Supabase Postgres (transaction pooler, idempotent schema).
- `table_types` inventory table + admin "Table Inventory" tab — canvas is inventory-locked.
- Green / gray chairs + red over-capacity warning on tables.
- Auto-Assign engine (group by family, prioritise near_family adjacency, combine tables).
- Bulk import (CSV + Excel + QuickBooks-style headers).
- Skip / Dev login button on staff login.
- Guest list inline family-move dropdown.

---

## [Phase 4 — Ballroom Canvas Designer] — 2026-01

Multi-room layouts, scale calibration, PDF/PNG background, auto-chair placement,
door snapping, dimension labels, zoom & pan.

## [Phase 3 — Preferences & Roster] — 2025-12
## [Phase 2 — Tables & Seating] — 2025-11
## [Phase 1 — Guest Intake + Staff Auth] — 2025-10
