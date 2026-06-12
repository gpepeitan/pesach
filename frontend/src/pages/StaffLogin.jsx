import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Loader2, LogIn, Zap } from "lucide-react";

export default function StaffLogin() {
  const { user, login, devLogin } = useAuth();
  const nav = useNavigate();
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/staff" replace />;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(u, p); nav("/staff"); }
    catch (er) { setErr(er?.response?.data?.detail || "Login failed"); }
    finally { setBusy(false); }
  };
  const skip = async () => {
    setBusy(true); setErr("");
    try { await devLogin(); nav("/staff"); }
    catch (er) { setErr(er?.response?.data?.detail || "Dev login not enabled"); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="px-8 py-10">
          <h1 className="text-3xl font-serif text-stone-900 text-center mb-2" data-testid="login-title">Staff Login</h1>
          <p className="text-center text-stone-600 mb-8">Passover Seating Manager</p>
          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Username</label>
              <input data-testid="login-username" value={u} onChange={e => setU(e.target.value)} autoFocus
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Password</label>
              <input data-testid="login-password" type="password" value={p} onChange={e => setP(e.target.value)}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-900" />
            </div>
            {err && <div data-testid="login-error" className="text-red-600 text-sm">{err}</div>}
            <button data-testid="login-submit" type="submit" disabled={busy || !u || !p}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
              Sign in
            </button>
          </form>
          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-xs text-stone-400 uppercase">or</span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>
          <button data-testid="skip-login-btn" onClick={skip} disabled={busy}
            className="w-full border-2 border-dashed border-amber-400 hover:bg-amber-50 text-amber-700 font-medium py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
            <Zap className="h-5 w-5" /> Skip / Dev login
          </button>
          <p className="text-xs text-stone-400 text-center mt-2">Bypass auth for testing. Disable in production by removing DEV_AUTH_BYPASS from backend/.env.</p>
        </div>
      </div>
    </div>
  );
}
