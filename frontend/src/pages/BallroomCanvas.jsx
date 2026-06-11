/**
 * Ballroom Canvas — Phase 4 designer.
 *
 * Features:
 *  1. Invisible grid (snapping still works) + toolbar toggle for snap on/off; finer grid (default 6in)
 *  2. Live-editable room dimensions (labels on edges + side panel)
 *  3. Floor-plan upload (image / PDF) with two-click calibration, opacity + show/hide
 *  4. Auto-chairs around tables based on capacity
 *  5. Table dimension labels + drag-corner resize + side-panel inputs
 *  6. Universal resize handles + 45-degree-snap rotation handle (Shift for free rotate)
 *  7. Door object (arc + swing direction); single or double; auto-snap to nearest wall
 *  8. Multi-room layout via placeable room objects on a shared canvas
 *  9. Bathroom as a placeable room type
 * 10. Pointer drag uses window-level pointerup capture — no more "ghost drag" after release
 */
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api";
import * as pdfjsLib from "pdfjs-dist";
import {
  Image as ImageIcon, Trash2, ZoomIn, ZoomOut, Maximize2, Square, Circle,
  RectangleHorizontal, Mic, Music, Wine, Pizza, ChefHat, BoxSelect, DoorOpen,
  DoorClosed, Loader2, MoveLeft, Magnet, Eye, EyeOff, Ruler, Bath, Building2,
  ArrowLeftRight, Settings2, ChevronRight, ChevronLeft,
} from "lucide-react";

// Bundler-friendly PDF.js worker — served from CDN at the version we depend on.
// (Avoids needing to copy pdf.worker into /public.)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Constants ────────────────────────────────────────────────────────────────
const TABLE_COLOR_FILL = { gray: "#e7e5e4", blue: "#bfdbfe", yellow: "#fde68a", green: "#a7f3d0" };
const TABLE_COLOR_STROKE = { gray: "#a8a29e", blue: "#3b82f6", yellow: "#d97706", green: "#10b981" };

// Palette items (icons + default sizes in inches; rendering converts via pxPerFt).
const PALETTE = [
  { group: "Tables", items: [
    { type: "table_round",  label: "Round Table",  icon: Circle,                widthIn: 60, lengthIn: 60, isTable: true, shape: "round" },
    { type: "table_rect",   label: "Rect Table",   icon: RectangleHorizontal,   widthIn: 96, lengthIn: 30, isTable: true, shape: "rectangular" },
    { type: "table_square", label: "Square Table", icon: Square,                widthIn: 48, lengthIn: 48, isTable: true, shape: "square" },
  ]},
  { group: "Doors", items: [
    { type: "door",         label: "Single Door",  icon: DoorOpen,              widthIn: 36, lengthIn: 6, isDoor: true, isDouble: false },
    { type: "door",         label: "Double Door",  icon: ArrowLeftRight,        widthIn: 72, lengthIn: 6, isDoor: true, isDouble: true,  paletteKey: "door_double" },
  ]},
  { group: "Rooms", items: [
    { type: "room_ballroom", label: "Ballroom",    icon: Building2,             widthIn: 240, lengthIn: 240, isRoom: true },
    { type: "room_bathroom", label: "Bathroom",    icon: Bath,                  widthIn: 96,  lengthIn: 96,  isRoom: true },
    { type: "room_hallway",  label: "Hallway",     icon: RectangleHorizontal,   widthIn: 96,  lengthIn: 240, isRoom: true },
  ]},
  { group: "Features", items: [
    { type: "stage",        label: "Stage",        icon: Mic,    widthIn: 240, lengthIn: 96 },
    { type: "dance_floor",  label: "Dance Floor",  icon: Music,  widthIn: 240, lengthIn: 240 },
    { type: "bar",          label: "Bar",          icon: Wine,   widthIn: 144, lengthIn: 30 },
    { type: "buffet",       label: "Buffet",       icon: Pizza,  widthIn: 240, lengthIn: 36 },
    { type: "carving",      label: "Carving",      icon: ChefHat,widthIn: 96,  lengthIn: 36 },
    { type: "pillar",       label: "Pillar",       icon: BoxSelect, widthIn: 18, lengthIn: 18 },
    { type: "entrance",     label: "Entrance",     icon: DoorOpen,  widthIn: 48, lengthIn: 18 },
    { type: "exit",         label: "Exit",         icon: DoorClosed,widthIn: 48, lengthIn: 18 },
    { type: "blocker",      label: "Space Blocker",icon: Square,    widthIn: 60, lengthIn: 60 },
  ]},
];

