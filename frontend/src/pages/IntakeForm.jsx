import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Loader2, Info, CheckCircle2, User, FileText, Users, MapPin, Baby, AlertCircle, Sparkles } from "lucide-react";
import { apiClient } from "@/lib/api";
import RosterAutocomplete from "@/components/RosterAutocomplete";

export function IntakeForm() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    fullName: "", invoiceNumber: "", partySize: 1,
    seatingPreferences: [], linkedInvoiceNumbers: [],
    highChairNeeded: false, highChairCount: 0, specialNotes: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [invoiceCheck, setInvoiceCheck] = useState(null);
  const [rosterMatch, setRosterMatch] = useState(null);

  useEffect(() => {
    if (!form.invoiceNumber || form.invoiceNumber.length < 3) { setInvoiceCheck(null); setRosterMatch(null); return; }
    const t = setTimeout(() => {
      Promise.all([
        apiClient.get(`/guests/check-invoice/${encodeURIComponent(form.invoiceNumber)}`),
        apiClient.get(`/roster/lookup/${encodeURIComponent(form.invoiceNumber)}`),
      ]).then(([dup, rg]) => {
        setInvoiceCheck(dup.data);
        setRosterMatch(rg.data.found ? rg.data : null);
      }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [form.invoiceNumber]);

  const update = (k, v) => setForm(s => ({ ...s, [k]: v }));

  const addPref = () => {
    if (form.seatingPreferences.length >= 5) return;
    setForm(s => ({ ...s,
      seatingPreferences: [...s.seatingPreferences, ""],
      linkedInvoiceNumbers: [...s.linkedInvoiceNumbers, ""] }));
  };

  const setPref = (i, v) => {
    const arr = [...form.seatingPreferences]; arr[i] = v;
    const links = [...form.linkedInvoiceNumbers]; links[i] = "";
    setForm(s => ({ ...s, seatingPreferences: arr, linkedInvoiceNumbers: links }));
  };

  const pickPref = (i, picked) => {
    const arr = [...form.seatingPreferences]; arr[i] = picked.fullName;
    const links = [...form.linkedInvoiceNumbers]; links[i] = picked.invoiceNumber || "";
    setForm(s => ({ ...s, seatingPreferences: arr, linkedInvoiceNumbers: links }));
  };

  const rmPref = (i) => {
    setForm(s => ({
      ...s,
      seatingPreferences: s.seatingPreferences.filter((_, idx) => idx !== i),
      linkedInvoiceNumbers: s.linkedInvoiceNumbers.filter((_, idx) => idx !== i),
    }));
  };

  const useRosterName = () => { if (rosterMatch) update("fullName", rosterMatch.fullName); };

  const validate = () => {
    const e = {};
    if (form.fullName.trim().length < 2) e.fullName = "Full name is required";
    if (form.invoiceNumber.trim().length < 2) e.invoiceNumber = "Invoice number is required";
    if (form.partySize < 1) e.partySize = "Party size must be at least 1";
    if (form.highChairNeeded && form.highChairCount < 1) e.highChairCount = "Specify number of high chairs";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const cleanPrefs = []; const cleanLinks = [];
      form.seatingPreferences.forEach((p, i) => {
        const trimmed = (p || "").trim();
        if (trimmed) {
          cleanPrefs.push(trimmed);
          cleanLinks.push((form.linkedInvoiceNumbers[i] || "").trim());
        }
      });
      const payload = {
        fullName: form.fullName.trim(),
        invoiceNumber: form.invoiceNumber.trim(),
        partySize: Number(form.partySize),
        seatingPreferences: cleanPrefs,
        linkedInvoiceNumbers: cleanLinks,
        specialNotes: form.specialNotes.trim() || null,
        highChairNeeded: form.highChairNeeded,
        highChairCount: form.highChairNeeded ? Number(form.highChairCount) : 0,
      };
      const { data } = await apiClient.post("/guests", payload);
      const q = new URLSearchParams({
        id: data.guest.id, name: data.guest.fullName, invoice: data.guest.invoiceNumber,
        party: data.guest.partySize, prefs: data.guest.seatingPreferences.join(","),
        highChairs: data.guest.highChairNeeded ? data.guest.highChairCount : 0,
        isDuplicate: data.isDuplicate ? "true" : "false",
      });
      nav(`/confirmation?${q.toString()}`);
    } catch (err) {
      alert("Submission failed: " + (err?.response?.data?.detail || err.message));
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4 md:p-8">
      <div className="max-w-xl w-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-serif text-stone-900 mb-2" data-testid="intake-title">Welcome to Passover</h1>
          <p className="text-stone-600 text-lg">Please complete your seating intake form</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden" data-testid="intake-form">
          <div className="bg-stone-50 px-6 py-5 border-b border-stone-200">
            <h2 className="text-2xl font-serif text-stone-900">Guest Information</h2>
            <p className="text-stone-600 mt-1">We're excited to host you. Let's get your table ready.</p>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Invoice Number</label>
                <input data-testid="input-invoice" value={form.invoiceNumber} onChange={e => update("invoiceNumber", e.target.value)} placeholder="INV-12345"
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 text-lg" />
                <p className="text-stone-500 text-xs mt-1">Found on your booking confirmation</p>
                {errors.invoiceNumber && <p className="text-red-600 text-sm mt-1">{errors.invoiceNumber}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Total Party Size</label>
                <input data-testid="input-partysize" type="number" min={1} value={form.partySize} onChange={e => update("partySize", e.target.value)}
                  className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 text-lg" />
                <p className="text-stone-500 text-xs mt-1">Total guests including children</p>
              </div>
            </div>
            {rosterMatch && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center justify-between gap-3 text-emerald-900 text-sm" data-testid="roster-match-banner">
                <div className="flex gap-2 items-center">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>We found your booking: <strong>{rosterMatch.fullName}</strong></span>
                </div>
                {form.fullName !== rosterMatch.fullName && (
                  <button type="button" onClick={useRosterName} data-testid="use-roster-name"
                    className="text-xs px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded shrink-0">Use this name</button>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Primary Guest Name</label>
              <input data-testid="input-fullname" value={form.fullName} onChange={e => update("fullName", e.target.value)} placeholder="Cohen Family"
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 text-lg" />
              {errors.fullName && <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>}
            </div>
            {invoiceCheck?.hasSubmissions && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-amber-900 text-sm">
                <Info className="h-4 w-4 mt-0.5 shrink-0" />
                <span>We already have a submission for this invoice number. Submitting again will be flagged as a duplicate and reviewed by staff.</span>
              </div>
            )}
            <div className="border-t border-stone-200 pt-6">
              <h3 className="text-lg font-medium text-stone-900">Seating Preferences (Optional)</h3>
              <p className="text-sm text-stone-600 mb-4">Start typing a family name — we'll suggest matches from the program.</p>
              <div className="space-y-2">
                {form.seatingPreferences.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1">
                      <RosterAutocomplete
                        value={p}
                        onChange={(v) => setPref(i, v)}
                        onPick={(picked) => pickPref(i, picked)}
                        excludeInvoice={form.invoiceNumber}
                        placeholder="e.g. Schwartz Family"
                        testId={`input-pref-${i}`}
                        linkedInvoice={form.linkedInvoiceNumbers[i]}
                      />
                    </div>
                    <button data-testid={`button-remove-pref-${i}`} type="button" onClick={() => rmPref(i)}
                      className="p-2 text-stone-500 hover:text-red-600"><Trash2 className="h-5 w-5" /></button>
                  </div>
                ))}
                {form.seatingPreferences.length < 5 && (
                  <button data-testid="button-add-pref" type="button" onClick={addPref}
                    className="w-full border-2 border-dashed border-stone-300 rounded-lg py-3 text-stone-700 hover:bg-stone-50 flex items-center justify-center gap-2">
                    <Plus className="h-4 w-4" /> Add Request
                  </button>
                )}
              </div>
            </div>
            <div className="border-t border-stone-200 pt-6">
              <label className="block text-sm font-medium text-stone-700 mb-2">Special Notes (Optional)</label>
              <textarea data-testid="textarea-special-notes" value={form.specialNotes} onChange={e => update("specialNotes", e.target.value)}
                placeholder="Dietary restrictions, accessibility needs, or anything else we should know..." rows={3}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900" />
            </div>
            <div className="border-t border-stone-200 pt-6 space-y-4">
              <label className="flex items-center justify-between bg-stone-50 rounded-lg p-4 border border-stone-200">
                <div>
                  <div className="font-medium text-stone-900">High Chairs</div>
                  <div className="text-sm text-stone-600">Do you need any high chairs for your table?</div>
                </div>
                <input data-testid="switch-highchair" type="checkbox" checked={form.highChairNeeded}
                  onChange={e => update("highChairNeeded", e.target.checked)} className="h-6 w-12" />
              </label>
              {form.highChairNeeded && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">Number of High Chairs</label>
                  <input data-testid="input-highchair-count" type="number" min={1} value={form.highChairCount}
                    onChange={e => update("highChairCount", e.target.value)}
                    className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900 text-lg" />
                  {errors.highChairCount && <p className="text-red-600 text-sm mt-1">{errors.highChairCount}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="bg-stone-50 px-6 py-5 border-t border-stone-200">
            <button data-testid="button-submit-form" type="submit" disabled={submitting}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 text-lg">
              {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> Submitting...</> : "Submit Seating Request"}
            </button>
          </div>
        </form>
        <p className="text-center text-sm text-stone-500 mt-6">If you have any questions, please contact our concierge team.</p>
      </div>
    </div>
  );
}

export function Confirmation() {
  const nav = useNavigate();
  const p = new URLSearchParams(window.location.search);
  const id = p.get("id");
  if (!id) { nav("/"); return null; }
  const prefsList = (p.get("prefs") || "").split(",").filter(Boolean);
  const isDup = p.get("isDuplicate") === "true";
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-serif text-stone-900 mb-2" data-testid="confirm-title">Request Received</h1>
          <p className="text-stone-600 text-lg">Thank you. We look forward to hosting you.</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
          <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 text-center">
            <h2 className="text-xl font-medium text-stone-900">Submission Summary</h2>
          </div>
          <div className="p-6 space-y-4">
            {isDup && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-amber-900 text-sm">
                <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <span>We noticed a prior submission with this invoice number. A staff member will review this updated request.</span>
              </div>
            )}
            {[
              [User, p.get("name"), "Primary Guest"],
              [FileText, p.get("invoice"), "Invoice Number"],
              [Users, `${p.get("party")} ${Number(p.get("party")) === 1 ? "Guest" : "Guests"}`, "Total Party Size"],
              [MapPin, prefsList.length > 0 ? prefsList.join(", ") : "None listed", "Seating Preferences"],
              [Baby, Number(p.get("highChairs")) > 0 ? `${p.get("highChairs")} needed` : "None needed", "High Chairs"],
            ].map(([Icon, val, label], i) => (
              <div key={i} className="flex items-start">
                <Icon className="w-5 h-5 text-stone-400 mr-3 mt-0.5" />
                <div>
                  <p className="font-medium text-stone-900">{val}</p>
                  <p className="text-sm text-stone-500">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-stone-50 px-6 py-5 border-t border-stone-200">
            <button data-testid="button-return-home" onClick={() => nav("/")}
              className="w-full bg-white border border-stone-300 hover:bg-stone-100 text-stone-900 font-medium py-3 rounded-lg">
              Return to Form
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
