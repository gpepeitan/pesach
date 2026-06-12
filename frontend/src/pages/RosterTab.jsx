import { useEffect, useState, useRef } from "react";
import { apiClient } from "@/lib/api";
import { Upload, Plus, Trash2, Search, Loader2, FileSpreadsheet } from "lucide-react";

export default function RosterTab({ isAdmin }) {
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ invoiceNumber: "", fullName: "", email: "", phone: "" });
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    apiClient.get("/roster", { params: search ? { search } : {} })
      .then(r => setList(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const uploadCsv = async (file) => {
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    setImportResult(null); setLoading(true);
    try {
      const { data } = await apiClient.post("/roster/import-csv", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(data); load();
    } catch (err) {
      alert(err?.response?.data?.detail || "Import failed");
    } finally { setLoading(false); fileRef.current && (fileRef.current.value = ""); }
  };

  const addManual = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post("/roster", form);
      setForm({ invoiceNumber: "", fullName: "", email: "", phone: "" }); setShowAdd(false); load();
    } catch (err) { alert(err?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => {
    if (!confirm("Remove this person from the roster?")) return;
    await apiClient.delete(`/roster/${id}`); load();
  };

  return (
    <div className="p-3 sm:p-6" data-testid="roster-tab">
      <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-stone-900">Guest Roster</h2>
          <p className="text-sm text-stone-600">Master list from QuickBooks. Used to power name autocomplete on the intake form.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input ref={fileRef} data-testid="roster-csv-file" type="file" accept=".csv,text/csv" onChange={e => uploadCsv(e.target.files?.[0])} className="hidden" />
            <button data-testid="roster-csv-btn" onClick={() => fileRef.current?.click()}
              className="bg-stone-900 hover:bg-stone-800 text-white text-sm px-4 py-2 rounded flex items-center gap-1">
              <Upload className="h-4 w-4" /> Import CSV
            </button>
            <button data-testid="roster-add-btn" onClick={() => setShowAdd(true)}
              className="border border-stone-300 hover:bg-stone-50 text-sm px-4 py-2 rounded flex items-center gap-1">
              <Plus className="h-4 w-4" /> Add manually
            </button>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4 text-sm text-blue-900 flex items-start gap-2">
        <FileSpreadsheet className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <strong>CSV format:</strong> first row is a header. Required columns: <code className="bg-white px-1 rounded">invoice_number</code> (or <code>invoice</code>) and <code className="bg-white px-1 rounded">full_name</code> (or <code>name</code>). Optional: <code>email</code>, <code>phone</code>, <code>notes</code>. Re-importing updates by invoice number.
        </div>
      </div>

      {importResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 mb-4 text-sm text-emerald-900" data-testid="import-result">
          <strong>Import complete:</strong> {importResult.inserted} added, {importResult.updated} updated, {importResult.skipped} skipped.
          {importResult.errors?.length > 0 && (
            <details className="mt-1"><summary className="cursor-pointer">{importResult.errors.length} error{importResult.errors.length === 1 ? '' : 's'}</summary>
              <ul className="text-xs mt-1 list-disc pl-5">{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {showAdd && (
        <form onSubmit={addManual} className="bg-white border border-stone-200 rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-2">
          <input data-testid="roster-new-invoice" required placeholder="Invoice #" value={form.invoiceNumber}
            onChange={e => setForm({...form, invoiceNumber: e.target.value})} className="px-3 py-2 border border-stone-300 rounded" />
          <input data-testid="roster-new-name" required placeholder="Full name" value={form.fullName}
            onChange={e => setForm({...form, fullName: e.target.value})} className="px-3 py-2 border border-stone-300 rounded" />
          <input data-testid="roster-new-email" placeholder="Email (optional)" value={form.email}
            onChange={e => setForm({...form, email: e.target.value})} className="px-3 py-2 border border-stone-300 rounded" />
          <div className="flex gap-2">
            <button data-testid="roster-new-save" type="submit" className="flex-1 bg-stone-900 text-white rounded">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 text-stone-500">Cancel</button>
          </div>
        </form>
      )}

      <div className="relative mb-3 max-w-md">
        <Search className="absolute left-3 top-3 h-4 w-4 text-stone-400" />
        <input data-testid="roster-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or invoice..."
          className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded" />
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]" data-testid="roster-table">
          <thead className="bg-stone-50 border-b border-stone-200"><tr>
            <th className="text-left p-3">Invoice</th><th className="text-left p-3">Full Name</th>
            <th className="hidden sm:table-cell text-left p-3">Email</th><th className="hidden sm:table-cell text-left p-3">Phone</th>
            <th className="text-right p-3"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-8 text-center text-stone-500"><Loader2 className="h-5 w-5 inline animate-spin" /></td></tr>}
            {!loading && list.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-stone-500">No registered guests yet. Import a CSV to get started.</td></tr>}
            {list.map(r => (
              <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50" data-testid={`roster-row-${r.id}`}>
                <td className="p-3 font-mono text-stone-700">{r.invoiceNumber}</td>
                <td className="p-3 font-medium text-stone-900">{r.fullName}</td>
                <td className="hidden sm:table-cell p-3 text-stone-600 text-xs">{r.email || "—"}</td>
                <td className="hidden sm:table-cell p-3 text-stone-600 text-xs">{r.phone || "—"}</td>
                <td className="p-3 text-right">
                  {isAdmin && (
                    <button data-testid={`roster-del-${r.id}`} onClick={() => remove(r.id)} className="text-stone-400 hover:text-red-600 p-1"><Trash2 className="h-4 w-4" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500 mt-2">{list.length} {list.length === 1 ? "person" : "people"} on the roster</p>
    </div>
  );
}
