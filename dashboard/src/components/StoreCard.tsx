import { useEffect, useState, type MutableRefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Artwork } from "../api";
import { Alert, Card, errorMessage } from "./ui";

/** On/off switch for the original painting. */
function OriginalSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-12 w-full items-center gap-3 rounded-lg border border-stone-200 px-3 text-left hover:bg-stone-50"
    >
      <span className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-green-600" : "bg-stone-300"}`}>
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5.5" : "translate-x-0.5"}`} />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-stone-900">Original available</span>
        <span className={`block text-xs ${on ? "text-green-800" : "text-stone-500"}`}>
          {on ? "Visitors can send an inquiry about the original painting" : "Not offered (sold, or not for sale)"}
        </span>
      </span>
    </button>
  );
}

/**
 * Whether the original painting is offered (by inquiry: no price, visitors ask).
 * Prints are separate listings on the Prints page. The page's Save button applies this.
 */
export function StoreCard({
  siteId,
  artwork,
  submitRef,
  onPendingChange,
}: {
  siteId: string;
  artwork: Artwork;
  /** The page's Save button calls this to apply the change too. Resolves false if it failed. */
  submitRef?: MutableRefObject<(() => Promise<boolean>) | null>;
  /** True while the switch differs from what's live. */
  onPendingChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(Boolean(artwork.store?.originalAvailable));
  const [on, setOn] = useState(live);
  const [error, setError] = useState<string | null>(null);
  const pending = on !== live;

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  const apply = async (): Promise<boolean> => {
    setError(null);
    try {
      const { store } = on ? await api.setOriginalAvailable(siteId, artwork.slug, true) : await api.removeFromStore(siteId, artwork.slug);
      setLive(Boolean(store.originalAvailable));
      await queryClient.invalidateQueries({ queryKey: ["artworks", siteId] });
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };
  if (submitRef) submitRef.current = apply;

  return (
    <Card title="Original" description="Prints are separate listings: create them on the Prints page and choose this painting.">
      {error && <Alert>{error}</Alert>}
      <OriginalSwitch on={on} onChange={setOn} />
      {pending && <p className="text-xs text-stone-500">Press Save changes to apply this.</p>}
    </Card>
  );
}
