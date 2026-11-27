import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, Package } from "lucide-react";
import { api, type Order } from "../api";
import { useSite } from "../session";
import { formatMoney } from "../lib/money";
import { useToast } from "../components/Toast";
import { Alert, Card, PageHeader, Spinner, errorMessage } from "../components/ui";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function Address({ address }: { address: NonNullable<Order["shippingAddress"]> }) {
  const cityLine = [address.city, address.state, address.postal_code].filter(Boolean).join(" ");
  return (
    <address className="text-sm not-italic leading-relaxed text-stone-800">
      {[address.name, address.line1, address.line2, cityLine, address.country].filter(Boolean).map((line, i) => (
        <span key={i} className="block">
          {line}
        </span>
      ))}
    </address>
  );
}

function OrderCard({ order, onToggle, busy }: { order: Order; onToggle: (shipped: boolean) => void; busy: boolean }) {
  const shipped = Boolean(order.shippedAt);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-stone-900">{order.printName}</p>
          <p className="text-sm text-stone-600">
            {when(order.createdAt)} · {formatMoney(order.amountTotalCents, order.currency)}
            {order.shippingCents > 0 && ` (incl. ${formatMoney(order.shippingCents, order.currency)} shipping)`}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${shipped ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
        >
          {shipped ? "Shipped" : "To ship"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Buyer</p>
          <p className="text-stone-800">{order.customerName ?? "No name given"}</p>
          {order.customerEmail && (
            <a href={`mailto:${order.customerEmail}`} className="inline-flex items-center gap-1 text-stone-700 underline">
              <Mail size={14} /> {order.customerEmail}
            </a>
          )}
          {order.customerPhone && <p className="text-stone-700">{order.customerPhone}</p>}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Ship to</p>
          {order.shippingAddress ? <Address address={order.shippingAddress} /> : <p className="text-sm text-stone-500">No address</p>}
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-stone-900"
          checked={shipped}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="text-sm text-stone-800">
          Shipped{order.shippedAt ? ` on ${new Date(order.shippedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}
        </span>
      </label>
    </Card>
  );
}

export function Orders() {
  const { site } = useSite();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["orders", site.id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => api.orders(site.id) });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;

  const toggle = async (order: Order, shipped: boolean) => {
    setBusyId(order.id);
    try {
      await api.setShipped(site.id, order.id, shipped);
      await queryClient.invalidateQueries({ queryKey });
      toast.success(shipped ? "Marked as shipped." : "Marked as not shipped.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const open = data.orders.filter((o) => !o.shippedAt);
  const shown = filter === "open" ? open : data.orders;

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${open.length} to ship · ${data.orders.length} print${data.orders.length === 1 ? "" : "s"} sold in total.`}
      />
      {!data.connected && (
        <div className="mb-5">
          <Alert kind="info">
            New sales aren't being recorded yet: this site's Stripe webhook isn't set up. Stripe still emails you each sale's receipt.
          </Alert>
        </div>
      )}
      <div className="mb-5 inline-flex rounded-lg border border-stone-200 bg-white p-1" role="tablist">
        {(
          [
            ["open", "To ship"],
            ["all", "All orders"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-10 rounded-md px-4 text-sm font-medium ${filter === id ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Alert kind="info">
          <span className="inline-flex items-center gap-2">
            <Package size={16} /> {filter === "open" ? "Nothing to ship right now." : "No orders yet. Print sales show up here."}
          </span>
        </Alert>
      ) : (
        <div className="space-y-4">
          {shown.map((order) => (
            <OrderCard key={order.id} order={order} busy={busyId === order.id} onToggle={(shipped) => toggle(order, shipped)} />
          ))}
        </div>
      )}
    </div>
  );
}
