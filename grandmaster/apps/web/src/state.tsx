import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface Me { user: { id: string; email: string }; profile: any; llm: string | null; engine: string; }
interface AppState { me: Me | null; loading: boolean; refresh: () => Promise<void>; lang: "es" | "en"; }
const Ctx = createContext<AppState>({ me: null, loading: true, refresh: async () => {}, lang: "es" });

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/auth/me")); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const lang = (me?.profile?.language ?? (navigator.language?.startsWith("en") ? "en" : "es")) as "es" | "en";
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  return <Ctx.Provider value={{ me, loading, refresh, lang }}>{children}</Ctx.Provider>;
}
export const useApp = () => useContext(Ctx);
/** Bilingual helper: tr("Spanish text", "English text"). Spanish is the primary language. */
export function useT() { const { lang } = useApp(); return (es: string, en: string) => (lang === "es" ? es : en); }

/** Small data-loading hook with reload. */
export function useData<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
