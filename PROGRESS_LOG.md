# Progress Log

> Append-only. Most recent session at the top.

---

## 2026-06-11 (continued) — Canvas navigation + bug fixes

### Completed
- **Mouse-wheel zoom** with cursor-anchored zoom — the point under the cursor stays put when you scroll. Range: 20%–400%.
- **Pan everywhere**: hold <kbd>Space</kbd> and drag (or middle-click drag) to pan, even when the cursor is over an object. The previous "drag empty canvas to pan" still works.
- **Cursor feedback**: changes to `grab` when Space is held, `crosshair` during calibration, `grabbing` while panning.
- **Door selection hit area** (BUG fix): doors are stroke-only SVG primitives so the clickable area was a thin line. Added an invisible hit-area `<rect>` inside `DoorBody` that covers the slab + swing arc bounds. Doors now select reliably and the side panel surfaces their swing-direction / hinge-side / double-door controls.
- **Calibration capture** (BUG fix): object handlers `stopPropagation()`, which meant clicks on the floor-plan image during calibration never reached the SVG handler. Added a transparent fullscreen `<rect data-bg="1">` that mounts only while calibrating — it captures every click and routes it to the calibration state machine.
- **Help banner** updated to describe the new navigation gestures.

### Next steps
- Re-run the frontend testing agent (or eyeball manually) to confirm both bugs above are gone.

---

## 2026-06-11 — Ballroom Canvas Phase 4

### Completed
- **Local dev environment**
  - Installed Postgres 15 inside the container, created `pesach` DB and role.
  - Added `backend/.env`, `backend/.env.example`, `frontend/.env`, `frontend/.env.example`.
  - Rewrote `backend/requirements.txt` (was MongoDB-template) to match the actual SQLAlchemy + asyncpg stack the backend already uses.
  - Installed missing JS dependency: `pdfjs-dist@4.7.76` (client-side PDF rendering for floor-plan uploads).
- **Backend schema (idempotent ALTERs in `backend/db.py`)**
  - `ballrooms`: `snap_enabled`, `grid_size_in`, `bg_opacity`, `bg_visible`, `bg_calibration` (jsonb), `px_per_ft`.
  - `tables`: `width_in`, `length_in`.
  - `canvas_objects`: `properties` (jsonb) for per-object metadata (door swing direction etc.).
- **Backend API (`backend/server.py`)**
  - Extended `TableInput`/`TableUpdateInput` with `widthIn`/`lengthIn`.
  - Extended `CanvasObjectInput`/`CanvasObjectUpdate` with `properties`.
  - New endpoint: `PATCH /api/ballrooms/{id}/canvas-settings` (snap, grid, opacity, visibility, calibration, pxPerFt, width/height feet).
  - `ballroom_to_api`, `table_to_api`, `canvas_obj_to_api` now return the new fields.
- **Frontend canvas (`frontend/src/pages/BallroomCanvas.jsx` rewrite)**
  - Invisible grid + toolbar snap toggle + configurable grid (default 6 in).
  - Blueprint-style room-dimension labels on top & right edges; live-edit via side panel.
  - Floor-plan upload accepts PNG/JPG **and PDF** (first page rendered with pdfjs-dist).
  - Two-click calibration flow that sets `pxPerFt` and persists calibration metadata.
  - Floor-plan opacity slider + show/hide toggle (persisted).
  - Auto chairs around every table, distributed by shape & capacity, updates with capacity.
  - Dimension labels under tables (`60in round`, `8ft × 4ft` etc.).
  - Universal corner-resize handles + top rotation handle (45° snap, Shift = free).
  - Doors: single + double; auto-snap to nearest wall on placement and after drag; swing direction & hinge side configurable in the side panel.
  - Multi-room placeable shapes: `ballroom`, `bathroom`, `hallway`.
  - **Drag bug fix**: pointer listeners attached at `window` level (`pointermove` + `pointerup` + `pointercancel`) so drag always terminates, even when the mouse is released outside the canvas.
- **Maintenance files**
  - `TASKS.md` (roadmap)
  - `PROGRESS_LOG.md` (this file)
  - `FUTURE_COMMERCIAL_READINESS.md` (Phase 5 brief, verbatim, saved for later)

### Bugs / issues
- ESLint v9 doesn’t auto-load CRA’s `eslintConfig` from `package.json`; lint reports through CRA still work but a standalone `npx eslint` won’t. Non-blocking.
- Backend `requirements.txt` had Mongo-template entries from the bootstrap; replaced with the actual deps the code imports (Postgres / SQLAlchemy / asyncpg / bcrypt / rapidfuzz). Anyone re-installing on a fresh container will now get a working stack.

### Next steps for the next agent
1. Run the **backend testing agent** against the new endpoints (`canvas-settings`, doors via canvas-objects, table dimensions).
2. With user approval, run the **frontend testing agent** end-to-end on the canvas:
   - Snap toggle
   - Grid size change
   - Upload image then PDF and verify scale via calibration
   - Place door & confirm wall snap
   - Place bathroom + hallway, label them
   - Drag a table outside the canvas, release mouse: confirm no ghost drag
   - Resize round table via corner handle and rectangular table via corner handle
   - Rotate table with snap and with Shift (free)
