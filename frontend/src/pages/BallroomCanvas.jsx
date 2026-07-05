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
  ArrowLeftRight, Settings2, ChevronRight, ChevronLeft, Minus, Type,
  AlertTriangle, Users, Undo2, Redo2, Printer, X as XIcon,
} from "lucide-react";

// Bundler-friendly PDF.js worker — served from CDN at the version we depend on.
// (Avoids needing to copy pdf.worker into /public.)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// ─── Constants ────────────────────────────────────────────────────────────────
const TABLE_COLOR_FILL = { gray: "#e7e5e4", blue: "#bfdbfe", yellow: "#fde68a", green: "#a7f3d0", red: "#fecaca" };
const TABLE_COLOR_STROKE = { gray: "#a8a29e", blue: "#3b82f6", yellow: "#d97706", green: "#10b981", red: "#b91c1c" };
const CHAIR_OCCUPIED_FILL = "#22c55e";   // green = assigned
const CHAIR_OCCUPIED_STROKE = "#15803d";
const CHAIR_EMPTY_FILL = "#d6d3d1";       // gray = unassigned / extra
const CHAIR_EMPTY_STROKE = "#78716c";

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
    { type: "line",         label: "Divider Line", icon: Minus,     widthIn: 120, lengthIn: 6, isLine: true },
    { type: "text",         label: "Text Label",   icon: Type,      widthIn: 96,  lengthIn: 24, isText: true },
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
  line:            { fill: "transparent",            stroke: "#0f172a", dashed: false, label: "" },
  text:            { fill: "rgba(254, 240, 138, 0.45)", stroke: "#a16207", dashed: true,  label: "" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inToPx  = (inches, pxPerFt) => (inches / 12) * pxPerFt;
const pxToIn  = (px,     pxPerFt) => (px * 12) / pxPerFt;
const pxToFt  = (px,     pxPerFt) => px / pxPerFt;

function snapVal(v, gridPx, on) {
  if (!on || !gridPx || gridPx <= 0) return v;
  return Math.round(v / gridPx) * gridPx;
}

const GUIDE_THRESHOLD_PX = 6;

function guidePointsForBounds(b) {
  return {
    x: [
      { key: "left", value: b.x },
      { key: "center", value: b.x + b.w / 2 },
      { key: "right", value: b.x + b.w },
    ],
    y: [
      { key: "top", value: b.y },
      { key: "middle", value: b.y + b.h / 2 },
      { key: "bottom", value: b.y + b.h },
    ],
  };
}

function boundsUnion(bounds) {
  if (!bounds.length) return null;
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w));
  const maxY = Math.max(...bounds.map(b => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function computeAlignment(activeBounds, targetBounds, canvasW, canvasH) {
  const targets = [
    { x: 0, y: 0, w: canvasW, h: canvasH },
    ...targetBounds,
  ];
  const active = guidePointsForBounds(activeBounds);
  let bestX = null;
  let bestY = null;

  for (const target of targets) {
    const tp = guidePointsForBounds(target);
    for (const a of active.x) {
      for (const t of tp.x) {
        const delta = t.value - a.value;
        if (Math.abs(delta) <= GUIDE_THRESHOLD_PX && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, value: t.value };
        }
      }
    }
    for (const a of active.y) {
      for (const t of tp.y) {
        const delta = t.value - a.value;
        if (Math.abs(delta) <= GUIDE_THRESHOLD_PX && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, value: t.value };
        }
      }
    }
  }

  const guides = [];
  if (bestX) guides.push({ axis: "x", value: bestX.value });
  if (bestY) guides.push({ axis: "y", value: bestY.value });
  return { dx: bestX?.delta || 0, dy: bestY?.delta || 0, guides };
}

