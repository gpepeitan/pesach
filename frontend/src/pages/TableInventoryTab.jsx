import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Trash2, Plus, Save, Loader2, Layers } from "lucide-react";

const SHAPES = [
  { value: "round", label: "Round" },
  { value: "rectangular", label: "Rectangle" },
  { value: "square", label: "Square" },
];

const blankType = {
  name: "",
  shape: "round",
  defaultSeats: 10,
  widthIn: 60,
  lengthIn: 60,
  quantityOwned: 0,
  isActive: true,
  notes: "",
};

export default function TableInventoryTab({ isAdmin }) {
  const [types, setTypes] = useState([]);
  const [draft, setDraft] = useState(blankType);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setBusy(true);
    try {
      const r = await apiClient.get("/table-types");
      setTypes(r.data);
    } finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e?.preventDefault?.();
    setErr("");
    try {
      const payload = { ...draft };
      if (editingId) await apiClient.patch(`/table-types/${editingId}`, payload);
      else await apiClient.post("/table-types", payload);
      setDraft(blankType); setEditingId(null);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Save failed");
    }
  };

  const edit = (t) => {
    setEditingId(t.id);
    setDraft({
      name: t.name, shape: t.shape, defaultSeats: t.defaultSeats,
      widthIn: t.widthIn, lengthIn: t.lengthIn, quantityOwned: t.quantityOwned,
      isActive: t.isActive, notes: t.notes || "",
    });
  };

  const cancel = () => { setDraft(blankType); setEditingId(null); setErr(""); };

  const del = async (id) => {
    if (!window.confirm("Delete this table type? Tables already created with it will lose the type link.")) return;
    try {
      await apiClient.delete(`/table-types/${id}`);
      await load();
    } catch (e) { alert(e?.response?.data?.detail || "Delete failed"); }
  };

  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="inventory-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
            <Layers className="h-5 w-5" /> Table Inventory
          </h2>
          <p className="text-stone-600 text-sm">Define the table types your venue owns. The canvas "Add Table" tool will only show these — no custom sizes.</p>
        </div>
      </div>

      {isAdmin && (
        <form onSubmit={save} className="bg-white border border-stone-200 rounded-lg p-5 grid gap-3 md:grid-cols-7" data-testid="inventory-form">
          <div className="md:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Name</label>
            <input data-testid="inv-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required
              placeholder="60-inch round" className="w-full px-3 py-2 border border-stone-300 rounded" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Shape</label>
            <select data-testid="inv-shape" value={draft.shape} onChange={(e) => setDraft({ ...draft, shape: e.target.value })}
              className="w-full px-3 py-2 border border-stone-300 rounded">
              {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Seats</label>
            <input data-testid="inv-seats" type="number" min={1} value={draft.defaultSeats}
              onChange={(e) => setDraft({ ...draft, defaultSeats: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-300 rounded" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Width (in)</label>
            <input data-testid="inv-width" type="number" min={1} value={draft.widthIn}
              onChange={(e) => setDraft({ ...draft, widthIn: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-300 rounded" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Length (in)</label>
            <input data-testid="inv-length" type="number" min={1} value={draft.lengthIn}
              disabled={draft.shape === "round" || draft.shape === "square"}
              onChange={(e) => setDraft({ ...draft, lengthIn: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-300 rounded disabled:bg-stone-100" />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Qty owned</label>
            <input data-testid="inv-qty" type="number" min={0} value={draft.quantityOwned}
              onChange={(e) => setDraft({ ...draft, quantityOwned: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-stone-300 rounded" />
          </div>
          <div className="md:col-span-7 flex justify-between items-center">
            <label className="flex items-center gap-2 text-sm">
              <input data-testid="inv-active" type="checkbox" checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              Active (show on canvas palette)
            </label>
            <div className="flex gap-2">
              {editingId && (
                <button type="button" onClick={cancel} className="px-4 py-2 border border-stone-300 rounded">
                  Cancel
                </button>
              )}
              <button data-testid="inv-save" type="submit"
                className="px-5 py-2 bg-stone-900 text-white rounded hover:bg-stone-800 flex items-center gap-2">
                {editingId ? <><Save className="h-4 w-4" /> Update</> : <><Plus className="h-4 w-4" /> Add Type</>}
              </button>
            </div>
          </div>
          {err && <div className="md:col-span-7 text-red-600 text-sm">{err}</div>}
        </form>
      )}

      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]" data-testid="inventory-table">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Shape</th>
              <th className="text-left p-3">Seats</th>
              <th className="text-left p-3">Size</th>
              <th className="text-left p-3">Qty</th>
              <th className="text-left p-3">Active</th>
              {isAdmin && <th className="text-left p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {busy && <tr><td colSpan={7} className="p-6 text-center text-stone-500"><Loader2 className="h-5 w-5 inline animate-spin" /></td></tr>}
            {!busy && types.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-stone-500">No table types yet. Add one above to unlock the canvas "Add Table" tool.</td></tr>
            )}
            {types.map(t => (
              <tr key={t.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`inv-row-${t.id}`}>
                <td className="p-3 font-medium">{t.name}</td>
                <td className="p-3 capitalize">{t.shape}</td>
                <td className="p-3">{t.defaultSeats}</td>
                <td className="p-3 text-stone-500">
                  {t.shape === "round"
                    ? `${t.widthIn}" Ø`
                    : `${t.widthIn}" × ${t.lengthIn}"`}
                </td>
                <td className="p-3">{t.quantityOwned}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${t.isActive ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"}`}>
                    {t.isActive ? "Active" : "Hidden"}
                  </span>
                </td>
                {isAdmin && (
                  <td className="p-3 flex gap-2">
                    <button data-testid={`inv-edit-${t.id}`} onClick={() => edit(t)} className="text-xs px-2 py-1 border border-stone-300 rounded hover:bg-stone-100">Edit</button>
                    <button data-testid={`inv-del-${t.id}`} onClick={() => del(t.id)} className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 rounded flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
