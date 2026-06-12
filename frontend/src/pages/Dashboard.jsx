import { useEffect, useState, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { LogOut, Users, ListChecks, GitMerge, ScrollText, UserCog, Search, X, MessageSquare, Check, AlertCircle, Loader2, LayoutGrid, FileSpreadsheet, Layers, BarChart3, Undo2, Redo2 } from "lucide-react";
import TablesTab from "@/pages/TablesTab";
import RosterTab from "@/pages/RosterTab";
import TableInventoryTab from "@/pages/TableInventoryTab";
import { BulkImportButton, AutoAssignButton } from "@/components/GuestBulkActions";

const TABS = [
  { id: "guests", label: "Guest List", icon: Users },
  { id: "unassigned", label: "Unassigned Queue", icon: ListChecks },
  { id: "tables", label: "Tables & Seating", icon: LayoutGrid },
  { id: "inventory", label: "Table Inventory", icon: Layers },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "preferences", label: "Preferences", icon: GitMerge },
  { id: "roster", label: "Roster", icon: FileSpreadsheet },
  { id: "activity", label: "Activity Log", icon: ScrollText },
  { id: "staff", label: "Staff (Admin)", icon: UserCog },
];

function StatsBar({ stats }) {
  const items = [
    ["Guests", stats?.totalSubmissions ?? 0],
    ["People", stats?.totalPeople ?? 0],
    ["% Seated", `${stats?.percentSeated ?? 0}%`],
    ["% Unassigned", `${stats?.percentUnassigned ?? 0}%`],
    ["Duplicates", stats?.totalDuplicates ?? 0],
    ["Unresolved Prefs", stats?.unresolvedPreferences ?? 0],
    ["High Chairs", stats?.totalHighChairs ?? 0],
  ];
  return (
    <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-3 sm:px-6 py-2 sm:py-3" data-testid="stats-bar">
      <div className="flex gap-4 sm:gap-6 overflow-x-auto -mx-1 px-1 no-scrollbar">
        {items.map(([l, v]) => (
          <div key={l} className="flex flex-col shrink-0">
            <span className="text-[10px] sm:text-xs text-stone-500 uppercase tracking-wide whitespace-nowrap">{l}</span>
            <span className="text-base sm:text-xl font-semibold text-stone-900" data-testid={`stat-${l.toLowerCase().replace(/\s|%/g, "-")}`}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestDrawer({ guest, onClose, onUpdated }) {
  const [notes, setNotes] = useState([]);
  const [noteInput, setNoteInput] = useState("");
  const [prefs, setPrefs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [tables, setTables] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!guest) return;
    apiClient.get(`/guests/${guest.id}/notes`).then(r => setNotes(r.data));
    apiClient.get(`/guests/${guest.id}/preference-resolutions`).then(r => setPrefs(r.data));
    apiClient.get("/tables").then(r => setTables(r.data));
    setDraft({
      invoiceNumber: guest.invoiceNumber,
      tableId: guest.tableId || 0,
      seatingPreferences: [...(guest.seatingPreferences || [])],
      familyId: guest.familyId || "",
      nearFamilyId: guest.nearFamilyId || "",
    });
    setEditing(false); setErr("");
  }, [guest]);

  if (!guest) return null;

  const addNote = async () => {
    if (!noteInput.trim()) return;
    const { data } = await apiClient.post(`/guests/${guest.id}/notes`, { note: noteInput });
    setNotes([data, ...notes]); setNoteInput("");
  };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      const payload = {
        invoiceNumber: draft.invoiceNumber,
        seatingPreferences: draft.seatingPreferences.filter(s => s && s.trim()),
        familyId: draft.familyId || null,
        nearFamilyId: draft.nearFamilyId || null,
      };
      await apiClient.patch(`/guests/${guest.id}`, payload);
      // Table reassignment moves whole family
      if (draft.tableId !== (guest.tableId || 0)) {
        const target = draft.tableId === 0 ? null : Number(draft.tableId);
        await apiClient.post("/guests/family/move", { guestId: guest.id, targetTableId: target });
      }
      setEditing(false);
      onUpdated?.();
    } catch (e) {
      const d = e?.response?.data?.detail;
      setErr(typeof d === "object" ? d.message : (d || "Save failed"));
    } finally { setSaving(false); }
  };

  const updatePref = (i, v) => {
    const next = [...draft.seatingPreferences];
    next[i] = v;
    setDraft({ ...draft, seatingPreferences: next });
  };
  const addPrefRow = () => {
    if (draft.seatingPreferences.length >= 5) return;
    setDraft({ ...draft, seatingPreferences: [...draft.seatingPreferences, ""] });
  };
  const removePref = (i) => {
    const next = draft.seatingPreferences.filter((_, idx) => idx !== i);
    setDraft({ ...draft, seatingPreferences: next });
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex justify-end" onClick={onClose} data-testid="guest-drawer">
      <div className="bg-white w-full sm:max-w-lg h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b border-stone-200 flex justify-between items-start sticky top-0 bg-white">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-stone-900">{guest.fullName}</h2>
            <p className="text-stone-600 text-sm">{guest.invoiceNumber} · {guest.partySize} guests</p>
            {guest.isDuplicate && <span className="inline-block mt-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">DUPLICATE</span>}
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button data-testid="drawer-edit" onClick={() => setEditing(true)}
                className="px-3 py-1.5 text-sm border border-stone-300 rounded hover:bg-stone-50">Edit</button>
            )}
            <button data-testid="drawer-close" onClick={onClose} className="p-2 hover:bg-stone-100 rounded"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
          {!editing && (
            <div>
              <h3 className="font-medium text-stone-900 mb-2">Details</h3>
              <dl className="text-sm space-y-1 text-stone-700">
                <div><dt className="inline font-medium">Status: </dt><dd className="inline">{guest.status}</dd></div>
                <div><dt className="inline font-medium">Table: </dt><dd className="inline">{guest.tableId ? `#${tables.find(t => t.id === guest.tableId)?.tableNumber ?? "?"}` : "unassigned"}</dd></div>
                <div><dt className="inline font-medium">Family ID: </dt><dd className="inline">{guest.familyId || "—"}</dd></div>
                <div><dt className="inline font-medium">Wants near: </dt><dd className="inline">{guest.nearFamilyId || "—"}</dd></div>
                <div><dt className="inline font-medium">High Chairs: </dt><dd className="inline">{guest.highChairNeeded ? guest.highChairCount : "None"}</dd></div>
                {guest.specialNotes && <div><dt className="inline font-medium">Special: </dt><dd className="inline">{guest.specialNotes}</dd></div>}
                <div><dt className="inline font-medium">Preferences requested: </dt><dd className="inline">{guest.seatingPreferences.join(", ") || "None"}</dd></div>
              </dl>
            </div>
          )}
          {editing && draft && (
            <div className="space-y-3" data-testid="guest-edit-form">
              <div>
                <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Invoice Number</label>
                <input data-testid="edit-invoice" value={draft.invoiceNumber}
                  onChange={(e) => setDraft({ ...draft, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm" />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Table assignment (moves whole family)</label>
                <select data-testid="edit-table" value={draft.tableId}
                  onChange={(e) => setDraft({ ...draft, tableId: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm bg-white">
                  <option value={0}>— unassigned —</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>
                      #{t.tableNumber} ({t.seatsTaken}/{t.maxCapacity})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Family ID</label>
                  <input data-testid="edit-family" value={draft.familyId}
                    onChange={(e) => setDraft({ ...draft, familyId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm" placeholder="FAM-001" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Seat near family</label>
                  <input data-testid="edit-near" value={draft.nearFamilyId}
                    onChange={(e) => setDraft({ ...draft, nearFamilyId: e.target.value })}
                    className="w-full px-3 py-2 border border-stone-300 rounded text-sm" placeholder="FAM-002" />
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Seating preferences (up to 5)</label>
                <div className="space-y-1">
                  {draft.seatingPreferences.map((p, i) => (
                    <div key={i} className="flex gap-1">
                      <input value={p} onChange={(e) => updatePref(i, e.target.value)}
                        data-testid={`edit-pref-${i}`}
                        className="flex-1 px-3 py-2 border border-stone-300 rounded text-sm"
                        placeholder="Family / guest name" />
                      <button onClick={() => removePref(i)} className="px-2 text-red-600 hover:bg-red-50 rounded">×</button>
                    </div>
                  ))}
                  {draft.seatingPreferences.length < 5 && (
                    <button onClick={addPrefRow} className="text-xs text-stone-600 hover:text-stone-900">+ add preference</button>
                  )}
                </div>
              </div>
              {err && <div className="bg-red-50 text-red-700 text-sm p-2 rounded border border-red-200">{err}</div>}
              <div className="flex gap-2 pt-2 border-t border-stone-100">
                <button onClick={() => setEditing(false)} className="px-3 py-1.5 border border-stone-300 rounded text-sm">Cancel</button>
                <button data-testid="edit-save" onClick={save} disabled={saving}
                  className="px-3 py-1.5 bg-stone-900 text-white rounded text-sm disabled:opacity-50">
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          )}
          <div>
            <h3 className="font-medium text-stone-900 mb-2">Preference Resolutions</h3>
            <ul className="text-sm space-y-1">
              {prefs.map(p => (
                <li key={p.id} className="flex justify-between border-b border-stone-100 py-1">
                  <span>{p.preferenceName}</span>
                  <span className="text-stone-500">{p.resolutionStatus}</span>
                </li>
              ))}
              {prefs.length === 0 && <li className="text-stone-500">No preferences submitted</li>}
            </ul>
          </div>
          <div>
            <h3 className="font-medium text-stone-900 mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Staff Notes</h3>
            <div className="space-y-2 mb-3">
              {notes.map(n => (
                <div key={n.id} className="bg-stone-50 rounded p-3 text-sm">
                  <div className="text-stone-900">{n.note}</div>
                  <div className="text-stone-500 text-xs mt-1">{n.staffName} · {new Date(n.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {notes.length === 0 && <div className="text-sm text-stone-500">No notes yet</div>}
            </div>
            <div className="flex gap-2">
              <input data-testid="note-input" value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="Add a note..."
                className="flex-1 px-3 py-2 border border-stone-300 rounded" />
              <button data-testid="note-add" onClick={addNote} className="px-4 py-2 bg-stone-900 text-white rounded hover:bg-stone-800">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuestList({ openGuest }) {
  const [guests, setGuests] = useState([]);
  const [tables, setTables] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dupOnly, setDupOnly] = useState(false);
  const [hcOnly, setHcOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moveErr, setMoveErr] = useState("");

  const load = () => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (dupOnly) params.isDuplicate = true;
    if (hcOnly) params.highChair = true;
    Promise.all([
      apiClient.get("/guests", { params }).then(r => setGuests(r.data)),
      apiClient.get("/tables").then(r => setTables(r.data)),
    ]).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, dupOnly, hcOnly]);

  const tableNumberFor = (g) => {
    if (!g.tableId) return null;
    const t = tables.find(x => x.id === g.tableId);
    return t ? t.tableNumber : null;
  };

  const moveFamily = async (guest, newTableId) => {
    setMoveErr("");
    try {
      const target = newTableId === "" ? null : Number(newTableId);
      await apiClient.post("/guests/family/move", { guestId: guest.id, targetTableId: target });
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      setMoveErr(typeof d === "object" ? d.message : (d || "Move failed"));
    }
  };

  return (
    <div className="p-3 sm:p-6" data-testid="guests-tab">
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-full sm:min-w-64">
          <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
          <input data-testid="guest-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or invoice..."
            className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded text-sm" />
        </div>
        <select data-testid="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded text-sm">
          <option value="">All statuses</option><option value="unassigned">Unassigned</option>
          <option value="partially_assigned">Partial</option><option value="fully_assigned">Seated</option>
        </select>
        <label className="hidden sm:flex items-center gap-2 px-3 py-2 border border-stone-300 rounded cursor-pointer text-sm">
          <input data-testid="dup-filter" type="checkbox" checked={dupOnly} onChange={e => setDupOnly(e.target.checked)} /> Duplicates only
        </label>
        <label className="hidden sm:flex items-center gap-2 px-3 py-2 border border-stone-300 rounded cursor-pointer text-sm">
          <input data-testid="hc-filter" type="checkbox" checked={hcOnly} onChange={e => setHcOnly(e.target.checked)} /> High chairs
        </label>
        <BulkImportButton onDone={load} />
        <AutoAssignButton onDone={load} />
      </div>
      {moveErr && (
        <div className="mb-3 bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm" data-testid="move-error">{moveErr}</div>
      )}
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]" data-testid="guest-table">
          <thead className="bg-stone-50 border-b border-stone-200"><tr>
            <th className="text-left p-3">Name</th>
            <th className="hidden sm:table-cell text-left p-3">Invoice</th>
            <th className="text-left p-3">Party</th>
            <th className="hidden md:table-cell text-left p-3">Family</th>
            <th className="text-left p-3">Table</th>
            <th className="hidden sm:table-cell text-left p-3">Status</th>
            <th className="hidden md:table-cell text-left p-3">Flags</th>
            <th className="hidden lg:table-cell text-left p-3">Submitted</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-8 text-center text-stone-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && guests.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-stone-500">No guests yet</td></tr>}
            {guests.map(g => {
              const num = tableNumberFor(g);
              return (
                <tr key={g.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`guest-row-${g.id}`}>
                  <td className="p-3 font-medium text-stone-900 cursor-pointer" onClick={() => openGuest(g)}>{g.fullName}</td>
                  <td className="hidden sm:table-cell p-3 text-stone-700 cursor-pointer" onClick={() => openGuest(g)}>{g.invoiceNumber}</td>
                  <td className="p-3 cursor-pointer" onClick={() => openGuest(g)}>{g.partySize}</td>
                  <td className="hidden md:table-cell p-3 text-stone-500 cursor-pointer" onClick={() => openGuest(g)}>{g.familyId || "—"}</td>
                  <td className="p-3">
                    <select
                      data-testid={`guest-table-select-${g.id}`}
                      value={g.tableId || ""}
                      onChange={(e) => moveFamily(g, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="px-2 py-1 border border-stone-300 rounded text-xs sm:text-sm bg-white"
                      title={g.familyId ? `Moves the entire family ${g.familyId}` : "Moves just this guest"}
                    >
                      <option value="">— unassigned —</option>
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>
                          #{t.tableNumber} ({t.seatsTaken}/{t.maxCapacity})
                        </option>
                      ))}
                    </select>
                    {num && <span className="ml-2 text-xs text-stone-500 hidden sm:inline">#{num}</span>}
                  </td>
                  <td className="hidden sm:table-cell p-3 cursor-pointer" onClick={() => openGuest(g)}><span className="px-2 py-0.5 rounded text-xs bg-stone-100">{g.status}</span></td>
                  <td className="hidden md:table-cell p-3 space-x-1 cursor-pointer" onClick={() => openGuest(g)}>
                    {g.isDuplicate && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">DUP</span>}
                    {g.highChairNeeded && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">HC×{g.highChairCount}</span>}
                    {g.specialNotes && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">NOTE</span>}
                  </td>
                  <td className="hidden lg:table-cell p-3 text-stone-500 text-xs cursor-pointer" onClick={() => openGuest(g)}>{new Date(g.submissionTimestamp).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnassignedQueue({ openGuest }) {
  const [list, setList] = useState([]);
  useEffect(() => { apiClient.get("/guests/unassigned").then(r => setList(r.data)); }, []);
  return (
    <div className="p-3 sm:p-6" data-testid="unassigned-tab">
      <h2 className="text-lg sm:text-xl font-semibold text-stone-900 mb-4">Unassigned Queue ({list.length})</h2>
      <div className="grid gap-3">
        {list.map(g => (
          <div key={g.id} onClick={() => openGuest(g)} className="bg-white border border-stone-200 rounded-lg p-4 hover:shadow cursor-pointer" data-testid={`unassigned-${g.id}`}>
            <div className="flex justify-between">
              <div>
                <div className="font-medium text-stone-900">{g.fullName}</div>
                <div className="text-sm text-stone-600">{g.invoiceNumber} · Party of {g.partySize}</div>
                {g.seatingPreferences.length > 0 && <div className="text-xs text-stone-500 mt-1">Wants: {g.seatingPreferences.join(", ")}</div>}
              </div>
              <div className="text-right text-xs text-stone-500">{new Date(g.submissionTimestamp).toLocaleDateString()}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-stone-500 text-center py-12">All guests assigned 🎉</div>}
      </div>
    </div>
  );
}

function PreferencesTab() {
  const [tab, setTab] = useState("unresolved");
  const [data, setData] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    apiClient.get(`/preferences/${tab}`).then(r => setData(r.data)).finally(() => setBusy(false));
  };
  useEffect(() => { load(); }, [tab]);
  const resolve = async (prefId, status, guestId) => {
    await apiClient.patch(`/preferences/${prefId}/resolve`, { resolutionStatus: status, resolvedGuestId: guestId });
    load();
  };
  return (
    <div className="p-3 sm:p-6" data-testid="preferences-tab">
      <div className="flex flex-wrap gap-2 mb-4">
        {[["unresolved", "Unresolved"], ["mutual", "Mutual Matches"], ["one-way", "One-Way"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`pref-tab-${k}`}
            className={`px-4 py-2 rounded ${tab === k ? "bg-stone-900 text-white" : "bg-white border border-stone-300"}`}>{l}</button>
        ))}
      </div>
      {busy && <div className="text-center py-12 text-stone-500"><Loader2 className="h-5 w-5 inline animate-spin" /></div>}
      {!busy && tab === "unresolved" && (
        <div className="space-y-3">
          {data.map(p => (
            <div key={p.id} className="bg-white border border-stone-200 rounded-lg p-4" data-testid={`unresolved-${p.id}`}>
              <div className="flex justify-between mb-3">
                <div>
                  <div className="font-medium text-stone-900">"{p.preferenceName}"</div>
                  <div className="text-sm text-stone-600">Requested by {p.requesterName}</div>
                </div>
                <button onClick={() => resolve(p.id, "no_match")} className="text-xs px-3 py-1 bg-stone-100 hover:bg-stone-200 rounded">No match</button>
              </div>
              {p.suggestions?.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-stone-500 uppercase">Suggestions:</div>
                  {p.suggestions.map(s => (
                    <div key={s.guestId} className="flex justify-between items-center bg-stone-50 rounded px-3 py-2">
                      <span className="text-sm">{s.name} <span className="text-xs text-stone-500">({Math.round(s.score * 100)}% match)</span></span>
                      <button onClick={() => resolve(p.id, "confirmed", s.guestId)} data-testid={`confirm-pref-${p.id}-${s.guestId}`}
                        className="text-xs px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1">
                        <Check className="h-3 w-3" /> Confirm
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {data.length === 0 && <div className="text-stone-500 text-center py-12">No unresolved preferences</div>}
        </div>
      )}
      {!busy && tab === "mutual" && (
        <div className="grid gap-3">
          {data.map((p, i) => (
            <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="font-medium text-stone-900">{p.a_name} ↔ {p.b_name}</div>
              <div className="text-sm text-stone-600">Party sizes: {p.a_size} + {p.b_size}</div>
            </div>
          ))}
          {data.length === 0 && <div className="text-stone-500 text-center py-12">No mutual matches yet</div>}
        </div>
      )}
      {!busy && tab === "one-way" && (
        <div className="grid gap-3">
          {data.map(p => (
            <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-stone-900">{p.a_name} → {p.b_name}</div>
                <div className="text-sm text-stone-600">Not reciprocated — needs manual review</div>
              </div>
            </div>
          ))}
          {data.length === 0 && <div className="text-stone-500 text-center py-12">No one-way preferences</div>}
        </div>
      )}
    </div>
  );
}

function ActivityLog() {
  const [log, setLog] = useState([]);
  useEffect(() => { apiClient.get("/activity-log").then(r => setLog(r.data)); }, []);
  return (
    <div className="p-3 sm:p-6" data-testid="activity-tab">
      <h2 className="text-lg sm:text-xl font-semibold text-stone-900 mb-4">Activity Log</h2>
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-stone-50 border-b border-stone-200"><tr>
            <th className="text-left p-3 whitespace-nowrap">When</th><th className="text-left p-3">Staff</th>
            <th className="text-left p-3">Action</th><th className="text-left p-3">Details</th>
          </tr></thead>
          <tbody>
            {log.map(a => (
              <tr key={a.id} className="border-b border-stone-100">
                <td className="p-3 text-stone-500 text-xs">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="p-3 font-medium">{a.staffMemberName}</td>
                <td className="p-3"><span className="px-2 py-0.5 bg-stone-100 rounded text-xs">{a.actionType}</span></td>
                <td className="p-3 text-xs text-stone-600">{a.guestId && `guest #${a.guestId}`} {JSON.stringify(a.details).slice(0, 100)}</td>
              </tr>
            ))}
            {log.length === 0 && <tr><td colSpan={4} className="text-center p-8 text-stone-500">No activity yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaffAdmin() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ username: "", password: "", displayName: "", isAdmin: false });
  const load = () => apiClient.get("/staff").then(r => setList(r.data));
  useEffect(() => { load(); }, []);
  const create = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post("/staff", form);
      setForm({ username: "", password: "", displayName: "", isAdmin: false }); load();
    } catch (err) { alert(err?.response?.data?.detail || "Failed"); }
  };
  const toggle = async (id, field, val) => {
    await apiClient.patch(`/staff/${id}`, { [field]: val }); load();
  };
  return (
    <div className="p-3 sm:p-6" data-testid="staff-tab">
      <h2 className="text-lg sm:text-xl font-semibold text-stone-900 mb-4">Staff Members</h2>
      <form onSubmit={create} className="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input data-testid="new-staff-username" placeholder="username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded text-sm" />
        <input data-testid="new-staff-display" placeholder="Display name" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded text-sm" />
        <input data-testid="new-staff-password" type="password" placeholder="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded text-sm" />
        <label className="flex items-center gap-2 px-3 text-sm"><input type="checkbox" checked={form.isAdmin} onChange={e => setForm({...form, isAdmin: e.target.checked})} /> Admin</label>
        <button data-testid="create-staff-btn" type="submit" className="bg-stone-900 text-white px-4 py-2 rounded hover:bg-stone-800 text-sm">Add Staff</button>
      </form>
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-stone-50 border-b"><tr>
            <th className="text-left p-3">Username</th><th className="text-left p-3">Display</th>
            <th className="text-left p-3">Admin</th><th className="text-left p-3">Active</th><th className="text-left p-3">Last Login</th>
          </tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id} className="border-b border-stone-100">
                <td className="p-3 font-medium">{s.username}</td>
                <td className="p-3">{s.displayName}</td>
                <td className="p-3"><input type="checkbox" checked={s.isAdmin} onChange={e => toggle(s.id, "isAdmin", e.target.checked)} /></td>
                <td className="p-3"><input type="checkbox" checked={s.isActive} onChange={e => toggle(s.id, "isActive", e.target.checked)} /></td>
                <td className="p-3 text-xs text-stone-500">{s.lastLogin ? new Date(s.lastLogin).toLocaleString() : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    const load = () => apiClient.get("/analytics/summary").then((r) => setData(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, []);
  if (!data) return (
    <div className="p-12 text-center text-stone-500" data-testid="analytics-loading">
      <Loader2 className="h-6 w-6 animate-spin inline" />
    </div>
  );
  const cards = [
    { label: "Total submissions", value: data.totalSubmissions, dt: "analytics-submissions" },
    { label: "Total people (party sizes)", value: data.totalPeople, dt: "analytics-people" },
    { label: "Fully seated", value: data.seatedSubmissions, dt: "analytics-seated" },
    { label: "Unassigned", value: data.unassignedSubmissions, dt: "analytics-unassigned" },
    { label: "Partially assigned", value: data.partialSubmissions, dt: "analytics-partial" },
    { label: "Table count", value: data.tableCount, dt: "analytics-tables" },
    { label: "Total capacity", value: data.totalCapacity, dt: "analytics-capacity" },
    { label: "Table utilization", value: `${data.tableUtilizationPct}%`, dt: "analytics-utilization" },
    { label: "High chairs requested", value: data.highChairsRequested, dt: "analytics-high-chairs" },
    { label: "Active conflicts", value: data.activeConflicts, dt: "analytics-conflicts",
      highlight: data.activeConflicts > 0 ? "bg-red-50 border-red-200 text-red-800" : "" },
  ];
  return (
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="analytics-tab">
      <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Event Analytics</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {cards.map((c) => (
          <div key={c.dt} data-testid={c.dt}
            className={`bg-white border border-stone-200 rounded-lg p-4 ${c.highlight || ""}`}>
            <div className="text-xs uppercase tracking-wide text-stone-500">{c.label}</div>
            <div className="text-3xl font-semibold mt-1">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-sm text-stone-600">
        {data.seatedPeople} of {data.totalPeople} people seated · canvas-level conflicts surface as red dot badges on affected tables.
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState("guests");
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState({ undoAvailable: 0, redoAvailable: 0 });
  const [bump, setBump] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetch = () => apiClient.get("/guests/stats").then(r => setStats(r.data));
    fetch();
    const id = setInterval(fetch, 8000);
    return () => clearInterval(id);
  }, [user, tab]);

  // Poll the undo/redo stack so the toolbar buttons reflect availability
  useEffect(() => {
    if (!user) return;
    const fetch = () => apiClient.get("/history/stack").then(r => setHistory(r.data)).catch(() => {});
    fetch();
    const id = setInterval(fetch, 4000);
    return () => clearInterval(id);
  }, [user, bump]);

  const undo = useCallback(async () => {
    try { await apiClient.post("/history/undo"); setBump((b) => b + 1); }
    catch (e) { /* ignore */ }
  }, []);
  const redo = useCallback(async () => {
    try { await apiClient.post("/history/redo"); setBump((b) => b + 1); }
    catch (e) { /* ignore */ }
  }, []);

  // Global Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z keyboard shortcuts (typing inputs ignored)
  useEffect(() => {
    if (!user) return;
    const isTyping = (el) => {
      if (!el) return false;
      const t = (el.tagName || "").toLowerCase();
      return t === "input" || t === "textarea" || t === "select" || el.isContentEditable;
    };
    const onKey = (e) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((mod && (e.key === "y" || e.key === "Y")) ||
               (mod && e.shiftKey && (e.key === "z" || e.key === "Z"))) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, undo, redo]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/staff/login" replace />;
  return (
    <div className="min-h-screen bg-stone-100" data-testid="dashboard">
      <header className="bg-stone-900 text-white px-3 sm:px-6 py-2 sm:py-3 flex justify-between items-center gap-2">
        <div className="font-serif text-base sm:text-xl whitespace-nowrap truncate">Passover Seating</div>
        <div className="flex items-center gap-1 sm:gap-3 shrink-0">
          <button onClick={undo} disabled={!history.undoAvailable}
            title={`Undo (Ctrl+Z) — ${history.undoAvailable} available`}
            data-testid="global-undo"
            className="p-1.5 rounded hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed">
            <Undo2 className="h-4 w-4" />
          </button>
          <button onClick={redo} disabled={!history.redoAvailable}
            title={`Redo (Ctrl+Y) — ${history.redoAvailable} available`}
            data-testid="global-redo"
            className="p-1.5 rounded hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed">
            <Redo2 className="h-4 w-4" />
          </button>
          <span className="hidden sm:inline text-sm">{user.displayName} {user.isAdmin && <span className="text-amber-300">(admin)</span>}</span>
          <button data-testid="logout-btn" onClick={logout}
            className="flex items-center gap-1 text-xs sm:text-sm hover:text-amber-300 px-1 sm:px-2">
            <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>
      <StatsBar stats={stats} />
      <div className="flex bg-white border-b border-stone-200 px-2 sm:px-6 overflow-x-auto no-scrollbar">
        {TABS.filter(t => t.id !== "staff" || user.isAdmin).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
              className={`px-3 sm:px-4 py-3 flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm border-b-2 whitespace-nowrap shrink-0 ${tab === t.id ? "border-stone-900 text-stone-900 font-medium" : "border-transparent text-stone-600 hover:text-stone-900"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "guests" && <GuestList openGuest={setSelected} />}
      {tab === "unassigned" && <UnassignedQueue openGuest={setSelected} />}
      {tab === "tables" && <TablesTab isAdmin={user.isAdmin} />}
      {tab === "inventory" && <TableInventoryTab isAdmin={user.isAdmin} />}
      {tab === "analytics" && <AnalyticsTab />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "roster" && <RosterTab isAdmin={user.isAdmin} />}
      {tab === "activity" && <ActivityLog />}
      {tab === "staff" && user.isAdmin && <StaffAdmin />}
      <GuestDrawer guest={selected} onClose={() => setSelected(null)} onUpdated={() => setBump((b) => b + 1)} />
    </div>
  );
}
