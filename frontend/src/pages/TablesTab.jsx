import { useEffect, useState, useCallback } from "react";
import { apiClient } from "@/lib/api";
import { Plus, Trash2, X, CheckCircle2, Circle, Sparkles, Loader2, AlertCircle, Users, Edit3, LayoutGrid } from "lucide-react";
import BallroomCanvas from "@/pages/BallroomCanvas";

const SHAPE_OPTIONS = [
  { value: "round", label: "Round" },
  { value: "rectangular", label: "Rectangular" },
  { value: "square", label: "Square" },
];

const COLOR_CLASS = {
  gray: "bg-stone-100 border-stone-300 text-stone-600",
  blue: "bg-blue-100 border-blue-400 text-blue-900",
  yellow: "bg-amber-100 border-amber-400 text-amber-900",
  green: "bg-emerald-100 border-emerald-500 text-emerald-900",
};

function BallroomForm({ onCreated, isAdmin }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [w, setW] = useState(""); const [h, setH] = useState("");
  if (!isAdmin) return null;
  const submit = async (e) => {
    e.preventDefault();
    await apiClient.post("/ballrooms", { name, widthFt: w ? Number(w) : null, heightFt: h ? Number(h) : null });
    setName(""); setW(""); setH(""); setOpen(false); onCreated();
  };
  if (!open) return (
    <button data-testid="add-ballroom-btn" onClick={() => setOpen(true)}
      className="flex items-center gap-1 text-sm text-stone-700 hover:text-stone-900 border border-dashed border-stone-300 rounded px-3 py-1.5">
      <Plus className="h-3 w-3" /> Add Ballroom
    </button>
  );
  return (
    <form onSubmit={submit} className="flex gap-2 items-center bg-stone-50 border border-stone-200 rounded p-2">
      <input data-testid="ballroom-name" autoFocus placeholder="Ballroom name" value={name} onChange={e => setName(e.target.value)} required
        className="px-2 py-1 border border-stone-300 rounded text-sm" />
      <input placeholder="W ft" value={w} onChange={e => setW(e.target.value)} type="number" className="w-16 px-2 py-1 border border-stone-300 rounded text-sm" />
      <input placeholder="H ft" value={h} onChange={e => setH(e.target.value)} type="number" className="w-16 px-2 py-1 border border-stone-300 rounded text-sm" />
      <button type="submit" data-testid="ballroom-save" className="bg-stone-900 text-white px-3 py-1 rounded text-sm hover:bg-stone-800">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="text-stone-500 hover:text-stone-900"><X className="h-4 w-4" /></button>
    </form>
  );
}

function TableForm({ ballroomId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tableNumber: "", label: "", shape: "round", maxCapacity: 10 });
  const submit = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post("/tables", { ...form, ballroomId, tableNumber: Number(form.tableNumber),
        maxCapacity: Number(form.maxCapacity) });
      setForm({ tableNumber: "", label: "", shape: "round", maxCapacity: 10 }); setOpen(false); onCreated();
    } catch (e) { alert(e?.response?.data?.detail || "Failed"); }
  };
  if (!open) return (
    <button data-testid={`add-table-${ballroomId}`} onClick={() => setOpen(true)}
      className="border-2 border-dashed border-stone-300 hover:bg-stone-50 rounded-lg p-4 flex items-center justify-center gap-1 text-stone-600 text-sm">
      <Plus className="h-4 w-4" /> Add table
    </button>
  );
  return (
    <form onSubmit={submit} className="bg-white border border-stone-300 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input data-testid="table-number-input" placeholder="Number" type="number" value={form.tableNumber}
          onChange={e => setForm({...form, tableNumber: e.target.value})} required className="px-2 py-1 border border-stone-300 rounded text-sm" />
        <input data-testid="table-capacity-input" placeholder="Capacity" type="number" value={form.maxCapacity}
          onChange={e => setForm({...form, maxCapacity: e.target.value})} required className="px-2 py-1 border border-stone-300 rounded text-sm" />
      </div>
      <input data-testid="table-label-input" placeholder="Label (optional)" value={form.label}
        onChange={e => setForm({...form, label: e.target.value})} className="w-full px-2 py-1 border border-stone-300 rounded text-sm" />
      <select data-testid="table-shape-input" value={form.shape} onChange={e => setForm({...form, shape: e.target.value})}
        className="w-full px-2 py-1 border border-stone-300 rounded text-sm">
        {SHAPE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      <div className="flex gap-2">
        <button data-testid="table-save" type="submit" className="bg-stone-900 text-white px-3 py-1 rounded text-sm flex-1">Create</button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-stone-500"><X className="h-4 w-4" /></button>
      </div>
    </form>
  );
}

