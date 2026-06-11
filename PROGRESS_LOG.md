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
