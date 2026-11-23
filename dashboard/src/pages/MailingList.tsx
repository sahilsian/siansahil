import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Search, Trash2, UserPlus } from "lucide-react";
import { api, type Subscriber } from "../api";
import { useSite } from "../session";
import { useToast } from "../components/Toast";
import { Alert, Button, Card, ConfirmDialog, PageHeader, Spinner, TextArea, TextInput, errorMessage } from "../components/ui";

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/** Paste an existing list (one per line, or separated by commas/spaces) to add it. */
function AddSubscribers({ siteId, onAdded }: { siteId: string; onAdded: () => unknown }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const emails = text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Add subscribers
      </Button>
    );
  }

  const add = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.addSubscribers(siteId, emails);
      const parts = [`${r.added} added`];
      if (r.alreadySubscribed) parts.push(`${r.alreadySubscribed} already on the list`);
      if (r.invalid.length) parts.push(`${r.invalid.length} not valid`);
      const summary = parts.join(", ") + ".";
      setResult(summary);
      setInvalid(r.invalid);
      // Keep only the addresses that need fixing.
      setText(r.invalid.join("\n"));
      toast.success(summary);
      await onAdded();
    } catch (e) {
      toast.error(errorMessage(e));
      setResult(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Add subscribers"
      description="Paste email addresses, one per line or separated by commas. People already on the list are skipped, and no emails are sent to them."
    >
      <TextArea
        aria-label="Email addresses"
        rows={5}
        placeholder={"name@example.com\nfriend@example.com"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {result && <Alert kind={invalid.length ? "error" : "success"}>{result}{invalid.length > 0 && " Fix the ones left in the box and add them again."}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={add} busy={busy} disabled={emails.length === 0}>
          Add {emails.length || ""} {emails.length === 1 ? "address" : "addresses"}
        </Button>
        <Button variant="secondary" onClick={() => { setOpen(false); setText(""); setResult(null); setInvalid([]); }}>
          Close
        </Button>
      </div>
    </Card>
  );
}

function downloadCsv(siteId: string, subscribers: Subscriber[]) {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = [["email", "subscribed_at"], ...subscribers.map((s) => [s.email, s.subscribedAt])];
  const csv = rows.map((r) => r.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${siteId}-mailing-list-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function MailingList() {
  const { site } = useSite();
  const queryClient = useQueryClient();
  const toast = useToast();
  const queryKey = ["mailing-list", site.id];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => api.mailingList(site.id) });
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.subscribers ?? []).filter((s) => !needle || s.email.includes(needle));
  }, [data, search]);

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;
  const all = data.subscribers;

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.removeSubscriber(site.id, removing);
      toast.success(`Removed ${removing} from the mailing list.`);
      await queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      const text = errorMessage(e);
      setActionError(text);
      toast.error(text);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mailing list"
        description={`${all.length} ${all.length === 1 ? "person has" : "people have"} on the mailing list.`}
        actions={
          all.length > 0 && (
            <>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(all.map((s) => s.email).join(", "));
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                <Copy size={16} /> {copied ? "Copied" : "Copy emails"}
              </Button>
              <Button variant="secondary" onClick={() => downloadCsv(site.id, all)}>
                <Download size={16} /> CSV
              </Button>
            </>
          )
        }
      />
      {actionError && (
        <div className="mb-4">
          <Alert>{actionError}</Alert>
        </div>
      )}
      <div className="mb-5">
        <AddSubscribers siteId={site.id} onAdded={() => queryClient.invalidateQueries({ queryKey })} />
      </div>
      {all.length === 0 ? (
        <Alert kind="info">No one has signed up yet. Sign-ups from the website's mailing list form appear here.</Alert>
      ) : (
        <Card>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-stone-400" />
            <TextInput
              type="search"
              placeholder="Search emails"
              aria-label="Search emails"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <ul className="divide-y divide-stone-100">
            {shown.map((s) => (
              <li key={s.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-stone-900">{s.email}</p>
                  <p className="text-xs text-stone-500">Joined {date(s.subscribedAt)}</p>
                </div>
                <Button variant="ghost" className="text-red-700" aria-label={`Remove ${s.email}`} title="Remove" onClick={() => setRemoving(s.email)}>
                  <Trash2 size={16} />
                </Button>
              </li>
            ))}
            {shown.length === 0 && <li className="py-3 text-sm text-stone-500">No emails match “{search}”.</li>}
          </ul>
        </Card>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this subscriber?"
        body={<>{removing} will be taken off the mailing list. Use this when someone asks to unsubscribe.</>}
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
