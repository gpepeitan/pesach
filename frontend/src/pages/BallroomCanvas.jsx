import { useEffect, useState, useRef, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { X, Image as ImageIcon, Trash2, ZoomIn, ZoomOut, Maximize2, Square, Circle, RectangleHorizontal, Mic, Music, Wine, Pizza, ChefHat, BoxSelect, DoorOpen, DoorClosed, Loader2, MoveLeft } from "lucide-react";

const GRID = 20; // px = roughly 2ft at default scale
const COLOR_FILL = {
  gray: "#e7e5e4", blue: "#bfdbfe", yellow: "#fde68a", green: "#a7f3d0",
};
const COLOR_STROKE = {
  gray: "#a8a29e", blue: "#3b82f6", yellow: "#d97706", green: "#10b981",
};

const PALETTE = [
  { type: "table_round", label: "Round Table", icon: Circle, w: 80, h: 80, isTable: true, shape: "round" },
  { type: "table_rect", label: "Rect Table", icon: RectangleHorizontal, w: 120, h: 60, isTable: true, shape: "rectangular" },
  { type: "table_square", label: "Square Table", icon: Square, w: 80, h: 80, isTable: true, shape: "square" },
  { type: "stage", label: "Stage", icon: Mic, w: 200, h: 80 },
  { type: "dance_floor", label: "Dance Floor", icon: Music, w: 160, h: 160 },
  { type: "bar", label: "Bar", icon: Wine, w: 180, h: 40 },
  { type: "buffet", label: "Buffet", icon: Pizza, w: 200, h: 50 },
  { type: "carving", label: "Carving", icon: ChefHat, w: 100, h: 50 },
  { type: "pillar", label: "Pillar", icon: BoxSelect, w: 30, h: 30 },
  { type: "entrance", label: "Entrance", icon: DoorOpen, w: 60, h: 30 },
  { type: "exit", label: "Exit", icon: DoorClosed, w: 60, h: 30 },
  { type: "blocker", label: "Blocker", icon: Square, w: 80, h: 80 },
];

const OBJ_STYLE = {
  stage: { fill: "#fef3c7", stroke: "#92400e" },
  dance_floor: { fill: "#ddd6fe", stroke: "#6d28d9" },
  bar: { fill: "#fecaca", stroke: "#991b1b" },
  buffet: { fill: "#bbf7d0", stroke: "#166534" },
  carving: { fill: "#fed7aa", stroke: "#9a3412" },
  pillar: { fill: "#44403c", stroke: "#1c1917" },
  entrance: { fill: "#a7f3d0", stroke: "#047857" },
  exit: { fill: "#fecaca", stroke: "#7f1d1d" },
  blocker: { fill: "#d6d3d1", stroke: "#57534e" },
  wall: { fill: "#a8a29e", stroke: "#57534e" },
};

function snap(v) { return Math.round(v / GRID) * GRID; }

export default function BallroomCanvas({ ballroom, onClose, onOpenTable, isAdmin }) {
  const [tables, setTables] = useState([]);
  const [objects, setObjects] = useState([]);
  const [drag, setDrag] = useState(null); // {kind, id, dx, dy} during drag
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [floorPlanUrl, setFloorPlanUrl] = useState(ballroom?.backgroundImageUrl || "");
  const [savingFp, setSavingFp] = useState(false);
  const [showPalette, setShowPalette] = useState(true);
  const svgRef = useRef(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!ballroom) return;
    const [t, o] = await Promise.all([
      apiClient.get(`/tables?ballroomId=${ballroom.id}`),
      apiClient.get(`/ballrooms/${ballroom.id}/canvas-objects`),
    ]);
    setTables(t.data); setObjects(o.data);
  }, [ballroom]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFloorPlanUrl(ballroom?.backgroundImageUrl || ""); }, [ballroom?.id, ballroom?.backgroundImageUrl]);

  const screenToCanvas = (sx, sy) => {
    const r = svgRef.current.getBoundingClientRect();
    return {
      x: (sx - r.left) / zoom - pan.x,
      y: (sy - r.top) / zoom - pan.y,
    };
  };

  const onPointerDown = (e, kind, item) => {
    if (!isAdmin) return;
    e.stopPropagation();
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const ix = item.canvasX ?? item.x ?? 0;
    const iy = item.canvasY ?? item.y ?? 0;
    setDrag({ kind, id: item.id, dx: x - ix, dy: y - iy, current: { x: ix, y: iy } });
  };

  const onSvgPointerDown = (e) => {
    if (e.target === svgRef.current || e.target.tagName === "rect" && e.target.getAttribute("data-bg") === "1") {
      setPanning({ sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y });
    }
  };

  const onPointerMove = (e) => {
    if (drag) {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      const nx = snap(x - drag.dx); const ny = snap(y - drag.dy);
      if (drag.kind === "table") {
        setTables(ts => ts.map(t => t.id === drag.id ? { ...t, canvasX: nx, canvasY: ny } : t));
      } else {
        setObjects(os => os.map(o => o.id === drag.id ? { ...o, x: nx, y: ny } : o));
      }
      setDrag(d => ({ ...d, current: { x: nx, y: ny } }));
    } else if (panning) {
      setPan({ x: panning.px + (e.clientX - panning.sx) / zoom, y: panning.py + (e.clientY - panning.sy) / zoom });
    }
  };

  const onPointerUp = async () => {
    if (drag) {
      const { kind, id, current } = drag;
      try {
        if (kind === "table") await apiClient.patch(`/tables/${id}`, { canvasX: current.x, canvasY: current.y });
        else await apiClient.patch(`/canvas-objects/${id}`, { x: current.x, y: current.y });
      } catch (e) { console.error(e); }
    }
    setDrag(null); setPanning(null);
  };

  const addFromPalette = async (item) => {
    if (!isAdmin) return;
    // Drop at center of current view
    const r = svgRef.current.getBoundingClientRect();
    const center = { x: snap(-pan.x + r.width / (2 * zoom) - item.w / 2), y: snap(-pan.y + r.height / (2 * zoom) - item.h / 2) };
    if (item.isTable) {
      // create new table — need to determine next table number
      const next = Math.max(0, ...tables.map(t => t.tableNumber || 0)) + 1;
      try {
        await apiClient.post("/tables", {
          tableNumber: next, label: null, ballroomId: ballroom.id,
          shape: item.shape, maxCapacity: 10, canvasX: center.x, canvasY: center.y,
        });
        load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed to add table"); }
    } else {
      try {
        await apiClient.post("/canvas-objects", {
          ballroomId: ballroom.id, objectType: item.type, label: null,
          x: center.x, y: center.y, width: item.w, height: item.h, rotation: 0,
        });
        load();
      } catch (e) { alert(e?.response?.data?.detail || "Failed"); }
    }
  };

  const removeObject = async (id) => {
    if (!confirm("Remove this object?")) return;
    await apiClient.delete(`/canvas-objects/${id}`);
    load();
  };

  const uploadFloorPlan = async (file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { alert("Image too large. Use < 4MB."); return; }
    setSavingFp(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await apiClient.patch(`/ballrooms/${ballroom.id}/floor-plan`, { backgroundImageUrl: reader.result });
        setFloorPlanUrl(reader.result); setShowUpload(false);
      } catch (e) { alert(e?.response?.data?.detail || "Upload failed"); }
      finally { setSavingFp(false); }
    };
    reader.readAsDataURL(file);
  };

  const removeFloorPlan = async () => {
    if (!confirm("Remove the floor plan image?")) return;
    await apiClient.patch(`/ballrooms/${ballroom.id}/floor-plan`, { backgroundImageUrl: "" });
    setFloorPlanUrl("");
  };

  const fitView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!ballroom) return null;
  const canvasW = ((ballroom.widthFt || 80)) * 12;  // 12 px per ft default
  const canvasH = ((ballroom.heightFt || 60)) * 12;

  return (
    <div className="fixed inset-0 z-40 bg-stone-900 flex flex-col" data-testid="ballroom-canvas">
      {/* Header */}
      <div className="bg-stone-800 text-white px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onClose} data-testid="canvas-close" className="hover:bg-stone-700 px-2 py-1 rounded flex items-center gap-1 text-sm"><MoveLeft className="h-4 w-4" />Back</button>
          <h2 className="text-lg font-semibold">{ballroom.name}</h2>
          <span className="text-xs text-stone-400">{ballroom.widthFt}×{ballroom.heightFt} ft · {tables.length} tables · {objects.length} objects</span>
        </div>
        <div className="flex items-center gap-1">
          {isAdmin && (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => uploadFloorPlan(e.target.files?.[0])} className="hidden" data-testid="floor-plan-file" />
              <button onClick={() => fileRef.current?.click()} data-testid="upload-floor-plan" className="hover:bg-stone-700 px-3 py-1 rounded text-sm flex items-center gap-1">
                <ImageIcon className="h-4 w-4" />{floorPlanUrl ? "Replace floor plan" : "Upload floor plan"}
              </button>
              {floorPlanUrl && <button onClick={removeFloorPlan} className="hover:bg-stone-700 p-1 rounded text-stone-300 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>}
            </>
          )}
          <div className="border-l border-stone-600 mx-2 h-6"></div>
          <button onClick={() => setZoom(z => Math.max(0.3, z * 0.85))} data-testid="zoom-out" className="hover:bg-stone-700 p-1 rounded"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-xs text-stone-300 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(3, z * 1.15))} data-testid="zoom-in" className="hover:bg-stone-700 p-1 rounded"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={fitView} data-testid="zoom-fit" className="hover:bg-stone-700 p-1 rounded"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        {isAdmin && showPalette && (
          <div className="w-44 bg-stone-100 border-r border-stone-300 overflow-y-auto p-2" data-testid="canvas-palette">
            <div className="text-xs uppercase tracking-wide text-stone-500 mb-2 px-1">Drop to add</div>
            <div className="grid grid-cols-2 gap-1">
              {PALETTE.map(p => {
                const Icon = p.icon;
                return (
                  <button key={p.type} onClick={() => addFromPalette(p)} data-testid={`palette-${p.type}`}
                    className="bg-white border border-stone-300 hover:border-stone-900 hover:bg-stone-50 rounded p-2 text-xs flex flex-col items-center gap-1">
                    <Icon className="h-4 w-4 text-stone-700" />
                    <span className="text-[10px] text-stone-700 leading-tight">{p.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-stone-500 mt-3 px-1">Click an item to drop it at the center of the view. Then drag to reposition.</p>
          </div>
        )}
        {!showPalette && isAdmin && (
          <button onClick={() => setShowPalette(true)} className="bg-stone-800 text-white px-2 text-xs h-8 my-1 rounded-r">Show palette</button>
        )}

        {/* Canvas */}
        <div className="flex-1 bg-stone-700 relative overflow-hidden" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onPointerDown={onSvgPointerDown}
            data-testid="canvas-svg"
          >
            <defs>
              <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              </pattern>
            </defs>
            <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
              {/* canvas background */}
              <rect data-bg="1" x={-2000} y={-2000} width={6000} height={6000} fill="url(#grid)" />
              {/* ballroom area */}
              <rect x={0} y={0} width={canvasW} height={canvasH} fill="rgba(0,0,0,0.15)" stroke="rgba(255,255,255,0.4)" strokeDasharray="4 4" strokeWidth="1" />
              {floorPlanUrl && (
                <image href={floorPlanUrl} x={0} y={0} width={canvasW} height={canvasH} opacity={0.55} preserveAspectRatio="xMidYMid slice" />
              )}

              {/* canvas objects */}
              {objects.map(o => {
                const style = OBJ_STYLE[o.objectType] || OBJ_STYLE.blocker;
                return (
                  <g key={`o-${o.id}`}
                    onPointerDown={e => onPointerDown(e, "object", o)}
                    transform={`translate(${o.x}, ${o.y}) rotate(${o.rotation || 0} ${o.width / 2} ${o.height / 2})`}
                    className={isAdmin ? "cursor-move" : ""}
                    data-testid={`canvas-obj-${o.id}`}>
                    <rect width={o.width} height={o.height} fill={style.fill} stroke={style.stroke} strokeWidth="1.5" rx="3" />
                    <text x={o.width / 2} y={o.height / 2} fill={style.stroke} fontSize="11" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none uppercase tracking-wider font-medium">
                      {o.label || o.objectType.replace(/_/g, " ")}
                    </text>
                    {isAdmin && (
                      <g onPointerDown={e => { e.stopPropagation(); removeObject(o.id); }} className="cursor-pointer">
                        <circle cx={o.width - 6} cy={6} r={7} fill="white" stroke="#dc2626" strokeWidth="1" />
                        <text x={o.width - 6} y={6} fontSize="10" textAnchor="middle" dominantBaseline="central" fill="#dc2626" className="select-none">✕</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* tables */}
              {tables.map(t => {
                const w = t.shape === "rectangular" ? 100 : 70;
                const h = t.shape === "rectangular" ? 50 : 70;
                const fill = COLOR_FILL[t.color]; const stroke = COLOR_STROKE[t.color];
                return (
                  <g key={`t-${t.id}`}
                    onPointerDown={e => onPointerDown(e, "table", t)}
                    onDoubleClick={() => onOpenTable(t)}
                    transform={`translate(${t.canvasX || 0}, ${t.canvasY || 0})`}
                    className="cursor-pointer"
                    data-testid={`canvas-table-${t.id}`}>
                    {t.shape === "round" ? (
                      <circle cx={w / 2} cy={h / 2} r={w / 2} fill={fill} stroke={stroke} strokeWidth="2.5" />
                    ) : (
                      <rect width={w} height={h} fill={fill} stroke={stroke} strokeWidth="2.5" rx="4" />
                    )}
                    <text x={w / 2} y={h / 2 - 4} fill="#1c1917" fontSize="14" fontWeight="700" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">
                      {t.tableNumber}
                    </text>
                    <text x={w / 2} y={h / 2 + 12} fill="#44403c" fontSize="10" textAnchor="middle" dominantBaseline="middle" className="select-none pointer-events-none">
                      {t.seatsTaken}/{t.maxCapacity}
                    </text>
                    <title>{t.label || `Table ${t.tableNumber}`} — {t.seatsTaken}/{t.maxCapacity} · Double-click to open</title>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* helper overlays */}
          <div className="absolute bottom-3 left-3 bg-stone-800/80 text-white text-xs px-3 py-2 rounded-lg max-w-md backdrop-blur-sm">
            {isAdmin ? <>
              <strong>Drag</strong> tables/objects · <strong>Double-click</strong> a table to manage seating · <strong>Drag the background</strong> to pan
            </> : <>
              <strong>Double-click</strong> a table to manage seating · drag the background to pan
            </>}
          </div>
          {savingFp && <div className="absolute top-3 right-3 bg-emerald-700 text-white text-sm px-3 py-1 rounded flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Saving floor plan...</div>}
        </div>
      </div>
    </div>
  );
}
