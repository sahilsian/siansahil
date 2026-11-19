import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useSite } from "../session";
import { MIN_PASSWORD, PasswordInput, passwordLength } from "../components/PasswordInput";
import { Alert, Button, Card, Field, PageHeader, errorMessage } from "../components/ui";

export function Account() {
  const { me } = useSite();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (passwordLength(next) < MIN_PASSWORD) return setError(`Your new password must be at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Account" description={`Signed in as ${me.user.username}.`} />
      <Card title="Change password" description="You'll stay signed in here; any other devices will be signed out.">
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {done && <Alert kind="success">Password changed.</Alert>}
          {/* Lets password managers know which account this is for. */}
          <input type="text" name="username" autoComplete="username" value={me.user.username} readOnly hidden />
          <Field label="Current password">
            {(id) => <PasswordInput id={id} value={current} onChange={setCurrent} autoComplete="current-password" />}
          </Field>
          <Field
            label="New password"
            hint={`At least ${MIN_PASSWORD} characters (${passwordLength(next)} so far). A few random words make a strong, memorable password.`}
          >
            {(id) => <PasswordInput id={id} value={next} onChange={setNext} autoComplete="new-password" />}
          </Field>
          <Field
            label="Confirm new password"
            hint={confirm && confirm !== next ? <span className="text-red-700">The passwords don't match.</span> : undefined}
          >
            {(id) => <PasswordInput id={id} value={confirm} onChange={setConfirm} autoComplete="new-password" />}
          </Field>
          <Button type="submit" busy={busy}>
            Change password
          </Button>
        </form>
      </Card>
    </div>
  );
}