function TableCard({ table, onClick }) {
  return (
    <button data-testid={`table-card-${table.id}`} onClick={() => onClick(table)}
      className={`border-2 rounded-lg p-4 text-left hover:shadow-lg transition ${COLOR_CLASS[table.color]}`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-2xl font-semibold">Table {table.tableNumber}</div>
          {table.label && <div className="text-sm opacity-80">{table.label}</div>}
        </div>
        <div className="text-xs uppercase tracking-wide opacity-70">{table.shape}</div>
      </div>
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-1">
          <Users className="h-4 w-4" />
          <span className="font-medium">{table.seatsTaken} / {table.maxCapacity}</span>
        </div>
        <div className="text-xs opacity-80">
          {table.seatsRemaining > 0 ? `${table.seatsRemaining} seat${table.seatsRemaining === 1 ? '' : 's'} left` : 'FULL'}
        </div>
      </div>
    </button>
  );
}

function TableDetailModal({ table, onClose, onChange }) {
  const [detail, setDetail] = useState(null);
  const [unassigned, setUnassigned] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [warning, setWarning] = useState(null);

  const refresh = useCallback(async () => {
    if (!table) return;
    const { data } = await apiClient.get(`/tables/${table.id}`);
    setDetail(data);
  }, [table]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (showPicker) apiClient.get("/guests/unassigned").then(r => setUnassigned(r.data));
  }, [showPicker]);

  const assignGuest = async (guestId, force = false) => {
    try {
      const { data } = await apiClient.post(`/tables/${table.id}/assign`, { guestId, allowOverflow: force });
      setWarning(null); setShowPicker(false); setSearch(""); refresh(); onChange();
      if (data.preferenceMatch?.mutualWith?.length || data.preferenceMatch?.oneWayWith?.length) {
        const m = data.preferenceMatch.mutualWith.length, o = data.preferenceMatch.oneWayWith.length;
        setTimeout(() => alert(`Preference match found: ${m} mutual, ${o} one-way 🎉`), 100);
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === "capacity_exceeded") {
        if (confirm(`${detail.message}\n\nForce overflow?`)) assignGuest(guestId, true);
      } else alert(detail || "Assignment failed");
    }
  };

  const unassign = async (guestId) => {
    await apiClient.post(`/tables/${table.id}/unassign/${guestId}`);
    refresh(); onChange();
  };

  const toggleSeated = async (guestId, current) => {
    await apiClient.patch(`/tables/${table.id}/guests/${guestId}/seated`, { seated: !current });
    refresh();
  };

  const deleteTable = async () => {
    if (!confirm(`Delete Table ${table.tableNumber}? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/tables/${table.id}`);
      onChange(); onClose();
    } catch (err) { alert(err?.response?.data?.detail || "Cannot delete table"); }
  };

  if (!table || !detail) return null;
  const filtered = unassigned.filter(g =>
    !search || g.fullName.toLowerCase().includes(search.toLowerCase()) || g.invoiceNumber.includes(search)
  );

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex justify-end" onClick={onClose} data-testid="table-modal">
      <div className="bg-white w-full max-w-xl h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className={`p-6 border-b border-stone-200 ${COLOR_CLASS[detail.color]} sticky top-0`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-semibold">Table {detail.tableNumber}</h2>
              {detail.label && <p className="text-lg opacity-80">{detail.label}</p>}
              <p className="text-sm mt-1 opacity-80">{detail.seatsTaken} / {detail.maxCapacity} seats · {detail.shape}</p>
            </div>
            <div className="flex gap-1">
              <button data-testid="delete-table" onClick={deleteTable} className="p-2 hover:bg-white/30 rounded text-red-700"><Trash2 className="h-5 w-5" /></button>
              <button data-testid="close-table-modal" onClick={onClose} className="p-2 hover:bg-white/30 rounded"><X className="h-5 w-5" /></button>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium text-stone-900">Seated guests ({detail.guests.length})</h3>
            <button data-testid="add-guest-to-table" onClick={() => setShowPicker(true)}
              className="bg-stone-900 hover:bg-stone-800 text-white text-sm px-3 py-1.5 rounded flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add guest
            </button>
          </div>
          {detail.guests.length === 0 ? (
            <p className="text-stone-500 text-sm">No guests seated yet</p>
          ) : (
            <ul className="space-y-2">
              {detail.guests.map(g => (
                <li key={g.id} className="bg-stone-50 rounded p-3 flex items-center justify-between" data-testid={`seated-guest-${g.id}`}>
                  <button onClick={() => toggleSeated(g.id, g.physicallySeated)} className="flex items-center gap-2 flex-1 text-left">
                    {g.physicallySeated ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5 text-stone-400" />}
                    <div>
                      <div className="font-medium text-stone-900">{g.fullName}</div>
                      <div className="text-xs text-stone-500">{g.invoiceNumber} · Party of {g.partySize}</div>
                    </div>
                  </button>
                  <button data-testid={`unassign-${g.id}`} onClick={() => unassign(g.id)} className="text-stone-500 hover:text-red-600 p-1"><X className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
          {showPicker && (
            <div className="border-t border-stone-200 pt-4">
              <h4 className="font-medium text-stone-900 mb-2">Assign an unassigned guest</h4>
              <input data-testid="picker-search" autoFocus placeholder="Search name or invoice..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded mb-2" />
              <div className="max-h-72 overflow-y-auto border border-stone-200 rounded">
                {filtered.length === 0 ? <p className="text-stone-500 text-sm p-3">No matches</p> :
                  filtered.map(g => (
                    <button key={g.id} onClick={() => assignGuest(g.id)} data-testid={`picker-pick-${g.id}`}
                      className="w-full text-left p-3 border-b border-stone-100 hover:bg-stone-50 last:border-b-0">
                      <div className="font-medium text-stone-900">{g.fullName}</div>
                      <div className="text-xs text-stone-500">{g.invoiceNumber} · Party of {g.partySize}{g.seatingPreferences.length > 0 && ` · wants ${g.seatingPreferences.join(", ")}`}</div>
                    </button>
                  ))}
              </div>
              <button onClick={() => setShowPicker(false)} className="text-sm text-stone-500 mt-2">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoSuggestModal({ open, onClose, onApplied }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setBusy(true);
    apiClient.post("/seating/auto-suggest").then(r => setPlan(r.data)).catch(e => alert(e?.response?.data?.detail || "Failed")).finally(() => setBusy(false));
  }, [open]);
  if (!open) return null;
  const apply = async () => {
    if (!plan?.plan?.length) return;
    setBusy(true);
    try { await apiClient.post("/seating/auto-suggest/apply", plan.plan); onApplied(); onClose(); }
    catch (e) { alert("Apply failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose} data-testid="autosuggest-modal">
      <div className="bg-white max-w-2xl w-full rounded-lg shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-stone-200 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-stone-900 flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> Auto-Suggest Seating</h3>
            <p className="text-sm text-stone-600">{busy ? "Computing..." : plan?.summary || ""}</p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {busy ? <div className="text-center py-12 text-stone-500"><Loader2 className="h-6 w-6 animate-spin inline" /></div> :
            !plan?.plan?.length ? <p className="text-stone-500 text-center py-12">No suggestions could be made.</p> :
              <ul className="space-y-2">
                {plan.plan.map((p, i) => (
                  <li key={i} className="flex items-center justify-between bg-stone-50 rounded p-3" data-testid={`plan-item-${i}`}>
                    <div>
                      <div className="font-medium text-stone-900">{p.guestName} <span className="text-stone-500">(party of {p.partySize})</span></div>
                      <div className="text-xs text-stone-500">→ Table {p.tableNumber}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${p.reason === "mutual_cluster" ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-700"}`}>
                      {p.reason === "mutual_cluster" ? "mutual match" : "size fit"}
                    </span>
                  </li>
                ))}
              </ul>}
        </div>
        <div className="p-5 border-t border-stone-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-stone-300 rounded hover:bg-stone-50">Cancel</button>
          <button data-testid="apply-autosuggest" onClick={apply} disabled={busy || !plan?.plan?.length}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded disabled:opacity-50">Apply Plan</button>
        </div>
      </div>
    </div>
  );
}

export default function TablesTab({ isAdmin }) {
  const [ballrooms, setBallrooms] = useState([]);
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [showAuto, setShowAuto] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [canvasBallroom, setCanvasBallroom] = useState(null);

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([apiClient.get("/ballrooms"), apiClient.get("/tables")]);
    setBallrooms(b.data); setTables(t.data);
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  // keep canvas in sync if user lands on a ballroom from this list
  useEffect(() => {
    if (canvasBallroom) {
      const fresh = ballrooms.find(b => b.id === canvasBallroom.id);
      if (fresh && fresh !== canvasBallroom) setCanvasBallroom(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ballrooms]);

  const tablesByBallroom = ballrooms.map(b => ({ ...b, tables: tables.filter(t => t.ballroomId === b.id) }));
  const orphan = tables.filter(t => !ballrooms.find(b => b.id === t.ballroomId));

  const deleteBallroom = async (id) => {
    if (!confirm("Delete this ballroom? Move/delete its tables first.")) return;
    try { await apiClient.delete(`/ballrooms/${id}`); load(); }
    catch (err) { alert(err?.response?.data?.detail || "Cannot delete"); }
  };

  return (
    <div className="p-3 sm:p-6" data-testid="tables-tab">
      <div className="flex justify-between items-start mb-6 gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-stone-900">Tables & Seating</h2>
          <p className="text-xs sm:text-sm text-stone-600">Color: gray=empty, blue=partial, yellow=1–2 left, green=full</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <BallroomForm onCreated={load} isAdmin={isAdmin} />
          <button data-testid="auto-suggest-btn" onClick={() => setShowAuto(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white text-sm px-3 sm:px-4 py-2 rounded flex items-center gap-1">
            <Sparkles className="h-4 w-4" /> Auto-Suggest
          </button>
        </div>
      </div>
      {ballrooms.length === 0 && <div className="text-stone-500 text-center py-12 border-2 border-dashed border-stone-200 rounded">No ballrooms yet. Add one to get started.</div>}
      {tablesByBallroom.map(b => (
        <div key={b.id} className="mb-8" data-testid={`ballroom-${b.id}`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-stone-800">{b.name} {b.widthFt && b.heightFt && <span className="text-xs text-stone-500 font-normal">({b.widthFt}×{b.heightFt} ft)</span>}</h3>
            <div className="flex items-center gap-2">
              <button data-testid={`open-canvas-${b.id}`} onClick={() => setCanvasBallroom(b)}
                className="text-xs bg-stone-800 text-white hover:bg-stone-900 px-3 py-1.5 rounded flex items-center gap-1">
                <LayoutGrid className="h-3 w-3" />Open canvas
              </button>
              {isAdmin && <button onClick={() => deleteBallroom(b.id)} data-testid={`del-ballroom-${b.id}`} className="text-xs text-stone-500 hover:text-red-600 flex items-center gap-1"><Trash2 className="h-3 w-3" />Remove</button>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {b.tables.map(t => <TableCard key={t.id} table={t} onClick={setSelectedTable} />)}
            <TableForm ballroomId={b.id} onCreated={load} />
          </div>
        </div>
      ))}
      {orphan.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-amber-700 mb-3 flex items-center gap-2"><AlertCircle className="h-5 w-5" /> Orphan tables (no ballroom)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {orphan.map(t => <TableCard key={t.id} table={t} onClick={setSelectedTable} />)}
          </div>
        </div>
      )}
      <TableDetailModal table={selectedTable} onClose={() => setSelectedTable(null)} onChange={() => setReloadKey(k => k + 1)} />
      <AutoSuggestModal open={showAuto} onClose={() => setShowAuto(false)} onApplied={() => setReloadKey(k => k + 1)} />
      {canvasBallroom && (
        <BallroomCanvas
          ballroom={canvasBallroom}
          isAdmin={isAdmin}
          onClose={() => { setCanvasBallroom(null); setReloadKey(k => k + 1); }}
          onOpenTable={(t) => setSelectedTable(t)}
        />
      )}
    </div>
  );
}
