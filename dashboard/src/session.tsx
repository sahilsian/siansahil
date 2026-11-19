import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router";
import { api, ApiError, type Me, type Site } from "./api";
import { Spinner } from "./components/ui";

/** The signed-in user, or null when signed out. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.me();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

interface SiteContextValue {
  me: Me;
  site: Site;
  setSiteId: (id: string) => void;
}

const SiteContext = createContext<SiteContextValue | null>(null);

export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("useSite must be used inside RequireSignIn");
  return value;
}

const STORAGE_KEY = "dashboard.site";

function storedSiteId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Renders children only when signed in; otherwise sends the user to sign in. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { data: me, isLoading, error } = useMe();
  const location = useLocation();
  const [siteId, setSiteIdState] = useState<string | null>(storedSiteId);

  const site = useMemo(() => {
    if (!me || me.sites.length === 0) return null;
    return me.sites.find((s) => s.id === siteId) ?? me.sites[0];
  }, [me, siteId]);

  useEffect(() => {
    if (site) {
      try {
        localStorage.setItem(STORAGE_KEY, site.id);
      } catch {
        /* private mode: just don't remember */
      }
    }
  }, [site]);

  if (isLoading) return <Spinner />;
  if (error) return <p className="p-6 text-red-700">Couldn't load the dashboard. Please refresh the page.</p>;
  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!site) {
    return <p className="p-6 text-stone-700">There are no websites set up yet.</p>;
  }
  return (
    <SiteContext.Provider value={{ me, site, setSiteId: setSiteIdState }}>{children}</SiteContext.Provider>
  );
}
