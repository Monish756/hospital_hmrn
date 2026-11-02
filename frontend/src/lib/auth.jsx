import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const d = await api.me();
      setUser(d.user);
      setProfile(d.profile || null);
    } catch {
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (body) => { const d = await api.login(body); setUser(d.user); setProfile(d.profile); return d; };
  const register = async (body) => { const d = await api.register(body); setUser(d.user); setProfile(d.profile); return d; };
  const logout = async () => { await api.logout(); setUser(null); setProfile(null); };

  return (
    <AuthCtx.Provider value={{ user, profile, loading, login, register, logout, refresh, setProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
