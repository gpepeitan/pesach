import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { Upload, Wand2, X, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

export function BulkImportButton({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const ref = useRef(null);

  const upload = async (f) => {
    setBusy(true); setErr(""); setResult(null);
    try {
      const form = new FormData();
      form.append("file", f);
      const r = await apiClient.post("/guests/bulk-import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(r.data);
      onDone?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button data-testid="bulk-import-btn" onClick={() => setOpen(true)}
        className="px-3 py-2 border border-stone-300 rounded text-sm flex items-center gap-2 hover:bg-stone-50">
        <Upload className="h-4 w-4" /> Bulk Import
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-2 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="bulk-import-modal">
            <div className="p-5 border-b border-stone-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">Bulk Import Guests</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-stone-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="text-sm text-stone-600">
                Upload <b>CSV</b>, <b>Excel (.xlsx)</b>, or <b>QuickBooks export</b>.
                Required columns: <code className="bg-stone-100 px-1 rounded">full_name</code>{" "}
                and one of <code className="bg-stone-100 px-1 rounded">invoice_number</code> or <code className="bg-stone-100 px-1 rounded">family_id</code>.
                Optional: <code className="bg-stone-100 px-1 rounded">party_size</code>,{" "}
                <code className="bg-stone-100 px-1 rounded">near_family_id</code>,{" "}
                <code className="bg-stone-100 px-1 rounded">seating_preferences</code> (semicolon-separated),{" "}
                <code className="bg-stone-100 px-1 rounded">high_chair_count</code>,{" "}
                <code className="bg-stone-100 px-1 rounded">special_notes</code>.
              </div>
              <input ref={ref} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                className="hidden" data-testid="bulk-import-file" />
              <button onClick={() => ref.current?.click()} disabled={busy}
                className="w-full border-2 border-dashed border-stone-300 rounded-lg py-12 hover:bg-stone-50 disabled:opacity-50 flex flex-col items-center justify-center gap-2">
                {busy ? <Loader2 className="h-8 w-8 animate-spin text-stone-500" /> : <Upload className="h-8 w-8 text-stone-500" />}
                <span className="text-stone-700 font-medium">{busy ? "Importing..." : "Choose a file"}</span>
                <span className="text-xs text-stone-500">CSV · XLSX · XLS</span>
              </button>
              {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{err}</div>}
              {result && (
                <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-sm">
                  <div className="flex items-center gap-2 text-emerald-800 font-medium">
                    <CheckCircle className="h-5 w-5" /> Import complete
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <div><div className="text-2xl font-semibold text-emerald-700">{result.inserted}</div><div className="text-xs text-stone-600">inserted</div></div>
                    <div><div className="text-2xl font-semibold text-stone-700">{result.updated}</div><div className="text-xs text-stone-600">updated</div></div>
                    <div><div className="text-2xl font-semibold text-amber-700">{result.skipped}</div><div className="text-xs text-stone-600">skipped</div></div>
                  </div>
                  {result.errors?.length > 0 && (
                    <div className="mt-3 text-xs text-stone-600">
                      <div className="font-medium mb-1">Errors:</div>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function AutoAssignButton({ onDone }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState("");
  const [ballrooms, setBallrooms] = useState([]);
  const [ballroomId, setBallroomId] = useState("");

  useEffect(() => {
    if (open) apiClient.get("/ballrooms").then(r => {
      setBallrooms(r.data);
      if (r.data[0]) setBallroomId(String(r.data[0].id));
    });
  }, [open]);

  const preview = async () => {
    setBusy(true); setErr(""); setPlan(null);
    try {
      const r = await apiClient.post("/seating/auto-assign", {
        ballroomId: ballroomId ? Number(ballroomId) : null,
        apply: false, allowCombine: true,
      });
      setPlan(r.data);
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || "Auto-assign failed");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true); setErr("");
    try {
      const r = await apiClient.post("/seating/auto-assign", {
        ballroomId: ballroomId ? Number(ballroomId) : null,
        apply: true, allowCombine: true,
      });
      setPlan(r.data);
      onDone?.();
    } catch (e) {
      setErr(e?.response?.data?.detail || e.message || "Apply failed");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button data-testid="auto-assign-btn" onClick={() => setOpen(true)}
        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded text-sm flex items-center gap-2">
        <Wand2 className="h-4 w-4" /> Auto-Assign Seating
      </button>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-2 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="auto-assign-modal">
            <div className="p-5 border-b border-stone-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold flex items-center gap-2"><Wand2 className="h-5 w-5" /> Auto-Assign Seating</h3>
              <button onClick={() => { setOpen(false); setPlan(null); }} className="p-1 hover:bg-stone-100 rounded"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div className="text-sm text-stone-600">
                Groups guests by <code className="bg-stone-100 px-1 rounded">family_id</code>, prioritizes adjacency
                (<code className="bg-stone-100 px-1 rounded">near_family_id</code>), fills tables to capacity, and
                combines tables when a family is bigger than one table.
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs uppercase tracking-wide text-stone-500 mb-1">Ballroom (optional)</label>
                  <select data-testid="auto-assign-ballroom" value={ballroomId} onChange={(e) => setBallroomId(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded">
                    <option value="">All ballrooms</option>
                    {ballrooms.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button data-testid="auto-assign-preview" onClick={preview} disabled={busy}
                    className="flex-1 sm:flex-none px-4 py-2 border border-stone-300 rounded hover:bg-stone-50 disabled:opacity-50">
                    Preview Plan
                  </button>
                  <button data-testid="auto-assign-apply" onClick={apply} disabled={busy}
                    className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 flex items-center justify-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply Now
                  </button>
                </div>
              </div>
              {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{err}</div>}
              {plan && (
                <div className="space-y-3">
                  <div className="bg-stone-50 border border-stone-200 rounded p-3 text-sm">
                    <div className="font-medium">{plan.summary}</div>
                    {plan.applied > 0 && <div className="text-emerald-700">✓ {plan.applied} guests seated</div>}
                    {plan.unseatedFamilies > 0 && (
                      <div className="text-amber-700 flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-4 w-4" /> {plan.unseatedFamilies} family group(s) couldn't fit — add more tables.
                      </div>
                    )}
                  </div>
                  <div className="border border-stone-200 rounded overflow-x-auto">
                    <table className="w-full text-sm min-w-[480px]">
                      <thead className="bg-stone-50 border-b border-stone-200">
                        <tr>
                          <th className="text-left p-2">Guest</th>
                          <th className="text-left p-2">Party</th>
                          <th className="text-left p-2">Family</th>
                          <th className="text-left p-2">Table</th>
                          <th className="text-left p-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.plan.map((p, i) => (
                          <tr key={i} className={`border-b border-stone-100 ${p.reason === "no_capacity" ? "bg-red-50" : ""}`}>
                            <td className="p-2 font-medium">{p.guestName}</td>
                            <td className="p-2">{p.partySize}</td>
                            <td className="p-2 text-stone-500">{p.familyId || "—"}</td>
                            <td className="p-2">{p.tableNumber ? `#${p.tableNumber}` : "—"}</td>
                            <td className="p-2 text-xs">
                              <span className={`px-1.5 py-0.5 rounded ${
                                p.reason === "fits_single_table" ? "bg-emerald-100 text-emerald-800" :
                                p.reason === "combined_tables" ? "bg-blue-100 text-blue-800" :
                                "bg-red-100 text-red-800"
                              }`}>{p.reason.replace(/_/g, " ")}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
