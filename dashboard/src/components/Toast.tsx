import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type Kind = "success" | "error";
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Pop-up confirmations that are always visible, wherever the page is scrolled. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const LIFETIME_MS: Record<Kind, number> = { success: 4500, error: 9000 };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: Kind, text: string) => {
      const id = nextId.current++;
      // Newest last; keep at most four on screen.
      setItems((list) => [...list.filter((t) => t.text !== text), { id, kind, text }].slice(-4));
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME_MS[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((t) => window.clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(() => ({ success: (t) => show("success", t), error: (t) => show("error", t) }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${
              t.kind === "success" ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {t.kind === "success" ? (
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-green-700" />
            ) : (
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-red-700" />
            )}
            <p className="flex-1 font-medium">{t.text}</p>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 opacity-60 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
