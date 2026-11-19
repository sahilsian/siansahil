import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Blocks,
  ExternalLink,
  FileText,
  HelpCircle,
  Home,
  Image as ImageIcon,
  Info,
  LogOut,
  Mail,
  Menu,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../api";
import { useSite } from "../session";
import { humanize } from "../lib/fields";
import { Select } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

/** Sidebar entries for the pages this site actually has. */
function useNavItems() {
  const { site } = useSite();
  const { data: docs } = useQuery({ queryKey: ["documents", site.id], queryFn: () => api.documents(site.id) });
  const pages = new Set((docs ?? []).filter((d) => d.type === "page").map((d) => d.key));
  const hasProducts = (docs ?? []).some((d) => d.type === "product");

  const main: NavItem[] = [];
  if (pages.has("home")) main.push({ to: "/home", label: "Home", icon: Home });
  if (pages.has("products") || hasProducts) main.push({ to: "/gallery", label: "Gallery", icon: ImageIcon });
  if (pages.has("about")) main.push({ to: "/about", label: "About", icon: Info });
  if (pages.has("faq")) main.push({ to: "/faq", label: "FAQ", icon: HelpCircle });
  if (pages.has("contact")) main.push({ to: "/contact", label: "Contact", icon: Mail });
  main.push({ to: "/reusable", label: "Reusable", icon: Blocks });

  const known = new Set(["home", "products", "about", "faq", "contact"]);
  const other: NavItem[] = [...pages]
    .filter((p) => !known.has(p))
    .sort()
    .map((p) => ({ to: `/pages/${p}`, label: humanize(p), icon: FileText }));
  return { main, other, loading: !docs };
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <li key={to}>
          <NavLink
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                isActive ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const { me, site, setSiteId } = useSite();
  const { main, other } = useNavItems();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      queryClient.clear();
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-stone-200 px-4 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Editing</p>
        {me.sites.length > 1 ? (
          <Select
            aria-label="Website"
            className="mt-1"
            value={site.id}
            onChange={(e) => {
              setSiteId(e.target.value);
              navigate("/");
              onNavigate();
            }}
          >
            {me.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name ?? s.id}
              </option>
            ))}
          </Select>
        ) : (
          <p className="mt-1 font-semibold text-stone-900">{site.name ?? site.id}</p>
        )}
        {site.url && (
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-stone-600 underline-offset-2 hover:underline"
          >
            View website <ExternalLink size={14} />
          </a>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Pages">
        <div>
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Pages</p>
          <NavList items={main} onNavigate={onNavigate} />
        </div>
        {other.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Other pages</p>
            <NavList items={other} onNavigate={onNavigate} />
          </div>
        )}
        {me.user.role === "superadmin" && (
          <div>
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Admin</p>
            <NavList items={[{ to: "/superadmin", label: "Superadmin", icon: ShieldCheck }]} onNavigate={onNavigate} />
          </div>
        )}
      </nav>

      <div className="border-t border-stone-200 px-4 py-3">
        <p className="truncate text-sm font-medium text-stone-900">{me.user.username}</p>
        <div className="mt-1 flex flex-wrap gap-x-4">
          <NavLink
            to="/account"
            onClick={onNavigate}
            className="inline-flex min-h-10 items-center gap-2 text-sm text-stone-700 hover:text-stone-900"
          >
            <UserRound size={16} /> Account
          </NavLink>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex min-h-10 items-center gap-2 text-sm text-stone-700 hover:text-stone-900"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { site } = useSite();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-200 bg-white lg:block">
        <Sidebar onNavigate={() => {}} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="-ml-2 rounded-lg p-2.5 text-stone-800 hover:bg-stone-100"
        >
          <Menu size={22} />
        </button>
        <p className="truncate font-semibold">{site.name ?? site.id}</p>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[85%] max-w-xs bg-white shadow-xl">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-2 text-stone-700 hover:bg-stone-100"
            >
              <X size={20} />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}