3. Pick up Phase 5 (commercial readiness) per `FUTURE_COMMERCIAL_READINESS.md` — **stay local first**, do not wire Supabase production until validated locally.

---

## 2026-02-12 — Phase 4.5: Automated Seating & Inventory Logic

**Scope shipped:**
- Backend switched to Supabase Postgres (transaction pooler). Schema bootstrap is idempotent so existing data is preserved.
- New `table_types` inventory table + CRUD endpoints. Canvas "Add Table" palette is now driven entirely by inventory — no custom sizes.
- New "Table Inventory" admin tab in dashboard (`TableInventoryTab.jsx`).
- Visual seating indicators: green chairs for assigned seats, gray for empty, red table border (`⚠`) when over-capacity. Combined-table groups use summed capacity.
- Automated seating engine: groups guests by `family_id`, prioritizes `near_family_id` adjacency, fills tables to capacity, and links multiple tables under one `group_id` when a family > any single-table capacity. Preview + Apply flow.
- Bulk guest import accepts CSV (raw + multipart) and Excel (.xlsx) with column aliasing. Upserts by invoice_number.
- "Skip / Dev login" button on staff login (gated by `DEV_AUTH_BYPASS=1`).
- Guest list now shows an inline table dropdown that moves the entire family. Friendly capacity-error UX.

**Tests:** Phase-5 testing agent run → 24/24 backend pytest pass, 100% frontend phase-5 flows verified. Cosmetic findings (palette tile truncation, dead-store cleanup) fixed in the same session.

**Files touched:**
- backend: `server.py`, `db.py`, `requirements.txt` (`openpyxl`)
- frontend: `Dashboard.jsx`, `BallroomCanvas.jsx`, `StaffLogin.jsx`, `lib/auth.jsx`, new `TableInventoryTab.jsx`, new `components/GuestBulkActions.jsx`
- env: `backend/.env` (DATABASE_URL = Supabase pooler, DEV_AUTH_BYPASS=1)

## 2026-02-12 — Phase 6: Canvas UX & Ops Polish

**Scope shipped:**
- Persisted undo/redo per staff via /api/history/{undo,redo,stack} + DB-backed action_history table. Ctrl+Z and Ctrl+Y/Ctrl+Shift+Z bound globally and on the canvas.
- Conflict detection endpoint (/api/seating/conflicts) — over_capacity (group-aware), family_split (multi-table tagging), near_family_not_at_same_table, one_way_preference. Red dot badge on canvas tables.
- Analytics tab with 10 cards backed by /api/analytics/summary.
- Canvas palette: divider line + text label tools (double-click to edit text). HTML5 drag-from-palette drops at cursor; click-to-center fallback retained.
- Ctrl/Cmd+click multi-select + Delete/Backspace + toolbar trash button.
- Floating canvas guest panel (toggleable). Drag family cards onto tables → /api/guests/family/move seats the whole family.
- Guest drawer edit mode: invoice, family_id, near_family_id, preferences, table assignment.
- PDF export (jsPDF + html-to-image): clean floor-plan page + master seating list sorted by last name.
- Sticky drag bug hardened: window-level pointermove/up/cancel + blur/visibilitychange/Escape resets stuck drag state.

**Bug fixed during review (testing-agent flag):**
- Group-aware over-capacity detection now aggregates seated count across grouped tables before comparing to combined capacity; family_split conflicts now tag every affected table.

**Tests:** backend/tests/test_phase6.py + backend/tests/test_phase6_extended.py → 11/11 passing. Frontend Phase-6 surfaces verified by testing agent (iteration_6.json).

**Files touched:**
- backend: server.py, db.py
- frontend: BallroomCanvas.jsx, Dashboard.jsx (analytics tab, global undo/redo header, guest drawer edit)
- frontend new components: CanvasGuestPanel inside BallroomCanvas.jsx, AnalyticsTab inside Dashboard.jsx
- backend tests: tests/test_phase6.py (new), tests/test_phase6_extended.py (added by testing agent)
- docs: CHANGELOG.md (new), TASKS.md, PROGRESS_LOG.md, PRD.md

**Phase-6 backlog (intentionally deferred):**
- Smart Figma-style alignment guides
- Printable centerpiece cards (per-table guest sheets)
- Year-to-year archive + reset tool
- WebSocket live collaborative editing with soft locks

## 2026-02-12 — Mobile-friendly responsive pass

Applied responsive Tailwind classes across the app so it's usable on phones (tested at 390×844 / iPhone 14):
- Dashboard header / stats bar / tab bar collapse + scroll on `<sm`.
- Every data table now lives in `overflow-x-auto` with `min-w`; low-priority columns hide at `<sm` / `<md`.
- GuestDrawer takes full screen on phone.
- BallroomCanvas: palette hidden by default on phone (toggle button), properties panel becomes a bottom sheet, guest panel fills the screen.
- `index.css` adds `.no-scrollbar`, `touch-action:none` for the canvas SVG, removes iOS tap highlight.

Modals (Bulk Import, Auto-Assign) now use full viewport on phone with internal scroll.

Files touched: Dashboard.jsx, BallroomCanvas.jsx, TableInventoryTab.jsx, TablesTab.jsx, RosterTab.jsx, components/GuestBulkActions.jsx, index.css.