// Visual style per object type.
const OBJ_STYLE = {
  stage:           { fill: "#fef3c7", stroke: "#92400e", dashed: false, label: "STAGE" },
  dance_floor:     { fill: "#ddd6fe", stroke: "#6d28d9", dashed: false, label: "DANCE FLOOR" },
  bar:             { fill: "#fecaca", stroke: "#991b1b", dashed: false, label: "BAR" },
  buffet:          { fill: "#bbf7d0", stroke: "#166534", dashed: false, label: "BUFFET" },
  carving:         { fill: "#fed7aa", stroke: "#9a3412", dashed: false, label: "CARVING" },
  pillar:          { fill: "#44403c", stroke: "#1c1917", dashed: false, label: "" },
  entrance:        { fill: "#a7f3d0", stroke: "#047857", dashed: false, label: "ENTRANCE" },
  exit:            { fill: "#fecaca", stroke: "#7f1d1d", dashed: false, label: "EXIT" },
  blocker:         { fill: "#d6d3d1", stroke: "#57534e", dashed: true,  label: "BLOCKER" },
  wall:            { fill: "#a8a29e", stroke: "#57534e", dashed: false, label: "WALL" },
  room_ballroom:   { fill: "rgba(255,255,255,0.06)", stroke: "#fbbf24", dashed: true,  label: "BALLROOM" },
  room_bathroom:   { fill: "rgba(125,211,252,0.10)", stroke: "#0284c7", dashed: true,  label: "BATHROOM" },
  room_hallway:    { fill: "rgba(229,231,235,0.06)", stroke: "#94a3b8", dashed: true,  label: "HALLWAY" },
  door:            { fill: "transparent",            stroke: "#0f172a", dashed: false, label: "" },
  sign:            { fill: "#fde68a", stroke: "#92400e", dashed: false, label: "SIGN" },
  marker:          { fill: "#fed7aa", stroke: "#9a3412", dashed: false, label: "MARKER" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inToPx  = (inches, pxPerFt) => (inches / 12) * pxPerFt;
const pxToIn  = (px,     pxPerFt) => (px * 12) / pxPerFt;
const pxToFt  = (px,     pxPerFt) => px / pxPerFt;

function snapVal(v, gridPx, on) {
  if (!on || !gridPx || gridPx <= 0) return v;
  return Math.round(v / gridPx) * gridPx;
}

function snapAngle(deg) {
  const norm = ((deg % 360) + 360) % 360;
  return Math.round(norm / 45) * 45;
}

// Pretty-print a length in feet+inches.
function formatLen(inches) {
  if (!Number.isFinite(inches)) return "—";
  if (inches < 36) return `${Math.round(inches)}in`;
  const ft = Math.floor(inches / 12);
  const remIn = Math.round(inches - ft * 12);
  if (remIn === 0) return `${ft}ft`;
  return `${ft}ft ${remIn}in`;
}

function tablePxDims(t, pxPerFt) {
  // Returns {w, h, radius} in canvas pixels.
  if (t.shape === "round") {
    const d = inToPx(t.widthIn || 60, pxPerFt);
    return { w: d, h: d, radius: d / 2, isRound: true };
  }
  // square: width === length
  if (t.shape === "square") {
    const side = inToPx(t.widthIn || 60, pxPerFt);
    return { w: side, h: side, radius: 0, isRound: false };
  }
  // rectangular: longer side along X by convention
  const w = inToPx(t.widthIn  || 96, pxPerFt);
  const h = inToPx(t.lengthIn || 30, pxPerFt);
  return { w, h, radius: 0, isRound: false };
}

// Compute chair positions (in local coords, relative to top-left of the table's bbox).
function chairsForTable(t, dims) {
  const N = Math.max(0, Math.min(40, t.maxCapacity || 0));
  if (N === 0) return [];
  const chairR = Math.max(7, dims.w * 0.06);
  const gap = 4;
  const out = [];
  if (dims.isRound) {
    const cx = dims.w / 2, cy = dims.h / 2;
    const r = dims.radius + chairR + gap;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N - Math.PI / 2;
      out.push({ cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), r: chairR });
    }
  } else {
    // Distribute chairs along the perimeter starting at the top-left, going CW.
    // Each chair is offset outward from its side by (chairR + gap).
    const W = dims.w, H = dims.h;
    const perim = 2 * (W + H);
    const step = perim / N;
    for (let i = 0; i < N; i++) {
      const d = i * step + step / 2;
      let cx = 0, cy = 0;
      if (d < W)              { cx = d;            cy = -chairR - gap; }
      else if (d < W + H)     { cx = W + chairR + gap; cy = d - W; }
      else if (d < 2 * W + H) { cx = W - (d - W - H);  cy = H + chairR + gap; }
      else                    { cx = -chairR - gap;    cy = H - (d - 2 * W - H); }
      out.push({ cx, cy, r: chairR });
    }
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function BallroomCanvas({ ballroom: initialBallroom, onClose, onOpenTable, isAdmin }) {
  // Local ballroom mirror (kept in sync with backend; mutated locally for snappy UX).
  const [ballroom, setBallroom] = useState(initialBallroom);
  const [tables, setTables] = useState([]);
  const [objects, setObjects] = useState([]);

  // Interaction state
  const [drag,    setDrag]    = useState(null); // {kind:'table'|'object', id, dx, dy, current:{x,y}}
  const [resize,  setResize]  = useState(null); // {kind, id, handle:'br'|'tr'|'bl'|'tl', startW, startH, startX, startY, sx, sy}
  const [rotate,  setRotate]  = useState(null); // {kind, id, cx, cy, startAngle, baseRotation, freeMode}
  const [panning, setPanning] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 30, y: 30 });

  // UI state
  const [selection, setSelection] = useState(null); // {kind, id} | {kind:'room'}
  const [showPalette, setShowPalette] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [savingFp, setSavingFp] = useState(false);
  const [calibration, setCalibration] = useState({ step: "idle", p1: null, p2: null });

  const svgRef = useRef(null);
  const fileRef = useRef(null);

  // Derived
  const pxPerFt   = ballroom?.pxPerFt   ?? 12;
  const gridSizeIn = ballroom?.gridSizeIn ?? 6;
  const gridPx    = inToPx(gridSizeIn, pxPerFt);
  const snapOn    = ballroom?.snapEnabled !== false;
  const canvasW   = (ballroom?.widthFt  || 80) * pxPerFt;
  const canvasH   = (ballroom?.heightFt || 60) * pxPerFt;

  // ─── Load ────────────────────────────────────────────────────────────────
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!initialBallroom) return;
    let cancelled = false;
    (async () => {
      const [t, o, b] = await Promise.all([
        apiClient.get(`/tables?ballroomId=${initialBallroom.id}`),
        apiClient.get(`/ballrooms/${initialBallroom.id}/canvas-objects`),
        apiClient.get(`/ballrooms`),
      ]);
      if (cancelled) return;
      setTables(t.data);
      setObjects(o.data);
      const fresh = b.data.find(x => x.id === initialBallroom.id);
      if (fresh) setBallroom(fresh);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [initialBallroom, reloadKey]);
  const load = useCallback(() => setReloadKey(k => k + 1), []);

  // ─── Coordinate conversions ──────────────────────────────────────────────
  // Plain function (cheap to recompute) — avoids useCallback dependency churn
  // and a buggy false-positive from the lint rule.
  const screenToCanvas = (sx, sy) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: (sx - r.left) / zoom - pan.x, y: (sy - r.top) / zoom - pan.y };
  };

  // ─── Drag / pan handlers ─────────────────────────────────────────────────
  const onObjectPointerDown = (e, kind, item) => {
    if (!isAdmin) return;
    e.stopPropagation();
    setSelection({ kind, id: item.id });
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const ix = item.canvasX ?? item.x ?? 0;
    const iy = item.canvasY ?? item.y ?? 0;
    setDrag({ kind, id: item.id, dx: x - ix, dy: y - iy, current: { x: ix, y: iy } });
  };

  const onSvgPointerDown = (e) => {
    // Click on empty canvas → start pan and deselect
    const isBg = e.target === svgRef.current || (e.target.getAttribute && e.target.getAttribute("data-bg") === "1");
    if (!isBg) return;
    // Calibration: capture clicks instead of pan
    if (calibration.step === "awaiting-p1" || calibration.step === "awaiting-p2") {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      if (calibration.step === "awaiting-p1") setCalibration({ ...calibration, p1: { x, y }, step: "awaiting-p2" });
      else if (calibration.step === "awaiting-p2") setCalibration({ ...calibration, p2: { x, y }, step: "awaiting-distance" });
      return;
    }
    setSelection(null);
    setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  };

  // ── Resize handle press
  const onResizePointerDown = (e, kind, item, handle) => {
    if (!isAdmin) return;
    e.stopPropagation();
    const dims = kind === "table" ? tablePxDims(item, pxPerFt) : { w: item.width, h: item.height };
    setResize({
      kind, id: item.id, handle,
      startW: dims.w, startH: dims.h,
      startX: item.canvasX ?? item.x ?? 0, startY: item.canvasY ?? item.y ?? 0,
      sx: e.clientX, sy: e.clientY,
      shape: item.shape,
    });
  };

  // ── Rotation handle press
  const onRotatePointerDown = (e, kind, item) => {
    if (!isAdmin) return;
    e.stopPropagation();
    const dims = kind === "table" ? tablePxDims(item, pxPerFt) : { w: item.width, h: item.height };
    const cx = (item.canvasX ?? item.x ?? 0) + dims.w / 2;
    const cy = (item.canvasY ?? item.y ?? 0) + dims.h / 2;
    const p = screenToCanvas(e.clientX, e.clientY);
    const startAngle = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;
    setRotate({ kind, id: item.id, cx, cy, startAngle, baseRotation: item.rotation || 0, freeMode: e.shiftKey });
  };

  // ── Global pointer move/up: ensures drag stops even outside canvas (fix for "ghost drag" bug)
  useEffect(() => {
    if (!drag && !resize && !rotate && !panning) return;

    const onMove = (e) => {
      if (drag) {
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        const nx = snapVal(x - drag.dx, gridPx, snapOn);
        const ny = snapVal(y - drag.dy, gridPx, snapOn);
        if (drag.kind === "table") {
          setTables(ts => ts.map(t => t.id === drag.id ? { ...t, canvasX: nx, canvasY: ny } : t));
        } else {
          setObjects(os => os.map(o => o.id === drag.id ? { ...o, x: nx, y: ny } : o));
        }
        setDrag(d => ({ ...d, current: { x: nx, y: ny } }));
      } else if (resize) {
        const dx = (e.clientX - resize.sx) / zoom;
        const dy = (e.clientY - resize.sy) / zoom;
        let nW = resize.startW, nH = resize.startH;
        let nX = resize.startX, nY = resize.startY;
        const h = resize.handle;
        if (h.includes("r")) nW = Math.max(15, resize.startW + dx);
        if (h.includes("l")) { nW = Math.max(15, resize.startW - dx); nX = resize.startX + (resize.startW - nW); }
        if (h.includes("b")) nH = Math.max(15, resize.startH + dy);
        if (h.includes("t")) { nH = Math.max(15, resize.startH - dy); nY = resize.startY + (resize.startH - nH); }
        // square / round: keep aspect ratio
        if (resize.shape === "round" || resize.shape === "square") {
          const side = Math.max(nW, nH);
          nW = nH = side;
        }
        if (resize.kind === "table") {
          setTables(ts => ts.map(t => t.id === resize.id ? {
            ...t,
            canvasX: nX, canvasY: nY,
            widthIn:  pxToIn(nW, pxPerFt),
            lengthIn: pxToIn(nH, pxPerFt),
          } : t));
        } else {
          setObjects(os => os.map(o => o.id === resize.id ? {
            ...o, x: nX, y: nY, width: nW, height: nH,
          } : o));
        }
      } else if (rotate) {
        const p = screenToCanvas(e.clientX, e.clientY);
        const cur = Math.atan2(p.y - rotate.cy, p.x - rotate.cx) * 180 / Math.PI;
        let nextR = rotate.baseRotation + (cur - rotate.startAngle);
        if (!e.shiftKey) nextR = snapAngle(nextR);
        if (rotate.kind === "table") {
          setTables(ts => ts.map(t => t.id === rotate.id ? { ...t, rotation: nextR } : t));
        } else {
          setObjects(os => os.map(o => o.id === rotate.id ? { ...o, rotation: nextR } : o));
        }
      } else if (panning) {
        setPan({ x: panning.px + (e.clientX - panning.sx) / zoom, y: panning.py + (e.clientY - panning.sy) / zoom });
      }
    };

    const onUp = async () => {
      try {
        if (drag) {
          const { kind, id, current } = drag;
          if (kind === "table") await apiClient.patch(`/tables/${id}`, { canvasX: current.x, canvasY: current.y });
          else {
            // doors auto-snap to nearest ballroom wall on release
            const obj = objects.find(o => o.id === id);
            if (obj && obj.objectType === "door") {
              const snapped = snapDoorToWall({ ...obj, x: current.x, y: current.y }, canvasW, canvasH);
              setObjects(os => os.map(o => o.id === id ? { ...o, ...snapped } : o));
              await apiClient.patch(`/canvas-objects/${id}`, { x: snapped.x, y: snapped.y, rotation: snapped.rotation });
            } else {
              await apiClient.patch(`/canvas-objects/${id}`, { x: current.x, y: current.y });
            }
          }
        } else if (resize) {
          const id = resize.id;
          if (resize.kind === "table") {
            const t = tables.find(x => x.id === id);
            if (t) await apiClient.patch(`/tables/${id}`, {
              canvasX: t.canvasX, canvasY: t.canvasY,
              widthIn: t.widthIn, lengthIn: t.lengthIn,
            });
          } else {
            const o = objects.find(x => x.id === id);
            if (o) await apiClient.patch(`/canvas-objects/${id}`, {
              x: o.x, y: o.y, width: o.width, height: o.height,
            });
          }
        } else if (rotate) {
          const id = rotate.id;
          if (rotate.kind === "table") {
            const t = tables.find(x => x.id === id);
            if (t) await apiClient.patch(`/tables/${id}`, { rotation: t.rotation });
          } else {
            const o = objects.find(x => x.id === id);
            if (o) await apiClient.patch(`/canvas-objects/${id}`, { rotation: o.rotation });
          }
        }
      } catch (err) { console.error(err); }
      setDrag(null); setResize(null); setRotate(null); setPanning(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, resize, rotate, panning, snapOn, gridPx, zoom, pxPerFt, canvasW, canvasH, tables, objects]);

  // ─── Add from palette ────────────────────────────────────────────────────
  const addFromPalette = async (item) => {
    if (!isAdmin) return;
    const r = svgRef.current.getBoundingClientRect();
    const cx = -pan.x + r.width  / (2 * zoom);
    const cy = -pan.y + r.height / (2 * zoom);
    const wPx = inToPx(item.widthIn,  pxPerFt);
    const hPx = inToPx(item.lengthIn, pxPerFt);
    const center = { x: snapVal(cx - wPx / 2, gridPx, snapOn), y: snapVal(cy - hPx / 2, gridPx, snapOn) };
    if (item.isTable) {
      const next = Math.max(0, ...tables.map(t => t.tableNumber || 0)) + 1;
      try {
        await apiClient.post("/tables", {
          tableNumber: next, label: null, ballroomId: ballroom.id,
          shape: item.shape, maxCapacity: 10,
          canvasX: center.x, canvasY: center.y,
          widthIn: item.widthIn, lengthIn: item.lengthIn,
        });
        await load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed to add table"); }
    } else if (item.isDoor) {
      // Snap door to nearest wall on initial drop
      const obj = { x: center.x, y: center.y, width: wPx, height: hPx, rotation: 0, objectType: "door" };
      const snapped = snapDoorToWall(obj, canvasW, canvasH);
      try {
        await apiClient.post("/canvas-objects", {
          ballroomId: ballroom.id, objectType: "door", label: null,
          x: snapped.x, y: snapped.y, width: wPx, height: hPx, rotation: snapped.rotation,
          properties: { isDouble: !!item.isDouble, swingDirection: "right", hingeSide: "left", widthIn: item.widthIn },
        });
        await load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed"); }
    } else {
      try {
        await apiClient.post("/canvas-objects", {
          ballroomId: ballroom.id, objectType: item.type, label: null,
          x: center.x, y: center.y, width: wPx, height: hPx, rotation: 0,
        });
        await load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed"); }
    }
  };

  const removeObject = async (id) => {
    if (!confirm("Remove this object?")) return;
    await apiClient.delete(`/canvas-objects/${id}`);
    setSelection(null);
    await load();
  };

  // ─── Floor plan: upload (image or PDF) ───────────────────────────────────
  const uploadFloorPlan = async (file) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { alert("File too large. Use < 12MB."); return; }
    setSavingFp(true);
    try {
      let dataUrl = null;
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        dataUrl = await pdfFirstPageToDataUrl(file);
      } else {
        dataUrl = await fileToDataUrl(file);
      }
      await apiClient.patch(`/ballrooms/${ballroom.id}/floor-plan`, { backgroundImageUrl: dataUrl });
      setBallroom(b => ({ ...b, backgroundImageUrl: dataUrl, bgVisible: true }));
      await apiClient.patch(`/ballrooms/${ballroom.id}/canvas-settings`, { bgVisible: true });
    } catch (e) {
      alert(e?.response?.data?.detail || e.message || "Upload failed");
    } finally {
      setSavingFp(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeFloorPlan = async () => {
    if (!confirm("Remove the floor plan image?")) return;
    await apiClient.patch(`/ballrooms/${ballroom.id}/floor-plan`, { backgroundImageUrl: "" });
    setBallroom(b => ({ ...b, backgroundImageUrl: "" }));
  };

  // ─── Canvas settings (snap, grid, opacity, visibility, calibration) ──────
  const updateCanvasSettings = async (patch) => {
    setBallroom(b => ({ ...b, ...patch }));
    try { await apiClient.patch(`/ballrooms/${ballroom.id}/canvas-settings`, patch); }
    catch (e) { console.error(e); }
  };

  const updateRoomDims = async (widthFt, heightFt) => {
    setBallroom(b => ({ ...b, widthFt, heightFt }));
    try { await apiClient.patch(`/ballrooms/${ballroom.id}/canvas-settings`, { widthFt, heightFt }); }
    catch (e) { console.error(e); }
  };

  // Calibration finish
  const finishCalibration = async (knownFt) => {
    if (!calibration.p1 || !calibration.p2 || !knownFt || knownFt <= 0) return;
    const dx = calibration.p2.x - calibration.p1.x;
    const dy = calibration.p2.y - calibration.p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) { alert("Calibration points are too close. Try again."); return; }
    const newPxPerFt = dist / knownFt;
    await updateCanvasSettings({
      pxPerFt: newPxPerFt,
      bgCalibration: {
        p1x: calibration.p1.x, p1y: calibration.p1.y,
        p2x: calibration.p2.x, p2y: calibration.p2.y,
        knownFt,
      },
    });
    setCalibration({ step: "idle", p1: null, p2: null });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const selObj = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === "table")  return { kind: "table",  item: tables.find(t => t.id === selection.id) };
    if (selection.kind === "object") return { kind: "object", item: objects.find(o => o.id === selection.id) };
    if (selection.kind === "room")   return { kind: "room" };
    return null;
  }, [selection, tables, objects]);

  if (!initialBallroom || !ballroom) return null;

  return (
    <div className="fixed inset-0 z-40 bg-stone-900 flex flex-col" data-testid="ballroom-canvas">
      {/* Header / Top toolbar */}
      <div className="bg-stone-800 text-white px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onClose} data-testid="canvas-close" className="hover:bg-stone-700 px-2 py-1 rounded flex items-center gap-1 text-sm"><MoveLeft className="h-4 w-4" />Back</button>
          <h2 className="text-lg font-semibold truncate">{ballroom.name}</h2>
          <span className="text-xs text-stone-400 hidden sm:inline">{ballroom.widthFt}×{ballroom.heightFt}ft · {tables.length} tables · {objects.length} objects</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" onChange={e => uploadFloorPlan(e.target.files?.[0])} className="hidden" data-testid="floor-plan-file" />
              <button onClick={() => fileRef.current?.click()} data-testid="upload-floor-plan" className="hover:bg-stone-700 px-2 py-1 rounded text-xs flex items-center gap-1" title="Upload an image or PDF of the official hotel floor plan">
                <ImageIcon className="h-4 w-4" />{ballroom.backgroundImageUrl ? "Replace plan" : "Upload plan"}
              </button>
              {ballroom.backgroundImageUrl && (
                <>
                  <button onClick={() => updateCanvasSettings({ bgVisible: !ballroom.bgVisible })} className="hover:bg-stone-700 p-1 rounded" title={ballroom.bgVisible ? "Hide plan" : "Show plan"} data-testid="toggle-bg-visible">
                    {ballroom.bgVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button onClick={() => setCalibration({ step: "awaiting-p1", p1: null, p2: null })} className="hover:bg-stone-700 px-2 py-1 rounded text-xs flex items-center gap-1" title="Calibrate scale by drawing a known-length line on the floor plan" data-testid="calibrate-btn">
                    <Ruler className="h-4 w-4" />Calibrate
                  </button>
                  <button onClick={removeFloorPlan} className="hover:bg-stone-700 p-1 rounded text-stone-300 hover:text-red-300" title="Remove plan"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
              <div className="border-l border-stone-600 mx-1 h-6"></div>
              <button onClick={() => updateCanvasSettings({ snapEnabled: !snapOn })} className={`hover:bg-stone-700 px-2 py-1 rounded text-xs flex items-center gap-1 ${snapOn ? "bg-emerald-700 hover:bg-emerald-600" : ""}`} data-testid="toggle-snap" title={`Snap-to-grid is ${snapOn ? "ON" : "OFF"} (grid: ${formatLen(gridSizeIn)})`}>
                <Magnet className="h-4 w-4" />Snap {snapOn ? "on" : "off"}
              </button>
            </>
          )}
          <div className="border-l border-stone-600 mx-1 h-6"></div>
          <button onClick={() => setZoom(z => Math.max(0.3, z * 0.85))} data-testid="zoom-out" className="hover:bg-stone-700 p-1 rounded"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-xs text-stone-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z * 1.15))} data-testid="zoom-in" className="hover:bg-stone-700 p-1 rounded"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 30, y: 30 }); }} data-testid="zoom-fit" className="hover:bg-stone-700 p-1 rounded" title="Reset view"><Maximize2 className="h-4 w-4" /></button>
          <button onClick={() => setShowPanel(s => !s)} className="hover:bg-stone-700 p-1 rounded ml-1" title="Toggle properties panel" data-testid="toggle-panel">
            {showPanel ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ─── Palette ──────────────────────────────────────────────────── */}
        {isAdmin && showPalette && (
          <div className="w-48 bg-stone-100 border-r border-stone-300 overflow-y-auto p-2" data-testid="canvas-palette">
            {PALETTE.map(group => (
              <div key={group.group} className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1 px-1 font-semibold">{group.group}</div>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((p, idx) => {
                    const Icon = p.icon;
                    return (
                      <button key={p.paletteKey || `${p.type}-${idx}`} onClick={() => addFromPalette(p)} data-testid={`palette-${p.paletteKey || p.type}`}
                        className="bg-white border border-stone-300 hover:border-stone-900 hover:bg-stone-50 rounded p-2 text-xs flex flex-col items-center gap-1">
                        <Icon className="h-4 w-4 text-stone-700" />
                        <span className="text-[10px] text-stone-700 leading-tight text-center">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-stone-500 mt-3 px-1">Click an item to drop it at the center of the view; drag to reposition. Click on an object to edit its dimensions in the right panel.</p>
          </div>
        )}
        {!showPalette && isAdmin && (
          <button onClick={() => setShowPalette(true)} className="bg-stone-800 text-white px-2 text-xs h-8 my-1 rounded-r">Show palette</button>
        )}

        {/* ─── Canvas ──────────────────────────────────────────────────── */}
        <div className="flex-1 bg-stone-700 relative overflow-hidden">
          <svg ref={svgRef} className="w-full h-full" onPointerDown={onSvgPointerDown} data-testid="canvas-svg"
               style={{ cursor: panning ? "grabbing" : (calibration.step.startsWith("awaiting") ? "crosshair" : "grab") }}>
            <defs>
              <pattern id="grid-subtle" width={Math.max(2, gridPx)} height={Math.max(2, gridPx)} patternUnits="userSpaceOnUse">
                {/* Grid kept invisible (transparent dot) — snapping still works visually via guides */}
                <circle cx="0" cy="0" r="0.4" fill="rgba(255,255,255,0.04)" />
              </pattern>
            </defs>

            <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
              {/* Background hit area for panning */}
              <rect data-bg="1" x={-3000} y={-3000} width={9000} height={9000} fill="url(#grid-subtle)" />

              {/* Ballroom (primary) area */}
              <g>
                {/* Floor plan image (toggleable, opacity controlled) */}
                {ballroom.backgroundImageUrl && ballroom.bgVisible && (
                  <image
                    href={ballroom.backgroundImageUrl}
                    x={0} y={0} width={canvasW} height={canvasH}
                    opacity={ballroom.bgOpacity ?? 0.55}
                    preserveAspectRatio="xMidYMid meet"
                  />
                )}
                {/* Room boundary with blueprint-style dimension labels on edges */}
                <rect x={0} y={0} width={canvasW} height={canvasH}
                      fill="rgba(255,255,255,0.03)" stroke="#e2e8f0" strokeWidth="2" strokeDasharray="0" />
                <DimensionLabels w={canvasW} h={canvasH} widthFt={ballroom.widthFt} heightFt={ballroom.heightFt} />
              </g>

              {/* Canvas objects (rooms first, then features, doors on top) */}
              {objects.filter(o => o.objectType.startsWith("room_")).map(o => (
                <ObjectRenderer key={`o-${o.id}`} o={o} isAdmin={isAdmin}
                  isSelected={selection?.kind === "object" && selection.id === o.id}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}
              {objects.filter(o => !o.objectType.startsWith("room_") && o.objectType !== "door").map(o => (
                <ObjectRenderer key={`o-${o.id}`} o={o} isAdmin={isAdmin}
                  isSelected={selection?.kind === "object" && selection.id === o.id}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}
              {/* Tables */}
              {tables.map(t => (
                <TableRenderer key={`t-${t.id}`} t={t} isAdmin={isAdmin} pxPerFt={pxPerFt}
                  isSelected={selection?.kind === "table" && selection.id === t.id}
                  onPointerDown={e => onObjectPointerDown(e, "table", t)}
                  onDoubleClick={() => onOpenTable?.(t)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "table", t, h)}
                  onRotateStart={e => onRotatePointerDown(e, "table", t)} />
              ))}
              {/* Doors render on top so the swing arc is always visible */}
              {objects.filter(o => o.objectType === "door").map(o => (
                <ObjectRenderer key={`o-${o.id}`} o={o} isAdmin={isAdmin}
                  isSelected={selection?.kind === "object" && selection.id === o.id}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}

              {/* Calibration overlay */}
              {calibration.p1 && (
                <circle cx={calibration.p1.x} cy={calibration.p1.y} r={5} fill="#fbbf24" stroke="#7c2d12" strokeWidth="2" />
              )}
              {calibration.p2 && (
                <circle cx={calibration.p2.x} cy={calibration.p2.y} r={5} fill="#fbbf24" stroke="#7c2d12" strokeWidth="2" />
              )}
              {calibration.p1 && calibration.p2 && (
                <line x1={calibration.p1.x} y1={calibration.p1.y} x2={calibration.p2.x} y2={calibration.p2.y} stroke="#fbbf24" strokeWidth="3" strokeDasharray="6 4" />
              )}
            </g>
          </svg>

          {/* Help banner */}
          <div className="absolute bottom-3 left-3 bg-stone-800/85 text-white text-xs px-3 py-2 rounded-lg max-w-md backdrop-blur-sm">
            {calibration.step !== "idle" ? (
              <CalibrationHelp step={calibration.step} onFinish={finishCalibration} onCancel={() => setCalibration({ step: "idle", p1: null, p2: null })} />
            ) : isAdmin ? (
              <><strong>Click</strong> an object to select; drag to move · corner handles resize · top handle rotates (Shift = free, otherwise 45° snap) · <strong>Double-click</strong> a table to manage seating</>
            ) : (
              <><strong>Double-click</strong> a table to manage seating · drag the background to pan</>
            )}
          </div>
          {savingFp && <div className="absolute top-3 right-3 bg-emerald-700 text-white text-sm px-3 py-1 rounded flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Saving plan…</div>}
        </div>

        {/* ─── Side Panel ──────────────────────────────────────────────── */}
        {showPanel && isAdmin && (
          <SidePanel
            ballroom={ballroom}
            selObj={selObj}
            onUpdateBallroom={updateCanvasSettings}
            onUpdateRoomDims={updateRoomDims}
            onUpdateTable={async (id, patch) => {
              setTables(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
              try { await apiClient.patch(`/tables/${id}`, patch); } catch (e) { console.error(e); }
            }}
            onUpdateObject={async (id, patch) => {
              setObjects(os => os.map(o => o.id === id ? { ...o, ...patch } : o));
              try { await apiClient.patch(`/canvas-objects/${id}`, patch); } catch (e) { console.error(e); }
            }}
            onRemove={async (kind, id) => {
              if (kind === "object") return removeObject(id);
              if (kind === "table") {
                if (!confirm("Remove this table? Guests assigned to it will be unassigned in the UI.")) return;
                try { await apiClient.delete(`/tables/${id}`); await load(); setSelection(null); }
                catch (e) { alert(e?.response?.data?.detail || "Cannot remove table"); }
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DimensionLabels({ w, h, widthFt, heightFt }) {
  // Blueprint-style labels on each edge (always visible, regardless of zoom/pan).
  return (
    <g pointerEvents="none">
      {/* top edge */}
      <line x1={2}  y1={-20} x2={w / 2 - 30} y2={-20} stroke="#fde68a" strokeWidth="1" />
      <line x1={w / 2 + 30} y1={-20} x2={w - 2} y2={-20} stroke="#fde68a" strokeWidth="1" />
      <line x1={0}   y1={-22} x2={0}   y2={-18} stroke="#fde68a" strokeWidth="1.5" />
      <line x1={w}   y1={-22} x2={w}   y2={-18} stroke="#fde68a" strokeWidth="1.5" />
      <text x={w / 2} y={-16} fontSize="14" fill="#fde68a" textAnchor="middle" className="select-none font-semibold tracking-wide">
        {formatLen((widthFt || 0) * 12)}
      </text>
      {/* right edge */}
      <g transform={`rotate(90, ${w + 22}, ${h / 2})`}>
        <line x1={w + 22 - h / 2 + 2}    y1={h / 2} x2={w + 22 - 30} y2={h / 2} stroke="#fde68a" strokeWidth="1" />
        <line x1={w + 22 + 30} y1={h / 2} x2={w + 22 + h / 2 - 2}    y2={h / 2} stroke="#fde68a" strokeWidth="1" />
        <line x1={w + 22 - h / 2}        y1={h / 2 - 2} x2={w + 22 - h / 2}        y2={h / 2 + 2} stroke="#fde68a" strokeWidth="1.5" />
        <line x1={w + 22 + h / 2}        y1={h / 2 - 2} x2={w + 22 + h / 2}        y2={h / 2 + 2} stroke="#fde68a" strokeWidth="1.5" />
        <text x={w + 22} y={h / 2 + 5} fontSize="14" fill="#fde68a" textAnchor="middle" className="select-none font-semibold tracking-wide">
          {formatLen((heightFt || 0) * 12)}
        </text>
      </g>
    </g>
  );
}

function TableRenderer({ t, pxPerFt, isAdmin, isSelected, onPointerDown, onDoubleClick, onResizeStart, onRotateStart }) {
  const dims = tablePxDims(t, pxPerFt);
  const fill = TABLE_COLOR_FILL[t.color] || TABLE_COLOR_FILL.gray;
  const stroke = TABLE_COLOR_STROKE[t.color] || TABLE_COLOR_STROKE.gray;
  const chairs = chairsForTable(t, dims);
  const x = t.canvasX || 0, y = t.canvasY || 0;
  const rot = t.rotation || 0;
  const dimsLabel = dims.isRound
    ? `${Math.round(t.widthIn)}in round`
    : `${formatLen(t.widthIn)} × ${formatLen(t.lengthIn)}`;

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rot} ${dims.w / 2} ${dims.h / 2})`} data-testid={`canvas-table-${t.id}`} className="cursor-pointer">
      {/* chairs (drawn first so the table sits on top) */}
      {chairs.map((c, i) => (
        <circle key={`ch-${i}`} cx={c.cx} cy={c.cy} r={c.r} fill="#f5f5f4" stroke="#78716c" strokeWidth="1" pointerEvents="none" />
      ))}
      {/* table body */}
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        {dims.isRound ? (
          <circle cx={dims.w / 2} cy={dims.h / 2} r={dims.radius} fill={fill} stroke={stroke} strokeWidth="2.5" />
        ) : (
          <rect width={dims.w} height={dims.h} fill={fill} stroke={stroke} strokeWidth="2.5" rx="4" />
        )}
        <text x={dims.w / 2} y={dims.h / 2 - 4} fill="#1c1917" fontSize="14" fontWeight="700" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">{t.tableNumber}</text>
        <text x={dims.w / 2} y={dims.h / 2 + 10} fill="#44403c" fontSize="9" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">{t.seatsTaken}/{t.maxCapacity}</text>
        <title>{t.label || `Table ${t.tableNumber}`} — {t.seatsTaken}/{t.maxCapacity} · {dimsLabel} · Double-click to open</title>
      </g>
      {/* dimension label below table */}
      <text x={dims.w / 2} y={dims.h + 14} fill="#fde68a" fontSize="10" textAnchor="middle" className="select-none pointer-events-none font-mono">{dimsLabel}</text>
      {/* selection + handles */}
      {isAdmin && isSelected && (
        <SelectionHandles w={dims.w} h={dims.h} onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
      )}
    </g>
  );
}

function ObjectRenderer({ o, pxPerFt, isAdmin, isSelected, onPointerDown, onResizeStart, onRotateStart, onRemove }) {
  const style = OBJ_STYLE[o.objectType] || OBJ_STYLE.blocker;
  const rot = o.rotation || 0;
  const labelText = o.label || style.label || o.objectType.replace(/_/g, " ").toUpperCase();
  const isDoor = o.objectType === "door";
  const isRoom = o.objectType.startsWith("room_");

  // Body
  let body = null;
  if (isDoor) {
    const props = o.properties || {};
    const isDouble = !!props.isDouble;
    const swing = props.swingDirection === "left" ? "left" : "right"; // default right
    body = <DoorBody w={o.width} h={o.height} isDouble={isDouble} swing={swing} />;
  } else {
    body = (
      <rect width={o.width} height={o.height}
            fill={style.fill} stroke={style.stroke} strokeWidth={isRoom ? 2.5 : 1.5}
            strokeDasharray={style.dashed ? "8 4" : "0"} rx={isRoom ? 0 : 3} />
    );
  }

  // Dimensions label
  const dimsLabel = `${formatLen(pxToIn(o.width, pxPerFt))} × ${formatLen(pxToIn(o.height, pxPerFt))}`;

  return (
    <g transform={`translate(${o.x}, ${o.y}) rotate(${rot} ${o.width / 2} ${o.height / 2})`}
       data-testid={`canvas-obj-${o.id}`} className={isAdmin ? "cursor-move" : ""}>
      <g onPointerDown={onPointerDown}>
        {body}
        {labelText && !isDoor && (
          <text x={o.width / 2} y={o.height / 2} fill={style.stroke} fontSize={isRoom ? 14 : 11} textAnchor="middle" dominantBaseline="middle"
                className="select-none pointer-events-none uppercase tracking-wider font-medium">
            {labelText}
          </text>
        )}
        <title>{labelText} — {dimsLabel}</title>
      </g>
      {/* dimension label under the object */}
      {!isDoor && (
        <text x={o.width / 2} y={o.height + 12} fill="#fde68a" fontSize="9" textAnchor="middle" className="select-none pointer-events-none font-mono">{dimsLabel}</text>
      )}
      {isAdmin && isSelected && (
        <>
          <SelectionHandles w={o.width} h={o.height} onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
          <g onPointerDown={e => { e.stopPropagation(); onRemove?.(); }} className="cursor-pointer">
            <circle cx={o.width - 6} cy={6} r={9} fill="white" stroke="#dc2626" strokeWidth="1.5" />
            <text x={o.width - 6} y={6} fontSize="12" textAnchor="middle" dominantBaseline="central" fill="#dc2626" className="select-none">×</text>
          </g>
        </>
      )}
    </g>
  );
}

function DoorBody({ w, h, isDouble, swing }) {
  // Door drawn along the X axis (width), hinged at one or both ends.
  // - Single door: hinge at left, arc from (0,0) sweeping to (w,0) inward
  // - Double door: two halves, mirrored
  // Swing direction (left/right) flips which way the arc curves vertically.
  // The "wall" the door sits on is the top edge (y=0); the swing arcs into the room (y>0) by default.
  const swingDown = swing !== "left"; // default: door swings "right" → arc down into room
  const arcY = swingDown ? h * 8 : -h * 8; // big radius for visual; clipped naturally
  const wallStroke = "#0f172a", arcStroke = "#475569";

  if (!isDouble) {
    const r = w; // door slab length acts as arc radius
    const endY = swingDown ? r : -r;
    return (
      <g>
        {/* wall slot */}
        <line x1={0} y1={0} x2={w} y2={0} stroke={wallStroke} strokeWidth="3" />
        {/* door slab (the open leaf) — rendered as a line at swing angle */}
        <line x1={0} y1={0} x2={w} y2={0} stroke={wallStroke} strokeWidth="2"
              transform={`rotate(${swingDown ? 30 : -30} 0 0)`} />
        {/* swing arc */}
        <path d={`M ${w} 0 A ${r} ${r} 0 0 ${swingDown ? 1 : 0} ${0} ${endY}`}
              fill="none" stroke={arcStroke} strokeWidth="1.5" strokeDasharray="3 3" />
      </g>
    );
  }
  // Double door: two leaves of half-width, both hinged at the outside ends.
  const hw = w / 2;
  const r = hw;
  return (
    <g>
      <line x1={0} y1={0} x2={w} y2={0} stroke={wallStroke} strokeWidth="3" />
      {/* left leaf hinged at x=0 */}
      <line x1={0} y1={0} x2={hw} y2={0} stroke={wallStroke} strokeWidth="2"
            transform={`rotate(${swingDown ? 30 : -30} 0 0)`} />
      <path d={`M ${hw} 0 A ${r} ${r} 0 0 ${swingDown ? 1 : 0} 0 ${swingDown ? r : -r}`}
            fill="none" stroke={arcStroke} strokeWidth="1.5" strokeDasharray="3 3" />
      {/* right leaf hinged at x=w */}
      <line x1={w} y1={0} x2={hw} y2={0} stroke={wallStroke} strokeWidth="2"
            transform={`rotate(${swingDown ? -30 : 30} ${w} 0)`} />
      <path d={`M ${hw} 0 A ${r} ${r} 0 0 ${swingDown ? 0 : 1} ${w} ${swingDown ? r : -r}`}
            fill="none" stroke={arcStroke} strokeWidth="1.5" strokeDasharray="3 3" />
    </g>
  );
}

function SelectionHandles({ w, h, onResizeStart, onRotateStart }) {
  const handle = (x, y, key, cursor) => (
    <rect key={key} x={x - 5} y={y - 5} width={10} height={10}
          fill="#fbbf24" stroke="#1f2937" strokeWidth="1"
          style={{ cursor }}
          onPointerDown={e => onResizeStart(e, key)} />
  );
  return (
    <g pointerEvents="auto">
      {/* outline */}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="4 3" pointerEvents="none" />
      {/* corner handles */}
      {handle(0, 0,   "tl", "nwse-resize")}
      {handle(w, 0,   "tr", "nesw-resize")}
      {handle(0, h,   "bl", "nesw-resize")}
      {handle(w, h,   "br", "nwse-resize")}
      {/* rotation handle */}
      <line x1={w / 2} y1={0} x2={w / 2} y2={-24} stroke="#fbbf24" strokeWidth="1.5" pointerEvents="none" />
      <circle cx={w / 2} cy={-28} r={7} fill="#fbbf24" stroke="#1f2937" strokeWidth="1.5"
              style={{ cursor: "alias" }} onPointerDown={onRotateStart} data-testid="rotate-handle">
        <title>Drag to rotate (Shift = free; otherwise snaps to 45°)</title>
      </circle>
    </g>
  );
}

function CalibrationHelp({ step, onFinish, onCancel }) {
  const [val, setVal] = useState("");
  if (step === "awaiting-p1") return <span>Click the <strong>first point</strong> of a known measurement on the floor plan… (<button onClick={onCancel} className="underline">cancel</button>)</span>;
  if (step === "awaiting-p2") return <span>Click the <strong>second point</strong> to complete the line… (<button onClick={onCancel} className="underline">cancel</button>)</span>;
  if (step === "awaiting-distance") return (
    <span className="flex items-center gap-2">
      This line equals
      <input className="text-stone-900 px-2 py-0.5 rounded w-20" value={val} onChange={e => setVal(e.target.value)} placeholder="ft" type="number" step="0.1" autoFocus data-testid="calibration-distance" />
      ft
      <button onClick={() => onFinish(parseFloat(val))} className="bg-emerald-600 hover:bg-emerald-500 px-2 py-0.5 rounded text-xs" data-testid="calibration-apply">Apply</button>
      <button onClick={onCancel} className="underline">cancel</button>
    </span>
  );
  return null;
}

// ─── Side Panel ──────────────────────────────────────────────────────────────
function SidePanel({ ballroom, selObj, onUpdateBallroom, onUpdateRoomDims, onUpdateTable, onUpdateObject, onRemove }) {
  return (
    <div className="w-72 bg-stone-50 border-l border-stone-300 overflow-y-auto p-3 text-sm" data-testid="side-panel">
      <div className="font-semibold text-stone-800 mb-2 flex items-center gap-2"><Settings2 className="h-4 w-4" />Properties</div>

      {/* Room (ballroom) section — always visible */}
      <details className="mb-3 border border-stone-200 rounded" open>
        <summary className="px-2 py-1.5 bg-stone-100 cursor-pointer text-xs uppercase tracking-wide text-stone-600">Room dimensions</summary>
        <div className="p-2 space-y-2">
          <NumField label="Width (ft)" value={ballroom.widthFt || 0} onCommit={v => onUpdateRoomDims(v, ballroom.heightFt || 60)} dataTestId="room-width-ft" />
          <NumField label="Height (ft)" value={ballroom.heightFt || 0} onCommit={v => onUpdateRoomDims(ballroom.widthFt || 80, v)} dataTestId="room-height-ft" />
          <NumField label="Pixels per ft (scale)" value={ballroom.pxPerFt || 12} onCommit={v => onUpdateBallroom({ pxPerFt: Math.max(1, v) })} step="0.1" />
        </div>
      </details>

      {/* Snap & grid */}
      <details className="mb-3 border border-stone-200 rounded" open>
        <summary className="px-2 py-1.5 bg-stone-100 cursor-pointer text-xs uppercase tracking-wide text-stone-600">Grid &amp; snap</summary>
        <div className="p-2 space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={ballroom.snapEnabled !== false} onChange={e => onUpdateBallroom({ snapEnabled: e.target.checked })} data-testid="panel-snap-toggle" />
            Snap to grid
          </label>
          <NumField label="Grid (inches)" value={ballroom.gridSizeIn || 6} onCommit={v => onUpdateBallroom({ gridSizeIn: Math.max(0.5, v) })} step="0.5" dataTestId="grid-size" />
        </div>
      </details>

      {/* Floor plan */}
      {ballroom.backgroundImageUrl && (
        <details className="mb-3 border border-stone-200 rounded" open>
          <summary className="px-2 py-1.5 bg-stone-100 cursor-pointer text-xs uppercase tracking-wide text-stone-600">Floor plan</summary>
          <div className="p-2 space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={ballroom.bgVisible !== false} onChange={e => onUpdateBallroom({ bgVisible: e.target.checked })} />
              Visible
            </label>
            <label className="block text-xs">
              Opacity ({Math.round((ballroom.bgOpacity ?? 0.55) * 100)}%)
              <input type="range" min="0" max="1" step="0.05" value={ballroom.bgOpacity ?? 0.55}
                     onChange={e => onUpdateBallroom({ bgOpacity: parseFloat(e.target.value) })}
                     className="w-full" data-testid="bg-opacity-slider" />
            </label>
          </div>
        </details>
      )}

      {/* Selection */}
      {selObj?.kind === "table" && selObj.item && (
        <TablePanel t={selObj.item} onChange={p => onUpdateTable(selObj.item.id, p)} onRemove={() => onRemove("table", selObj.item.id)} />
      )}
      {selObj?.kind === "object" && selObj.item && (
        <ObjectPanel o={selObj.item} onChange={p => onUpdateObject(selObj.item.id, p)} onRemove={() => onRemove("object", selObj.item.id)} pxPerFt={ballroom.pxPerFt || 12} />
      )}
      {!selObj && <p className="text-xs text-stone-500 mt-3">Select a table or object to edit its dimensions and properties.</p>}
    </div>
  );
}

function TablePanel({ t, onChange, onRemove }) {
  return (
    <div className="border border-stone-200 rounded mb-3">
      <div className="px-2 py-1.5 bg-amber-100 text-xs uppercase tracking-wide text-amber-800 font-semibold flex items-center justify-between">
        <span>Table {t.tableNumber}</span>
        <button onClick={onRemove} className="text-red-600 hover:text-red-700" title="Remove table"><Trash2 className="h-3 w-3" /></button>
      </div>
      <div className="p-2 space-y-2">
        <label className="block text-xs">Label
          <input className="w-full border border-stone-300 rounded px-1 py-0.5" value={t.label || ""} onChange={e => onChange({ label: e.target.value })} />
        </label>
        <label className="block text-xs">Shape
          <select className="w-full border border-stone-300 rounded px-1 py-0.5" value={t.shape} onChange={e => onChange({ shape: e.target.value })}>
            <option value="round">Round</option>
            <option value="rectangular">Rectangular</option>
            <option value="square">Square</option>
          </select>
        </label>
        <NumField label={t.shape === "round" ? "Diameter (in)" : "Width (in)"} value={t.widthIn || 60}
                  onCommit={v => onChange({ widthIn: Math.max(6, v), ...(t.shape === "square" ? { lengthIn: Math.max(6, v) } : {}) })} dataTestId="table-width-in" />
        {t.shape === "rectangular" && (
          <NumField label="Length (in)" value={t.lengthIn || 30} onCommit={v => onChange({ lengthIn: Math.max(6, v) })} dataTestId="table-length-in" />
        )}
        <NumField label="Capacity (chairs)" value={t.maxCapacity || 10} onCommit={v => onChange({ maxCapacity: Math.max(1, Math.round(v)) })} step="1" dataTestId="table-capacity" />
        <NumField label="Rotation (°)" value={t.rotation || 0} onCommit={v => onChange({ rotation: v })} step="1" />
      </div>
    </div>
  );
}

function ObjectPanel({ o, onChange, onRemove, pxPerFt }) {
  const isDoor = o.objectType === "door";
  const props = o.properties || {};
  return (
    <div className="border border-stone-200 rounded mb-3">
      <div className="px-2 py-1.5 bg-amber-100 text-xs uppercase tracking-wide text-amber-800 font-semibold flex items-center justify-between">
        <span>{o.objectType.replace(/_/g, " ")}</span>
        <button onClick={onRemove} className="text-red-600 hover:text-red-700" title="Remove"><Trash2 className="h-3 w-3" /></button>
      </div>
      <div className="p-2 space-y-2">
        <label className="block text-xs">Label
          <input className="w-full border border-stone-300 rounded px-1 py-0.5" value={o.label || ""} onChange={e => onChange({ label: e.target.value })} />
        </label>
        <NumField label="Width (in)" value={Math.round(pxToIn(o.width, pxPerFt))} onCommit={v => onChange({ width: inToPx(Math.max(2, v), pxPerFt) })} dataTestId="obj-width-in" />
        <NumField label="Length (in)" value={Math.round(pxToIn(o.height, pxPerFt))} onCommit={v => onChange({ height: inToPx(Math.max(2, v), pxPerFt) })} dataTestId="obj-length-in" />
        <NumField label="Rotation (°)" value={o.rotation || 0} onCommit={v => onChange({ rotation: v })} step="1" />
        {isDoor && (
          <>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!props.isDouble} onChange={e => onChange({ properties: { ...props, isDouble: e.target.checked } })} data-testid="door-double-toggle" />
              Double door
            </label>
            <label className="block text-xs">Swing direction
              <select className="w-full border border-stone-300 rounded px-1 py-0.5"
                      value={props.swingDirection || "right"}
                      onChange={e => onChange({ properties: { ...props, swingDirection: e.target.value } })}
                      data-testid="door-swing-direction">
                <option value="right">Opens to the right</option>
                <option value="left">Opens to the left</option>
              </select>
            </label>
            <label className="block text-xs">Hinge side
              <select className="w-full border border-stone-300 rounded px-1 py-0.5"
                      value={props.hingeSide || "left"}
                      onChange={e => onChange({ properties: { ...props, hingeSide: e.target.value } })}>
                <option value="left">Left hinged</option>
                <option value="right">Right hinged</option>
                <option value="both">Both (double)</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

function NumField(props) {
  // Reset local draft when the upstream `value` changes by remounting via key.
  return <NumFieldInner key={String(props.value)} {...props} />;
}

function NumFieldInner({ label, value, onCommit, step = "0.1", dataTestId }) {
  const [local, setLocal] = useState(String(value));
  const commit = () => {
    const v = parseFloat(local);
    if (Number.isFinite(v) && v !== value) onCommit(v);
    else setLocal(String(value));
  };
  return (
    <label className="block text-xs">{label}
      <input
        type="number"
        step={step}
        className="w-full border border-stone-300 rounded px-1 py-0.5"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } }}
        data-testid={dataTestId}
      />
    </label>
  );
}

// ─── Utility functions ───────────────────────────────────────────────────────
function snapDoorToWall(obj, canvasW, canvasH) {
  // Snap door's anchor (x,y) to nearest wall edge of the primary ballroom.
  // Door is drawn along its width on the top edge (y=0).
  // We translate so the door's center sits on the wall, then rotate so it lies along it.
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;
  const dists = {
    top:    cy,
    bottom: canvasH - cy,
    left:   cx,
    right:  canvasW - cx,
  };
  const nearest = Object.entries(dists).sort((a, b) => a[1] - b[1])[0][0];
  let x = obj.x, y = obj.y, rotation = 0;
  switch (nearest) {
    case "top":
      x = cx - obj.width / 2;
      y = 0 - obj.height / 2;
      rotation = 0;
      break;
    case "bottom":
      x = cx - obj.width / 2;
      y = canvasH - obj.height / 2;
      rotation = 180;
      break;
    case "left":
      x = 0 - obj.width / 2;
      y = cy - obj.height / 2;
      rotation = 90;
      break;
    case "right":
      x = canvasW - obj.width / 2;
      y = cy - obj.height / 2;
      rotation = 270;
      break;
    default: break;
  }
  return { x, y, rotation };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function pdfFirstPageToDataUrl(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}
