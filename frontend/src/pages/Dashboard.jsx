import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { apiClient } from "@/lib/api";
import { LogOut, Users, ListChecks, GitMerge, ScrollText, UserCog, Search, X, MessageSquare, Check, AlertCircle, Loader2, LayoutGrid, FileSpreadsheet } from "lucide-react";
import TablesTab from "@/pages/TablesTab";
import RosterTab from "@/pages/RosterTab";

const TABS = [
  { id: "guests", label: "Guest List", icon: Users },
  { id: "unassigned", label: "Unassigned Queue", icon: ListChecks },
  { id: "tables", label: "Tables & Seating", icon: LayoutGrid },
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
    <div className="sticky top-0 z-20 bg-white border-b border-stone-200 px-6 py-3" data-testid="stats-bar">
      <div className="flex flex-wrap gap-6">
        {items.map(([l, v]) => (
          <div key={l} className="flex flex-col">
            <span className="text-xs text-stone-500 uppercase tracking-wide">{l}</span>
            <span className="text-xl font-semibold text-stone-900" data-testid={`stat-${l.toLowerCase().replace(/\s|%/g, "-")}`}>{v}</span>
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
  useEffect(() => {
    if (!guest) return;
    apiClient.get(`/guests/${guest.id}/notes`).then(r => setNotes(r.data));
    apiClient.get(`/guests/${guest.id}/preference-resolutions`).then(r => setPrefs(r.data));
  }, [guest]);
  if (!guest) return null;
  const addNote = async () => {
    if (!noteInput.trim()) return;
    const { data } = await apiClient.post(`/guests/${guest.id}/notes`, { note: noteInput });
    setNotes([data, ...notes]); setNoteInput("");
  };
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex justify-end" onClick={onClose} data-testid="guest-drawer">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-stone-200 flex justify-between items-start sticky top-0 bg-white">
          <div>
            <h2 className="text-2xl font-semibold text-stone-900">{guest.fullName}</h2>
            <p className="text-stone-600">{guest.invoiceNumber} · {guest.partySize} guests</p>
            {guest.isDuplicate && <span className="inline-block mt-2 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">DUPLICATE</span>}
          </div>
          <button data-testid="drawer-close" onClick={onClose} className="p-2 hover:bg-stone-100 rounded"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="font-medium text-stone-900 mb-2">Details</h3>
            <dl className="text-sm space-y-1 text-stone-700">
              <div><dt className="inline font-medium">Status: </dt><dd className="inline">{guest.status}</dd></div>
              <div><dt className="inline font-medium">High Chairs: </dt><dd className="inline">{guest.highChairNeeded ? guest.highChairCount : "None"}</dd></div>
              {guest.specialNotes && <div><dt className="inline font-medium">Special: </dt><dd className="inline">{guest.specialNotes}</dd></div>}
              <div><dt className="inline font-medium">Preferences requested: </dt><dd className="inline">{guest.seatingPreferences.join(", ") || "None"}</dd></div>
            </dl>
          </div>
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dupOnly, setDupOnly] = useState(false);
  const [hcOnly, setHcOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const params = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (dupOnly) params.isDuplicate = true;
    if (hcOnly) params.highChair = true;
    apiClient.get("/guests", { params }).then(r => setGuests(r.data)).finally(() => setLoading(false));
  }, [search, statusFilter, dupOnly, hcOnly]);
  return (
    <div className="p-6" data-testid="guests-tab">
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
          <input data-testid="guest-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or invoice..."
            className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded" />
        </div>
        <select data-testid="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-stone-300 rounded">
          <option value="">All statuses</option><option value="unassigned">Unassigned</option>
          <option value="partially_assigned">Partial</option><option value="fully_assigned">Seated</option>
        </select>
        <label className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded cursor-pointer">
          <input data-testid="dup-filter" type="checkbox" checked={dupOnly} onChange={e => setDupOnly(e.target.checked)} /> Duplicates only
        </label>
        <label className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded cursor-pointer">
          <input data-testid="hc-filter" type="checkbox" checked={hcOnly} onChange={e => setHcOnly(e.target.checked)} /> High chairs
        </label>
      </div>
      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm" data-testid="guest-table">
          <thead className="bg-stone-50 border-b border-stone-200"><tr>
            <th className="text-left p-3">Name</th><th className="text-left p-3">Invoice</th>
            <th className="text-left p-3">Party</th><th className="text-left p-3">Status</th>
            <th className="text-left p-3">Flags</th><th className="text-left p-3">Submitted</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-8 text-center text-stone-500"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
            {!loading && guests.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-stone-500">No guests yet</td></tr>}
            {guests.map(g => (
              <tr key={g.id} onClick={() => openGuest(g)} className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer" data-testid={`guest-row-${g.id}`}>
                <td className="p-3 font-medium text-stone-900">{g.fullName}</td>
                <td className="p-3 text-stone-700">{g.invoiceNumber}</td>
                <td className="p-3">{g.partySize}</td>
                <td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-stone-100">{g.status}</span></td>
                <td className="p-3 space-x-1">
                  {g.isDuplicate && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">DUP</span>}
                  {g.highChairNeeded && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">HC×{g.highChairCount}</span>}
                  {g.specialNotes && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">NOTE</span>}
                </td>
                <td className="p-3 text-stone-500 text-xs">{new Date(g.submissionTimestamp).toLocaleString()}</td>
              </tr>
            ))}
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
    <div className="p-6" data-testid="unassigned-tab">
      <h2 className="text-xl font-semibold text-stone-900 mb-4">Unassigned Queue ({list.length})</h2>
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
    <div className="p-6" data-testid="preferences-tab">
      <div className="flex gap-2 mb-4">
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
    <div className="p-6" data-testid="activity-tab">
      <h2 className="text-xl font-semibold text-stone-900 mb-4">Activity Log</h2>
      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200"><tr>
            <th className="text-left p-3">When</th><th className="text-left p-3">Staff</th>
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
    <div className="p-6" data-testid="staff-tab">
      <h2 className="text-xl font-semibold text-stone-900 mb-4">Staff Members</h2>
      <form onSubmit={create} className="bg-white border border-stone-200 rounded-lg p-4 mb-6 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input data-testid="new-staff-username" placeholder="username" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded" />
        <input data-testid="new-staff-display" placeholder="Display name" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded" />
        <input data-testid="new-staff-password" type="password" placeholder="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required
          className="px-3 py-2 border border-stone-300 rounded" />
        <label className="flex items-center gap-2 px-3"><input type="checkbox" checked={form.isAdmin} onChange={e => setForm({...form, isAdmin: e.target.checked})} /> Admin</label>
        <button data-testid="create-staff-btn" type="submit" className="bg-stone-900 text-white px-4 py-2 rounded hover:bg-stone-800">Add Staff</button>
      </form>
      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
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

export default function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [tab, setTab] = useState("guests");
  const [stats, setStats] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!user) return;
    const fetch = () => apiClient.get("/guests/stats").then(r => setStats(r.data));
    fetch();
    const id = setInterval(fetch, 8000);
    return () => clearInterval(id);
  }, [user, tab]);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!user) return <Navigate to="/staff/login" replace />;
  return (
    <div className="min-h-screen bg-stone-100" data-testid="dashboard">
      <header className="bg-stone-900 text-white px-6 py-3 flex justify-between items-center">
        <div className="font-serif text-xl">Passover Seating Manager</div>
        <div className="flex items-center gap-4">
          <span className="text-sm">{user.displayName} {user.isAdmin && <span className="text-amber-300">(admin)</span>}</span>
          <button data-testid="logout-btn" onClick={logout} className="flex items-center gap-1 text-sm hover:text-amber-300"><LogOut className="h-4 w-4" /> Logout</button>
        </div>
      </header>
      <StatsBar stats={stats} />
      <div className="flex bg-white border-b border-stone-200 px-6">
        {TABS.filter(t => t.id !== "staff" || user.isAdmin).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
              className={`px-4 py-3 flex items-center gap-2 text-sm border-b-2 ${tab === t.id ? "border-stone-900 text-stone-900 font-medium" : "border-transparent text-stone-600 hover:text-stone-900"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "guests" && <GuestList openGuest={setSelected} />}
      {tab === "unassigned" && <UnassignedQueue openGuest={setSelected} />}
      {tab === "tables" && <TablesTab isAdmin={user.isAdmin} />}
      {tab === "preferences" && <PreferencesTab />}
      {tab === "roster" && <RosterTab isAdmin={user.isAdmin} />}
      {tab === "activity" && <ActivityLog />}
      {tab === "staff" && user.isAdmin && <StaffAdmin />}
      <GuestDrawer guest={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
