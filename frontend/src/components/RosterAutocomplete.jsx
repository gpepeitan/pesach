import { useEffect, useState, useRef } from "react";
import { apiClient } from "@/lib/api";
import { Search, X } from "lucide-react";

/**
 * Roster-backed autocomplete input.
 * - Calls /api/roster/search?q= (public, no auth needed)
 * - When user clicks a suggestion, fires onPick({fullName, invoiceNumber})
 * - When user just types freeform, fires onPick({fullName: text, invoiceNumber: null}) on blur
 */
export default function RosterAutocomplete({
  value, onChange, onPick, excludeInvoice, placeholder, testId, linkedInvoice,
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!value || value.trim().length < 1) { setResults([]); return; }
    if (linkedInvoice && results.length === 0) return; // already linked, don't keep searching
    const t = setTimeout(() => {
      const params = { q: value };
      if (excludeInvoice) params.excludeInvoice = excludeInvoice;
      apiClient.get("/roster/search", { params }).then(r => setResults(r.data)).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, excludeInvoice]);

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = (item) => {
    onPick({ fullName: item.fullName, invoiceNumber: item.invoiceNumber });
    setOpen(false);
  };

  const handleKey = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <input
        data-testid={testId}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHi(0); if (linkedInvoice) onPick({ fullName: e.target.value, invoiceNumber: null }); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-stone-900 ${
          linkedInvoice ? "border-emerald-500 bg-emerald-50" : "border-stone-300"
        }`}
      />
      {linkedInvoice && (
        <div className="absolute right-3 top-2.5 text-xs text-emerald-700 font-medium pointer-events-none">✓ linked</div>
      )}
      {open && results.length > 0 && !linkedInvoice && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-300 rounded-lg shadow-lg max-h-60 overflow-y-auto" data-testid={`${testId}-dropdown`}>
          {results.map((r, i) => (
            <li key={r.id}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(r); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-stone-100 ${i === hi ? "bg-stone-100" : ""}`}
                data-testid={`${testId}-option-${r.id}`}>
                <div className="font-medium text-stone-900">{r.fullName}</div>
                <div className="text-xs text-stone-500">{r.invoiceNumber}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
