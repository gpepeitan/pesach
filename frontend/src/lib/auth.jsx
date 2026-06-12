import { createContext, useContext, useEffect, useState } from "react";
import { apiClient, setToken, getToken } from "./api";

const AuthCtx = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    apiClient.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username, password) => {
    const { data } = await apiClient.post("/auth/login", { username, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const devLogin = async () => {
    const { data } = await apiClient.post("/auth/dev-login");
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await apiClient.post("/auth/logout"); } catch (e) {}
    setToken(null);
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, devLogin, logout }}>{children}</AuthCtx.Provider>;
};

export const useAuth = () => useContext(AuthCtx);