// True when the event target is a form input — avoid hijacking the space key.
function isTypingTarget(el) {
  if (!el) return false;
  const t = (el.tagName || "").toLowerCase();
  return t === "input" || t === "textarea" || t === "select" || el.isContentEditable;
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
  const seatedCount = Math.max(0, t.seatsTaken || 0);
  const mark = (i, c) => ({ ...c, occupied: i < seatedCount });
  if (dims.isRound) {
    const cx = dims.w / 2, cy = dims.h / 2;
    const r = dims.radius + chairR + gap;
    for (let i = 0; i < N; i++) {
      const a = (2 * Math.PI * i) / N - Math.PI / 2;
      out.push(mark(i, { cx: cx + r * Math.cos(a), cy: cy + r * Math.sin(a), r: chairR }));
    }
  } else {
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
      out.push(mark(i, { cx, cy, r: chairR }));
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
  const [tableTypes, setTableTypes] = useState([]);  // inventory from /api/table-types

  // Interaction state
  const [drag,    setDrag]    = useState(null); // {kind:'table'|'object', id, dx, dy, current:{x,y}}
  const [resize,  setResize]  = useState(null); // {kind, id, handle:'br'|'tr'|'bl'|'tl', startW, startH, startX, startY, sx, sy}
  const [rotate,  setRotate]  = useState(null); // {kind, id, cx, cy, startAngle, baseRotation, freeMode}
  const [panning, setPanning] = useState(null);
  const [alignmentGuides, setAlignmentGuides] = useState([]);
  const [zoom, setZoom] = useState(1);
  const [pan,  setPan]  = useState({ x: 30, y: 30 });

  // UI state
  const [selection, setSelection] = useState(null); // {kind, id} | {kind:'room'}
  const [selectionSet, setSelectionSet] = useState([]); // [{kind, id}, ...] for multi-select
  const [conflicts, setConflicts] = useState({});       // { [tableId]: [conflict, ...] }
  const [historyStack, setHistoryStack] = useState({ undoAvailable: 0, redoAvailable: 0 });
  const [showGuestPanel, setShowGuestPanel] = useState(false);
  const [showPalette, setShowPalette] = useState(typeof window !== "undefined" && window.innerWidth >= 640);
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

  const getBounds = useCallback((kind, item) => {
    if (!item) return null;
    if (kind === "table") {
      const dims = tablePxDims(item, pxPerFt);
      return { x: item.canvasX || 0, y: item.canvasY || 0, w: dims.w, h: dims.h };
    }
    return { x: item.x || 0, y: item.y || 0, w: item.width || 0, h: item.height || 0 };
  }, [pxPerFt]);

  const allItemBounds = useMemo(() => [
    ...tables.map(t => ({ kind: "table", id: t.id, bounds: getBounds("table", t) })),
    ...objects.map(o => ({ kind: "object", id: o.id, bounds: getBounds("object", o) })),
  ], [tables, objects, getBounds]);

  const alignmentTargets = useCallback((exclude = []) => {
    const skipped = new Set(exclude.map(s => `${s.kind}:${s.id}`));
    return allItemBounds
      .filter(x => x.bounds && !skipped.has(`${x.kind}:${x.id}`))
      .map(x => x.bounds);
  }, [allItemBounds]);

  // group capacity map: sum capacities for tables sharing a group_id (combined tables)
  const groupCap = useMemo(() => {
    const m = {};
    for (const t of tables) {
      if (!t.groupId) continue;
      m[t.groupId] = (m[t.groupId] || 0) + (t.maxCapacity || 0);
    }
    return m;
  }, [tables]);

  // Dynamic Tables palette built from /api/table-types (admin-managed inventory).
  // Other groups (doors / rooms / features) stay static.
  const palette = useMemo(() => {
    const tablesGroup = {
      group: "Tables (inventory)",
      items: tableTypes.length === 0
        ? [{ disabled: true, label: "No table types yet — add in Table Inventory tab", isPlaceholder: true }]
        : tableTypes.map(tt => ({
            paletteKey: `tt-${tt.id}`,
            label: tt.name,
            icon: tt.shape === "round" ? Circle : (tt.shape === "square" ? Square : RectangleHorizontal),
            widthIn: tt.widthIn, lengthIn: tt.lengthIn,
            isTable: true,
            shape: tt.shape,
            typeId: tt.id,
            defaultSeats: tt.defaultSeats,
          })),
    };
    return [tablesGroup, ...PALETTE.filter(g => g.group !== "Tables")];
  }, [tableTypes]);

  // ─── Load ────────────────────────────────────────────────────────────────
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    if (!initialBallroom) return;
    let cancelled = false;
    (async () => {
      const [t, o, b, tt] = await Promise.all([
        apiClient.get(`/tables?ballroomId=${initialBallroom.id}`),
        apiClient.get(`/ballrooms/${initialBallroom.id}/canvas-objects`),
        apiClient.get(`/ballrooms`),
        apiClient.get(`/table-types`),
      ]);
      if (cancelled) return;
      setTables(t.data);
      setObjects(o.data);
      setTableTypes((tt.data || []).filter(x => x.isActive));
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
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click → toggle in multi-select set
      setSelectionSet((prev) => {
        const exists = prev.some(s => s.kind === kind && s.id === item.id);
        if (exists) return prev.filter(s => !(s.kind === kind && s.id === item.id));
        // include the previously-primary selection so multi-select feels natural
        const merged = [...prev];
        if (selection && !prev.some(s => s.kind === selection.kind && s.id === selection.id))
          merged.push({ kind: selection.kind, id: selection.id });
        merged.push({ kind, id: item.id });
        return merged;
      });
      setSelection({ kind, id: item.id });
      return;
    }
    const isInMultiSelection = selectionSet.length > 1 && selectionSet.some(s => s.kind === kind && s.id === item.id);
    if (!isInMultiSelection) setSelectionSet([]);
    setSelection({ kind, id: item.id });
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const ix = item.canvasX ?? item.x ?? 0;
    const iy = item.canvasY ?? item.y ?? 0;
    const dragItems = isInMultiSelection
      ? selectionSet.map(s => {
          const source = s.kind === "table" ? tables.find(t => t.id === s.id) : objects.find(o => o.id === s.id);
          return source ? { ...s, startX: source.canvasX ?? source.x ?? 0, startY: source.canvasY ?? source.y ?? 0 } : null;
        }).filter(Boolean)
      : [{ kind, id: item.id, startX: ix, startY: iy }];
    const activeBounds = boundsUnion(dragItems.map(s => {
      const source = s.kind === "table" ? tables.find(t => t.id === s.id) : objects.find(o => o.id === s.id);
      return getBounds(s.kind, source);
    }).filter(Boolean));
    setDrag({
      kind, id: item.id, dx: x - ix, dy: y - iy, current: { x: ix, y: iy },
      items: dragItems, activeBounds,
    });
  };

  // Space-bar held = "hand tool" — drag anywhere to pan, even over objects.
  const [spaceHeld, setSpaceHeld] = useState(false);
  useEffect(() => {
    const dn = (e) => { if (e.code === "Space" && !e.repeat && !isTypingTarget(e.target)) { e.preventDefault(); setSpaceHeld(true); } };
    const up = (e) => { if (e.code === "Space") setSpaceHeld(false); };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);

  // Refresh history availability + conflicts whenever tables/objects change.
  const refreshHistory = useCallback(async () => {
    try { const r = await apiClient.get("/history/stack"); setHistoryStack(r.data); }
    catch (e) { /* ignore */ }
  }, []);
  const refreshConflicts = useCallback(async () => {
    if (!ballroom?.id) return;
    try {
      const r = await apiClient.get(`/seating/conflicts?ballroomId=${ballroom.id}`);
      setConflicts(r.data.byTableId || {});
    } catch (e) { /* ignore */ }
  }, [ballroom?.id]);
  useEffect(() => { refreshHistory(); refreshConflicts(); }, [tables, objects, refreshHistory, refreshConflicts]);

  const undo = useCallback(async () => {
    try { await apiClient.post("/history/undo"); await load(); }
    catch (e) { /* swallow */ }
  }, [load]);
  const redo = useCallback(async () => {
    try { await apiClient.post("/history/redo"); await load(); }
    catch (e) { /* swallow */ }
  }, [load]);

  const deleteSelection = useCallback(async () => {
    if (!isAdmin) return;
    // multi-select set takes precedence; otherwise the single primary
    const targets = selectionSet.length > 0
      ? selectionSet
      : (selection && selection.kind !== "room" ? [selection] : []);
    if (targets.length === 0) return;
    const ok = window.confirm(`Delete ${targets.length} item(s)?`);
    if (!ok) return;
    for (const s of targets) {
      try {
        if (s.kind === "table") await apiClient.delete(`/tables/${s.id}`);
        else if (s.kind === "object") await apiClient.delete(`/canvas-objects/${s.id}`);
      } catch (err) {
        const msg = err?.response?.data?.detail || "delete failed";
        console.warn("Delete", s, msg);
      }
    }
    setSelection(null); setSelectionSet([]);
    await load();
  }, [isAdmin, selection, selectionSet, load]);

  // Global shortcuts: Delete/Backspace, Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === "Delete" || e.key === "Backspace") && (selection || selectionSet.length)) {
        e.preventDefault();
        deleteSelection();
      } else if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
        e.preventDefault(); undo();
      } else if ((mod && (e.key === "y" || e.key === "Y")) ||
                 (mod && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
        e.preventDefault(); redo();
      } else if (e.key === "Escape") {
        setSelection(null); setSelectionSet([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, selectionSet, deleteSelection, undo, redo]);

  // Middle-button-down or space-bar-down → force pan (capture before objects).
  const onSvgPointerDownCapture = (e) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.stopPropagation(); e.preventDefault();
      setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
    }
  };

  const onSvgPointerDown = (e) => {
    // Calibration takes priority — any click on the canvas captures a calibration point
    // (the calibration overlay rect routes here via the data-bg attribute).
    if (calibration.step === "awaiting-p1" || calibration.step === "awaiting-p2") {
      e.stopPropagation(); e.preventDefault();
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      if (calibration.step === "awaiting-p1") setCalibration({ ...calibration, p1: { x, y }, step: "awaiting-p2" });
      else                                    setCalibration({ ...calibration, p2: { x, y }, step: "awaiting-distance" });
      return;
    }
    // Click on empty canvas → start pan and deselect
    const isBg = e.target === svgRef.current || (e.target.getAttribute && e.target.getAttribute("data-bg") === "1");
    if (!isBg) return;
    setSelection(null);
    setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
  };

  // Mouse wheel: zoom with cursor as the anchor point (so the point under the
  // cursor stays put). Also middle-button drag and space-bar drag pan everywhere.
  const onWheel = (e) => {
    e.preventDefault();
    const r = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.2, Math.min(4, zoom * factor));
    // World coords at cursor must remain constant: W = m/z - p
    const wx = mx / zoom - pan.x;
    const wy = my / zoom - pan.y;
    setZoom(newZoom);
    setPan({ x: mx / newZoom - wx, y: my / newZoom - wy });
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
    const isInMultiSelection = selectionSet.length > 1 && selectionSet.some(s => s.kind === kind && s.id === item.id);
    const rotateItems = isInMultiSelection
      ? selectionSet.map(s => {
          const source = s.kind === "table" ? tables.find(t => t.id === s.id) : objects.find(o => o.id === s.id);
          return source ? { ...s, startRotation: source.rotation || 0 } : null;
        }).filter(Boolean)
      : [{ kind, id: item.id, startRotation: item.rotation || 0 }];
    const activeBounds = boundsUnion(rotateItems.map(s => {
      const source = s.kind === "table" ? tables.find(t => t.id === s.id) : objects.find(o => o.id === s.id);
      return getBounds(s.kind, source);
    }).filter(Boolean));
    const dims = kind === "table" ? tablePxDims(item, pxPerFt) : { w: item.width, h: item.height };
    const cx = isInMultiSelection && activeBounds ? activeBounds.x + activeBounds.w / 2 : (item.canvasX ?? item.x ?? 0) + dims.w / 2;
    const cy = isInMultiSelection && activeBounds ? activeBounds.y + activeBounds.h / 2 : (item.canvasY ?? item.y ?? 0) + dims.h / 2;
    const p = screenToCanvas(e.clientX, e.clientY);
    const startAngle = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI;
    setRotate({ kind, id: item.id, cx, cy, startAngle, baseRotation: item.rotation || 0, freeMode: e.shiftKey, items: rotateItems });
  };

  // ── Global pointer move/up: ensures drag stops even outside canvas (fix for "ghost drag" bug)
  useEffect(() => {
    if (!drag && !resize && !rotate && !panning) return;

    const onMove = (e) => {
      if (drag) {
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        let nx = snapVal(x - drag.dx, gridPx, snapOn);
        let ny = snapVal(y - drag.dy, gridPx, snapOn);
        let groupDx = nx - drag.items[0].startX;
        let groupDy = ny - drag.items[0].startY;
        if (snapOn && drag.activeBounds) {
          const movedBounds = { ...drag.activeBounds, x: drag.activeBounds.x + groupDx, y: drag.activeBounds.y + groupDy };
          const snap = computeAlignment(movedBounds, alignmentTargets(drag.items), canvasW, canvasH);
          groupDx += snap.dx;
          groupDy += snap.dy;
          nx += snap.dx;
          ny += snap.dy;
          setAlignmentGuides(snap.guides);
        } else {
          setAlignmentGuides([]);
        }
        const tableMoves = new Map();
        const objectMoves = new Map();
        for (const s of drag.items) {
          const next = { x: s.startX + groupDx, y: s.startY + groupDy };
          if (s.kind === "table") tableMoves.set(s.id, next);
          else objectMoves.set(s.id, next);
        }
        if (tableMoves.size) {
          setTables(ts => ts.map(t => tableMoves.has(t.id) ? { ...t, canvasX: tableMoves.get(t.id).x, canvasY: tableMoves.get(t.id).y } : t));
        }
        if (objectMoves.size) {
          setObjects(os => os.map(o => objectMoves.has(o.id) ? { ...o, x: objectMoves.get(o.id).x, y: objectMoves.get(o.id).y } : o));
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
        if (snapOn) {
          const snap = computeAlignment(
            { x: nX, y: nY, w: nW, h: nH },
            alignmentTargets([{ kind: resize.kind, id: resize.id }]),
            canvasW,
            canvasH
          );
          if (resize.handle.includes("l")) { nX += snap.dx; nW -= snap.dx; }
          else if (resize.handle.includes("r")) nW += snap.dx;
          else nX += snap.dx;
          if (resize.handle.includes("t")) { nY += snap.dy; nH -= snap.dy; }
          else if (resize.handle.includes("b")) nH += snap.dy;
          else nY += snap.dy;
          nW = Math.max(15, nW);
          nH = Math.max(15, nH);
          setAlignmentGuides(snap.guides);
        } else {
          setAlignmentGuides([]);
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
        const deltaR = nextR - rotate.baseRotation;
        const tableRots = new Map();
        const objectRots = new Map();
        for (const s of rotate.items || [{ kind: rotate.kind, id: rotate.id, startRotation: rotate.baseRotation }]) {
          const next = s.startRotation + deltaR;
          if (s.kind === "table") tableRots.set(s.id, next);
          else objectRots.set(s.id, next);
        }
        if (tableRots.size) setTables(ts => ts.map(t => tableRots.has(t.id) ? { ...t, rotation: tableRots.get(t.id) } : t));
        if (objectRots.size) setObjects(os => os.map(o => objectRots.has(o.id) ? { ...o, rotation: objectRots.get(o.id) } : o));
      } else if (panning) {
        setPan({ x: panning.px + (e.clientX - panning.sx) / zoom, y: panning.py + (e.clientY - panning.sy) / zoom });
      }
    };

    const onUp = async () => {
      try {
        if (drag) {
          for (const item of drag.items) {
            if (item.kind === "table") {
              const t = tables.find(x => x.id === item.id);
              if (t) await apiClient.patch(`/tables/${item.id}`, { canvasX: t.canvasX, canvasY: t.canvasY });
            } else {
              // doors auto-snap to nearest ballroom wall on release
              const obj = objects.find(o => o.id === item.id);
              if (obj && obj.objectType === "door") {
                const snapped = snapDoorToWall(obj, canvasW, canvasH);
                setObjects(os => os.map(o => o.id === item.id ? { ...o, ...snapped } : o));
                await apiClient.patch(`/canvas-objects/${item.id}`, { x: snapped.x, y: snapped.y, rotation: snapped.rotation });
              } else if (obj) {
                await apiClient.patch(`/canvas-objects/${item.id}`, { x: obj.x, y: obj.y });
              }
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
          for (const item of rotate.items || [{ kind: rotate.kind, id: rotate.id }]) {
            if (item.kind === "table") {
              const t = tables.find(x => x.id === item.id);
              if (t) await apiClient.patch(`/tables/${item.id}`, { rotation: t.rotation });
            } else {
              const o = objects.find(x => x.id === item.id);
              if (o) await apiClient.patch(`/canvas-objects/${item.id}`, { rotation: o.rotation });
            }
          }
        }
      } catch (err) { console.error(err); }
      setDrag(null); setResize(null); setRotate(null); setPanning(null); setAlignmentGuides([]);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Bulletproof: any blur / tab switch / Escape also clears stuck drag state.
    const onBlur = () => { setDrag(null); setResize(null); setRotate(null); setPanning(null); setAlignmentGuides([]); };
    const onVis = () => { if (document.hidden) onBlur(); };
    const onEsc = (e) => { if (e.key === "Escape") onBlur(); };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onEsc);
    };
  }, [drag, resize, rotate, panning, snapOn, gridPx, zoom, pxPerFt, canvasW, canvasH, tables, objects, alignmentTargets]);

  // ─── Add from palette at the cursor drop point ───────────────────────────
  const addFromPalette = async (item, dropPoint) => {
    if (!isAdmin) return;
    if (!dropPoint) return;
    const wPx = inToPx(item.widthIn,  pxPerFt);
    const hPx = inToPx(item.lengthIn, pxPerFt);
    const topLeft = { x: snapVal(dropPoint.x - wPx / 2, gridPx, snapOn),
                      y: snapVal(dropPoint.y - hPx / 2, gridPx, snapOn) };
    const center = topLeft;
    if (item.isTable) {
      const next = Math.max(0, ...tables.map(t => t.tableNumber || 0)) + 1;
      try {
        await apiClient.post("/tables", {
          tableNumber: next, label: null, ballroomId: ballroom.id,
          shape: item.shape, maxCapacity: item.defaultSeats || 10,
          canvasX: center.x, canvasY: center.y,
          widthIn: item.widthIn, lengthIn: item.lengthIn,
          typeId: item.typeId || null,
        });
        await load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed to add table"); }
    } else if (item.isDoor) {
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
    } else if (item.isText) {
      try {
        await apiClient.post("/canvas-objects", {
          ballroomId: ballroom.id, objectType: "text", label: "Label",
          x: center.x, y: center.y, width: wPx, height: hPx, rotation: 0,
          properties: { fontSize: 16, textContent: "Label" },
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

  // Edit text-label object (double-click in canvas)
  const editObjectText = async (o) => {
    const cur = (o.properties && o.properties.textContent) || o.label || "";
    const next = window.prompt("Edit text label:", cur);
    if (next === null) return;
    await apiClient.patch(`/canvas-objects/${o.id}`, {
      label: next, properties: { textContent: next },
    });
    await load();
  };

  // Drop a family from the guest panel onto a table (whole family moves)
  const onDropFamilyOnTable = async (tableId, guestId) => {
    try {
      await apiClient.post("/guests/family/move", { guestId, targetTableId: tableId });
      await load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      alert(typeof d === "object" ? d.message : (d || "Failed to seat family"));
    }
  };

  // ─── PDF export: clean floor plan + master seating list ──────────────────
  const exportCanvasPdf = useCallback(async () => {
    try {
      const { default: jsPDF } = await import("jspdf");
      const { toPng } = await import("html-to-image");
      const svgEl = svgRef.current;
      if (!svgEl) return;
      // Render the SVG itself directly to a PNG via toPng on its host node.
      const png = await toPng(svgEl, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = png; });
      const ratio = Math.min((pageW - 40) / img.width, (pageH - 60) / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      pdf.setFontSize(14);
      pdf.text(`${ballroom.name} — Floor Plan`, 20, 28);
      pdf.addImage(png, "PNG", (pageW - w) / 2, 40, w, h);

      // Page 2+: master seating list sorted by guest last name
      const guestsR = await apiClient.get("/guests");
      const guests = guestsR.data;
      const tableById = new Map(tables.map((t) => [t.id, t]));
      const rows = guests
        .map((g) => ({
          name: g.fullName, last: (g.fullName || "").split(" ").slice(-1)[0].toLowerCase(),
          invoice: g.invoiceNumber, party: g.partySize,
          hc: g.highChairCount,
          tableNumber: g.tableId ? tableById.get(g.tableId)?.tableNumber : null,
          family: g.familyId,
        }))
        .sort((a, b) => a.last.localeCompare(b.last));
      pdf.addPage("letter", "portrait");
      pdf.setFontSize(14); pdf.text(`${ballroom.name} — Master Seating List`, 40, 40);
      pdf.setFontSize(10);
      pdf.text("Table", 40, 70);
      pdf.text("Family", 80, 70);
      pdf.text("Invoice", 280, 70);
      pdf.text("Party", 380, 70);
      pdf.text("High Chairs", 420, 70);
      pdf.line(40, 74, 560, 74);
      let yPos = 90;
      const colPage = pdf.internal.pageSize.getHeight() - 50;
      for (const r of rows) {
        if (yPos > colPage) {
          pdf.addPage("letter", "portrait"); yPos = 60;
        }
        pdf.text(String(r.tableNumber ?? "—"), 40, yPos);
        pdf.text((r.name || "").slice(0, 40), 80, yPos);
        pdf.text(String(r.invoice || ""), 280, yPos);
        pdf.text(String(r.party || 0), 380, yPos);
        pdf.text(String(r.hc || 0), 420, yPos);
        yPos += 14;
      }
      pdf.save(`${ballroom.name.replace(/\s+/g, "_")}_seating_plan.pdf`);
    } catch (e) {
      console.error(e);
      alert("PDF export failed: " + (e.message || "unknown error"));
    }
  }, [ballroom, tables]);

  // Listen for the toolbar print button (fired via custom event so we can keep the button stateless)
  useEffect(() => {
    const handler = () => exportCanvasPdf();
    window.addEventListener("canvas-print", handler);
    return () => window.removeEventListener("canvas-print", handler);
  }, [exportCanvasPdf]);

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
      <div className="bg-stone-800 text-white px-2 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button onClick={onClose} data-testid="canvas-close" className="hover:bg-stone-700 px-2 py-1 rounded flex items-center gap-1 text-sm"><MoveLeft className="h-4 w-4" /><span className="hidden sm:inline">Back</span></button>
          <h2 className="text-sm sm:text-lg font-semibold truncate">{ballroom.name}</h2>
          <span className="text-xs text-stone-400 hidden md:inline">{ballroom.widthFt}×{ballroom.heightFt}ft · {tables.length} tables · {objects.length} objects</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap overflow-x-auto no-scrollbar">
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
          <button onClick={undo} disabled={!historyStack.undoAvailable}
            className="hover:bg-stone-700 p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title={`Undo (Ctrl+Z) — ${historyStack.undoAvailable} available`}
            data-testid="canvas-undo"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} disabled={!historyStack.redoAvailable}
            className="hover:bg-stone-700 p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title={`Redo (Ctrl+Y / Ctrl+Shift+Z) — ${historyStack.redoAvailable} available`}
            data-testid="canvas-redo"><Redo2 className="h-4 w-4" /></button>
          <button onClick={deleteSelection}
            disabled={!selection && selectionSet.length === 0}
            className="hover:bg-red-600 p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete selected (Del / Backspace)"
            data-testid="canvas-delete"><Trash2 className="h-4 w-4" /></button>
          <button onClick={() => setShowGuestPanel(s => !s)}
            className={`p-1 rounded ${showGuestPanel ? "bg-amber-600 hover:bg-amber-500" : "hover:bg-stone-700"}`}
            title="Toggle guest list panel"
            data-testid="canvas-toggle-guests"><Users className="h-4 w-4" /></button>
          <button onClick={() => window.dispatchEvent(new CustomEvent('canvas-print'))}
            className="hover:bg-stone-700 p-1 rounded"
            title="Export canvas to PDF"
            data-testid="canvas-print"><Printer className="h-4 w-4" /></button>
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
          <div className="absolute inset-y-0 left-0 z-20 sm:relative sm:inset-auto w-56 sm:w-48 max-w-[80vw] bg-stone-100 border-r border-stone-300 overflow-y-auto p-2 shadow-lg sm:shadow-none" data-testid="canvas-palette">
            <div className="flex sm:hidden items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-stone-700">Palette</span>
              <button onClick={() => setShowPalette(false)} className="p-1 rounded hover:bg-stone-200" data-testid="palette-close-mobile">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {palette.map(group => (
              <div key={group.group} className="mb-3">
                <div className="text-[10px] uppercase tracking-wide text-stone-500 mb-1 px-1 font-semibold">{group.group}</div>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((p, idx) => {
                    if (p.isPlaceholder) {
                      return (
                        <div key={`ph-${idx}`} className="col-span-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2" data-testid="palette-empty-tables">
                          {p.label}
                        </div>
                      );
                    }
                    const Icon = p.icon;
                    return (
                      <button key={p.paletteKey || `${p.type}-${idx}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("application/json", JSON.stringify(p));
                        }}
                        data-testid={`palette-${p.paletteKey || p.type}`}
                        title={`${p.label} — drag onto the canvas and release where it should go`}
                        className="bg-white border border-stone-300 hover:border-stone-900 hover:bg-stone-50 rounded p-2 text-xs flex flex-col items-center gap-1 overflow-hidden cursor-grab active:cursor-grabbing">
                        <Icon className="h-4 w-4 text-stone-700 shrink-0" />
                        <span className="text-[10px] text-stone-700 leading-tight text-center truncate w-full">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          <p className="text-[10px] text-stone-500 mt-3 px-1">Tables come from your <b>Table Inventory</b>. <b>Drag</b> any palette item onto the canvas and release exactly where it should go.</p>
          </div>
        )}
        {!showPalette && isAdmin && (
          <button onClick={() => setShowPalette(true)}
            className="absolute top-1 left-1 z-20 sm:relative sm:top-auto sm:left-auto bg-stone-800 text-white px-2 text-xs h-8 my-1 rounded sm:rounded-r flex items-center gap-1"
            data-testid="palette-open">
            <Settings2 className="h-3 w-3" /> Palette
          </button>
        )}

        {/* ─── Canvas ──────────────────────────────────────────────────── */}
        <div className="flex-1 bg-stone-700 relative overflow-hidden"
             onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
             onDrop={(e) => {
               e.preventDefault();
               try {
                 const raw = e.dataTransfer.getData("application/json");
                 if (!raw) return;
                 const item = JSON.parse(raw);
                 if (item.__kind === "guestFamily") {
                   // Find a table under the cursor by hit-testing the SVG elements
                   const el = document.elementFromPoint(e.clientX, e.clientY);
                   const node = el?.closest('[data-testid^="canvas-table-"]');
                   if (!node) { alert("Drop the family on a table."); return; }
                   const tid = Number(node.getAttribute("data-testid").replace("canvas-table-", ""));
                   onDropFamilyOnTable(tid, item.guestId);
                   return;
                 }
                 const { x, y } = screenToCanvas(e.clientX, e.clientY);
                 addFromPalette(item, { x, y });
               } catch (err) { console.error(err); }
             }}>
          <svg ref={svgRef} className="w-full h-full"
               onPointerDownCapture={onSvgPointerDownCapture}
               onPointerDown={onSvgPointerDown}
               onWheel={onWheel}
               data-testid="canvas-svg"
               style={{ cursor: panning ? "grabbing" : (spaceHeld ? "grab" : (calibration.step.startsWith("awaiting") ? "crosshair" : "default")) }}>
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
                  isMultiSelected={selectionSet.some(s => s.kind === "object" && s.id === o.id)}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onEditText={editObjectText}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}
              {objects.filter(o => !o.objectType.startsWith("room_") && o.objectType !== "door").map(o => (
                <ObjectRenderer key={`o-${o.id}`} o={o} isAdmin={isAdmin}
                  isSelected={selection?.kind === "object" && selection.id === o.id}
                  isMultiSelected={selectionSet.some(s => s.kind === "object" && s.id === o.id)}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onEditText={editObjectText}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}
              {/* Tables */}
              {tables.map(t => (
                <TableRenderer key={`t-${t.id}`} t={t} isAdmin={isAdmin} pxPerFt={pxPerFt}
                  isSelected={selection?.kind === "table" && selection.id === t.id}
                  isMultiSelected={selectionSet.some(s => s.kind === "table" && s.id === t.id)}
                  conflictCount={(conflicts[t.id] || []).length}
                  groupCapacity={t.groupId ? groupCap[t.groupId] : null}
                  onPointerDown={e => onObjectPointerDown(e, "table", t)}
                  onDoubleClick={() => onOpenTable?.(t)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "table", t, h)}
                  onRotateStart={e => onRotatePointerDown(e, "table", t)} />
              ))}
              {/* Doors render on top so the swing arc is always visible */}
              {objects.filter(o => o.objectType === "door").map(o => (
                <ObjectRenderer key={`o-${o.id}`} o={o} isAdmin={isAdmin}
                  isSelected={selection?.kind === "object" && selection.id === o.id}
                  isMultiSelected={selectionSet.some(s => s.kind === "object" && s.id === o.id)}
                  onPointerDown={e => onObjectPointerDown(e, "object", o)}
                  onResizeStart={(e, h) => onResizePointerDown(e, "object", o, h)}
                  onRotateStart={e => onRotatePointerDown(e, "object", o)}
                  onRemove={() => removeObject(o.id)} pxPerFt={pxPerFt} />
              ))}

              <AlignmentGuides guides={alignmentGuides} canvasW={canvasW} canvasH={canvasH} />

              {/* Calibration overlay — captures all clicks during calibration so
                  the user can hit any point (including over the floor-plan image or objects). */}
              {(calibration.step === "awaiting-p1" || calibration.step === "awaiting-p2") && (
                <rect data-bg="1"
                      x={-5000} y={-5000} width={20000} height={20000}
                      fill="rgba(0,0,0,0.001)"
                      style={{ cursor: "crosshair" }} />
              )}

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
              <><strong>Navigate:</strong> scroll = zoom · drag empty canvas (or hold <kbd className="px-1 bg-stone-700 rounded">Space</kbd>) = pan · middle-click drag = pan · <strong>Edit:</strong> click an object, drag to move, corner handles resize, top handle rotates (Shift = free) · <strong>Double-click</strong> a table to seat guests</>
            ) : (
              <><strong>Navigate:</strong> scroll = zoom · drag = pan · <strong>Double-click</strong> a table to manage seating</>
            )}
          </div>
          {savingFp && <div className="absolute top-3 right-3 bg-emerald-700 text-white text-sm px-3 py-1 rounded flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Saving plan…</div>}

          {/* Guest List floating panel on the canvas (toggle via toolbar) */}
          {showGuestPanel && (
            <CanvasGuestPanel
              ballroomId={ballroom.id}
              tables={tables}
              conflicts={conflicts}
              onClose={() => setShowGuestPanel(false)}
            />
          )}
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

function AlignmentGuides({ guides, canvasW, canvasH }) {
  if (!guides?.length) return null;
  return (
    <g pointerEvents="none" data-testid="alignment-guides">
      {guides.map((g, i) => g.axis === "x" ? (
        <line key={`gx-${i}`} x1={g.value} y1={-120} x2={g.value} y2={canvasH + 120}
              stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6 4" />
      ) : (
        <line key={`gy-${i}`} x1={-120} y1={g.value} x2={canvasW + 120} y2={g.value}
              stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6 4" />
      ))}
    </g>
  );
}

function TableRenderer({ t, pxPerFt, isAdmin, isSelected, isMultiSelected, onPointerDown, onDoubleClick, onResizeStart, onRotateStart, groupCapacity, conflictCount }) {
  const dims = tablePxDims(t, pxPerFt);
  // Effective capacity = group sum when combined, else table's own.
  const effCap = groupCapacity || t.maxCapacity || 0;
  const overflow = (t.seatsTaken || 0) > effCap;
  const colorKey = overflow ? "red" : (t.color || "gray");
  const fill = TABLE_COLOR_FILL[colorKey] || TABLE_COLOR_FILL.gray;
  const stroke = TABLE_COLOR_STROKE[colorKey] || TABLE_COLOR_STROKE.gray;
  const chairs = chairsForTable(t, dims);
  const x = t.canvasX || 0, y = t.canvasY || 0;
  const rot = t.rotation || 0;
  const dimsLabel = dims.isRound
    ? `${Math.round(t.widthIn)}in round`
    : `${formatLen(t.widthIn)} × ${formatLen(t.lengthIn)}`;
  const groupLabel = t.groupId ? ` · combined` : "";

  return (
    <g transform={`translate(${x}, ${y}) rotate(${rot} ${dims.w / 2} ${dims.h / 2})`} data-testid={`canvas-table-${t.id}`} className="cursor-pointer">
      {isMultiSelected && !isSelected && (
        dims.isRound
          ? <circle cx={dims.w / 2} cy={dims.h / 2} r={dims.radius + 6} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 3" />
          : <rect x={-3} y={-3} width={dims.w + 6} height={dims.h + 6} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 3" rx={6} />
      )}
      {chairs.map((c, i) => (
        <circle key={`ch-${i}`} cx={c.cx} cy={c.cy} r={c.r}
          fill={c.occupied ? CHAIR_OCCUPIED_FILL : CHAIR_EMPTY_FILL}
          stroke={c.occupied ? CHAIR_OCCUPIED_STROKE : CHAIR_EMPTY_STROKE}
          strokeWidth="1" pointerEvents="none"
          data-testid={`chair-${t.id}-${i}-${c.occupied ? "green" : "gray"}`} />
      ))}
      <g onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}>
        {dims.isRound ? (
          <circle cx={dims.w / 2} cy={dims.h / 2} r={dims.radius} fill={fill} stroke={stroke}
            strokeWidth={overflow ? "3.5" : "2.5"}
            strokeDasharray={t.groupId ? "6 3" : undefined} />
        ) : (
          <rect width={dims.w} height={dims.h} fill={fill} stroke={stroke}
            strokeWidth={overflow ? "3.5" : "2.5"} rx="4"
            strokeDasharray={t.groupId ? "6 3" : undefined} />
        )}
        <text x={dims.w / 2} y={dims.h / 2 - 4} fill="#1c1917" fontSize="14" fontWeight="700" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">{t.tableNumber}</text>
        <text x={dims.w / 2} y={dims.h / 2 + 10} fill={overflow ? "#b91c1c" : "#44403c"} fontSize="9" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">
          {t.seatsTaken}/{effCap}{overflow ? " ⚠" : ""}
        </text>
        <title>{t.label || `Table ${t.tableNumber}`} — {t.seatsTaken}/{effCap} · {dimsLabel}{groupLabel}{overflow ? " · OVER CAPACITY" : ""}{conflictCount ? ` · ${conflictCount} conflict(s)` : ""}</title>
      </g>
      {/* dimension label below table */}
      <text x={dims.w / 2} y={dims.h + 14} fill="#fde68a" fontSize="10" textAnchor="middle" className="select-none pointer-events-none font-mono">{dimsLabel}{groupLabel}</text>
      {/* conflict badge */}
      {conflictCount > 0 && (
        <g data-testid={`conflict-badge-${t.id}`} pointerEvents="none">
          <circle cx={dims.w - 4} cy={4} r={9} fill="#dc2626" stroke="#fff" strokeWidth="2" />
          <text x={dims.w - 4} y={4} fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle" dominantBaseline="central" className="select-none">{conflictCount}</text>
        </g>
      )}
      {/* selection + handles */}
      {isAdmin && isSelected && (
        <SelectionHandles w={dims.w} h={dims.h} onResizeStart={onResizeStart} onRotateStart={onRotateStart} />
      )}
    </g>
  );
}

function ObjectRenderer({ o, pxPerFt, isAdmin, isSelected, isMultiSelected, onPointerDown, onResizeStart, onRotateStart, onRemove, onEditText }) {
  const style = OBJ_STYLE[o.objectType] || OBJ_STYLE.blocker;
  const rot = o.rotation || 0;
  const labelText = o.label || style.label || o.objectType.replace(/_/g, " ").toUpperCase();
  const isDoor = o.objectType === "door";
  const isRoom = o.objectType.startsWith("room_");
  const isLine = o.objectType === "line";
  const isText = o.objectType === "text";

  // Body
  let body = null;
  if (isDoor) {
    const props = o.properties || {};
    const isDouble = !!props.isDouble;
    const swing = props.swingDirection === "left" ? "left" : "right";
    body = <DoorBody w={o.width} h={o.height} isDouble={isDouble} swing={swing} />;
  } else if (isLine) {
    // Divider line: render as a thick horizontal rectangle (rotation handles orientation)
    body = (
      <rect width={o.width} height={Math.max(2, Math.min(o.height, 8))}
            y={(o.height - Math.max(2, Math.min(o.height, 8))) / 2}
            fill="#1c1917" stroke="#000" strokeWidth="0" />
    );
  } else if (isText) {
    const fs = (o.properties && o.properties.fontSize) || 16;
    const txt = (o.properties && o.properties.textContent) || o.label || "Label";
    body = (
      <>
        <rect width={o.width} height={o.height} fill={style.fill} stroke={style.stroke} strokeWidth={1.5}
              strokeDasharray={isSelected ? "0" : "4 3"} rx={3} />
        <text x={o.width / 2} y={o.height / 2} fill="#1c1917" fontSize={fs}
              textAnchor="middle" dominantBaseline="middle"
              className="select-none pointer-events-none font-medium">{txt}</text>
      </>
    );
  } else {
    body = (
      <rect width={o.width} height={o.height}
            fill={style.fill} stroke={style.stroke} strokeWidth={isRoom ? 2.5 : 1.5}
            strokeDasharray={style.dashed ? "8 4" : "0"} rx={isRoom ? 0 : 3} />
    );
  }

  const dimsLabel = `${formatLen(pxToIn(o.width, pxPerFt))} × ${formatLen(pxToIn(o.height, pxPerFt))}`;
  const multiHalo = isMultiSelected && !isSelected;

  return (
    <g transform={`translate(${o.x}, ${o.y}) rotate(${rot} ${o.width / 2} ${o.height / 2})`}
       data-testid={`canvas-obj-${o.id}`} className={isAdmin ? "cursor-move" : ""}>
      {multiHalo && (
        <rect x={-3} y={-3} width={o.width + 6} height={o.height + 6}
              fill="none" stroke="#0ea5e9" strokeWidth="2" strokeDasharray="4 3" rx={6} />
      )}
      <g onPointerDown={onPointerDown}
         onDoubleClick={(e) => { if (isText && isAdmin) { e.stopPropagation(); onEditText?.(o); } }}>
        {body}
        {labelText && !isDoor && !isLine && !isText && (
          <text x={o.width / 2} y={o.height / 2} fill={style.stroke} fontSize={isRoom ? 14 : 11} textAnchor="middle" dominantBaseline="middle"
                className="select-none pointer-events-none uppercase tracking-wider font-medium">
            {labelText}
          </text>
        )}
        <title>{labelText} — {dimsLabel}{isText ? " (double-click to edit text)" : ""}</title>
      </g>
      {!isDoor && !isLine && !isText && (
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
  const wallStroke = "#0f172a", arcStroke = "#475569";

  // Invisible hit area so the (otherwise stroke-only) door is clickable across
  // the entire swing region; covers both the wall slot and the arc bbox.
  const hitTop    = swingDown ? -8 : -w - 4;
  const hitHeight = w + 12;
  const hit = (
    <rect x={-4} y={hitTop} width={w + 8} height={hitHeight} fill="rgba(255,255,255,0.001)" />
  );

  if (!isDouble) {
    const r = w; // door slab length acts as arc radius
    const endY = swingDown ? r : -r;
    return (
      <g>
        {hit}
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
      {hit}
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
    <div className="absolute inset-x-0 bottom-0 z-20 max-h-[55vh] border-t sm:border-t-0 sm:border-l border-stone-300 sm:relative sm:max-h-none sm:w-72 bg-stone-50 overflow-y-auto p-3 text-sm shadow-2xl sm:shadow-none" data-testid="side-panel">
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


// ─── Canvas Guest Panel (floating, draggable families onto tables) ────────────
function CanvasGuestPanel({ ballroomId, tables, conflicts, onClose }) {
  const [guests, setGuests] = useState([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiClient.get("/guests");
      setGuests(r.data);
    } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tableNumFor = (g) => {
    if (!g.tableId) return null;
    const t = tables.find((x) => x.id === g.tableId);
    return t ? t.tableNumber : null;
  };

  // group guests by family_id for easy drag-the-whole-family UX
  const families = useMemo(() => {
    const map = new Map();
    for (const g of guests) {
      const key = g.familyId || `__solo_${g.id}`;
      if (!map.has(key)) {
        map.set(key, { familyId: g.familyId, members: [], total: 0, anchor: g });
      }
      const row = map.get(key);
      row.members.push(g);
      row.total += g.partySize || 0;
    }
    return Array.from(map.values());
  }, [guests]);

  const matches = (fam) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return fam.members.some((m) =>
      (m.fullName || "").toLowerCase().includes(needle) ||
      (m.invoiceNumber || "").toLowerCase().includes(needle) ||
      (m.familyId || "").toLowerCase().includes(needle)
    );
  };

  const statusColor = (g) => {
    if (!g.tableId) return "bg-stone-300 text-stone-700";
    return "bg-emerald-200 text-emerald-900";
  };

  return (
    <div className="absolute inset-2 sm:inset-auto sm:top-3 sm:right-3 sm:w-80 sm:max-h-[80vh] bg-white rounded-xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col z-30"
         data-testid="canvas-guest-panel">
      <div className="px-3 py-2 bg-stone-900 text-white flex items-center justify-between">
        <div className="font-medium flex items-center gap-2">
          <Users className="h-4 w-4" /> Guest List
          <span className="text-xs text-stone-400">({guests.length})</span>
        </div>
        <button onClick={onClose} className="hover:bg-stone-700 p-1 rounded" data-testid="close-guest-panel">
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="p-2 border-b border-stone-200">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, family, invoice…"
          data-testid="canvas-guest-search"
          className="w-full px-2 py-1 text-sm border border-stone-300 rounded" />
        <div className="text-[10px] text-stone-500 mt-1">Drag a family card onto a table on the canvas.</div>
      </div>
      <div className="overflow-y-auto flex-1 divide-y divide-stone-100">
        {families.filter(matches).map((fam) => {
          const num = tableNumFor(fam.anchor);
          const seated = !!fam.anchor.tableId;
          const fid = fam.familyId || fam.anchor.id;
          return (
            <div key={fid}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("application/json", JSON.stringify({
                  __kind: "guestFamily", guestId: fam.anchor.id,
                  familyId: fam.familyId, total: fam.total,
                }));
              }}
              className="px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-stone-50"
              data-testid={`guest-card-${fam.anchor.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{fam.anchor.fullName}</div>
                  <div className="text-[11px] text-stone-500 truncate">
                    {fam.familyId ? `Fam ${fam.familyId}` : "(solo)"} · {fam.total} ppl
                    {fam.anchor.nearFamilyId ? ` · near ${fam.anchor.nearFamilyId}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor(fam.anchor)}`}>
                    {seated ? `T#${num}` : "unassigned"}
                  </span>
                  {fam.anchor.tableId && (conflicts[fam.anchor.tableId]?.length || 0) > 0 && (
                    <span className="text-[10px] text-red-700 flex items-center gap-0.5">
                      <AlertTriangle className="h-3 w-3" /> conflict
                    </span>
                  )}
                </div>
              </div>
              {fam.anchor.seatingPreferences?.length > 0 && (
                <div className="text-[10px] text-stone-500 mt-1">
                  wants: {fam.anchor.seatingPreferences.join(", ")}
                </div>
              )}
            </div>
          );
        })}
        {families.filter(matches).length === 0 && (
          <div className="p-6 text-center text-stone-400 text-sm">No matches</div>
        )}
      </div>
    </div>
  );
}
