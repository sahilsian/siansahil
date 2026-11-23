import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Trash2, UserPlus } from "lucide-react";
import { api, type UserListing } from "../api";
import { useSite } from "../session";
import { MIN_PASSWORD, PasswordInput, passwordLength } from "../components/PasswordInput";
import { useToast } from "../components/Toast";
import { Alert, Button, Card, ConfirmDialog, Field, PageHeader, Select, Spinner, TextInput, errorMessage } from "../components/ui";

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The sign-in details, shown once so they can be passed on. */
function Credentials({ username, password, note }: { username: string; password: string; note: string }) {
  const [copied, setCopied] = useState(false);
  const text = `Website dashboard: ${window.location.origin}/dashboard/\nUsername: ${username}\nPassword: ${password}`;
  return (
    <Alert kind="success">
      <p>{note}</p>
      <pre className="mt-2 overflow-x-auto rounded bg-white/70 px-3 py-2 text-xs whitespace-pre-wrap">{text}</pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          className="min-h-9 py-1"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={14} /> {copied ? "Copied" : "Copy details"}
        </Button>
      </div>
      <p className="mt-2 text-xs">
        This is the only time the password is shown. Send it privately (not in the same message as the username if you
        can), and ask them to change it under Account after signing in.
      </p>
    </Alert>
  );
}

export function Superadmin() {
  const { me } = useSite();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fail = (set: (text: string) => void, text: string) => {
    set(text);
    toast.error(text);
  };
  const { data, isLoading, error } = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [siteId, setSiteId] = useState(me.sites[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const [resetting, setResetting] = useState<UserListing | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<{ username: string; password: string } | null>(null);

  const [removing, setRemoving] = useState<UserListing | null>(null);
  const [busyRemove, setBusyRemove] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const siteName = (id: string | null) => (id ? (me.sites.find((s) => s.id === id)?.name ?? id) : "All websites");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["accounts"] });

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreated(null);
    if (passwordLength(password) < MIN_PASSWORD) return fail(setFormError, `Passwords must be at least ${MIN_PASSWORD} characters.`);
    setCreating(true);
    try {
      const { user } = await api.createUser(username, password, siteId, email);
      setCreated({ username: user.username, password });
      toast.success(`Account “${user.username}” created. Copy the sign-in details below.`);
      setUsername("");
      setPassword("");
      setEmail("");
      refresh();
    } catch (err) {
      fail(setFormError, errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const reset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    setResetError(null);
    if (passwordLength(resetPassword) < MIN_PASSWORD) return fail(setResetError, `Passwords must be at least ${MIN_PASSWORD} characters.`);
    setResetBusy(true);
    try {
      await api.resetPassword(resetting.id, resetPassword);
      setResetDone({ username: resetting.username, password: resetPassword });
      toast.success(`Password reset for “${resetting.username}”.`);
      setResetting(null);
      setResetPassword("");
    } catch (err) {
      fail(setResetError, errorMessage(err));
    } finally {
      setResetBusy(false);
    }
  };

  const removeUser = async () => {
    if (!removing) return;
    setBusyRemove(true);
    setListError(null);
    try {
      await api.removeUser(removing.id);
      toast.success(`Removed “${removing.username}”.`);
      refresh();
    } catch (err) {
      fail(setListError, errorMessage(err));
    } finally {
      setBusyRemove(false);
      setRemoving(null);
    }
  };

  return (
    <div>
      <PageHeader title="Superadmin" description="Create sign-ins for the people who edit each website." />
      <div className="space-y-6">
        <Card title="Create an account" description="The person can only edit the website you choose. Use Generate for a strong password.">
          <form onSubmit={create} className="space-y-4" autoComplete="off">
            {formError && <Alert>{formError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Username" hint="3–32 characters: letters, numbers, '.', '_' or '-'.">
                {(id) => (
                  <TextInput
                    id={id}
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Website they can edit">
                {(id) => (
                  <Select id={id} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                    {me.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name ?? s.id}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Password" hint={`At least ${MIN_PASSWORD} characters (${passwordLength(password)} so far).`}>
              {(id) => <PasswordInput id={id} value={password} onChange={setPassword} autoComplete="off" allowGenerate />}
            </Field>
            <Field label="Email (optional)" hint="For your records only. Nothing is sent to it.">
              {(id) => <TextInput id={id} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Button type="submit" busy={creating}>
              <UserPlus size={18} /> Create account
            </Button>
          </form>
          {created && <Credentials {...created} note={`Account “${created.username}” created.`} />}
        </Card>

        {resetDone && <Credentials {...resetDone} note={`Password reset for “${resetDone.username}”. They've been signed out everywhere.`} />}
        {listError && <Alert>{listError}</Alert>}
        {isLoading && <Spinner />}
        {error && <Alert>{errorMessage(error)}</Alert>}
        {data && (
          <Card title="Accounts">
            <ul className="divide-y divide-stone-100">
              {data.users.map((u) => (
                <li key={u.id} className="space-y-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {u.username}
                        {u.role === "superadmin" && (
                          <span className="ml-2 rounded-full bg-stone-900 px-2 py-0.5 text-xs font-medium text-white">superadmin</span>
                        )}
                        {u.id === me.user.id && <span className="ml-2 text-xs text-stone-500">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {siteName(u.tenantId)}
                        {u.email ? ` · ${u.email}` : ""} · created {date(u.createdAt)}
                      </p>
                    </div>
                    {u.id !== me.user.id && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setResetting(resetting?.id === u.id ? null : u);
                            setResetPassword("");
                            setResetError(null);
                            setResetDone(null);
                          }}
                        >
                          <KeyRound size={16} /> Reset password
                        </Button>
                        <Button variant="ghost" className="text-red-700" onClick={() => setRemoving(u)}>
                          <Trash2 size={16} /> Remove
                        </Button>
                      </div>
                    )}
                  </div>
                  {resetting?.id === u.id && (
                    <form onSubmit={reset} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3" autoComplete="off">
                      {resetError && <Alert>{resetError}</Alert>}
                      <Field label={`New password for ${u.username}`} hint="They'll be signed out on every device.">
                        {(id) => (
                          <PasswordInput id={id} value={resetPassword} onChange={setResetPassword} autoComplete="off" allowGenerate />
                        )}
                      </Field>
                      <div className="flex gap-2">
                        <Button type="submit" busy={resetBusy}>
                          Set password
                        </Button>
                        <Button variant="secondary" onClick={() => setResetting(null)}>
                          Cancel
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this account?"
        body={<>“{removing?.username}” will be signed out and won't be able to sign in again. You can create a new account for them later.</>}
        confirmLabel="Remove account"
        busy={busyRemove}
        onConfirm={removeUser}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
