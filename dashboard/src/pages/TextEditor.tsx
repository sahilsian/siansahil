import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type DocType, type DocumentWithData } from "../api";
import { useSite } from "../session";
import { collectFields, groupFields, setAt, type TextField } from "../lib/fields";
import { RichTextEditor } from "../components/RichTextEditor";
import { Alert, Card, Field, PageHeader, SaveBar, Spinner, TextArea, TextInput, errorMessage } from "../components/ui";

export interface DocRef {
  type: DocType;
  key: string;
  /** Heading shown above this document's fields when a screen edits several. */
  title: string;
}

const refId = (r: { type: string; key: string }) => `${r.type}/${r.key}`;

/** The documents to load, plus any forms they use (contact form, mailing list, ...). */
async function loadDocuments(siteId: string, refs: DocRef[]): Promise<{ ref: DocRef; doc: DocumentWithData }[]> {
  const loaded: { ref: DocRef; doc: DocumentWithData }[] = [];
  const seen = new Set<string>();
  const load = async (ref: DocRef, optional: boolean) => {
    if (seen.has(refId(ref))) return;
    seen.add(refId(ref));
    try {
      loaded.push({ ref, doc: await api.document(siteId, ref.type, ref.key) });
    } catch (e) {
      if (!(optional && e instanceof ApiError && e.status === 404)) throw e;
    }
  };

  for (const ref of refs) await load(ref, false);
  for (const { doc } of [...loaded]) {
    const data = doc.data as any;
    const formIds = new Set<string>();
    for (const block of data.blocks ?? []) if (typeof block?.formId === "string") formIds.add(block.formId);
    if (typeof data.mailing?.formId === "string") formIds.add(data.mailing.formId);
    for (const id of formIds) {
      await load({ type: "form", key: id, title: id === data.mailing?.formId ? "Mailing list form" : `Form: ${id}` }, true);
    }
  }
  return loaded;
}

function FieldEditor({ field, onChange }: { field: TextField; onChange: (value: string) => void }) {
  return (
    <Field label={field.label}>
      {(id) =>
        field.kind === "rich" ? (
          <RichTextEditor id={id} value={field.value} onChange={onChange} />
        ) : field.kind === "multiline" ? (
          <TextArea id={id} value={field.value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <TextInput id={id} value={field.value} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

export function TextEditor({ title, description, refs }: { title?: string; description?: string; refs: DocRef[] }) {
  const { site } = useSite();
  const queryClient = useQueryClient();
  const queryKey = ["text-editor", site.id, ...refs.map(refId)];
  const { data, isLoading, error } = useQuery({ queryKey, queryFn: () => loadDocuments(site.id, refs) });

  // Edited copies, by document id.
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    setDrafts({});
    setMessage(null);
  }, [site.id, refs.map(refId).join()]);

  const dirtyIds = useMemo(
    () =>
      (data ?? [])
        .filter(({ ref, doc }) => drafts[refId(ref)] && JSON.stringify(drafts[refId(ref)]) !== JSON.stringify(doc.data))
        .map(({ ref }) => refId(ref)),
    [data, drafts],
  );
  const dirty = dirtyIds.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (isLoading) return <Spinner />;
  if (error || !data) return <Alert>{errorMessage(error)}</Alert>;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      for (const { ref, doc } of data) {
        const id = refId(ref);
        if (!dirtyIds.includes(id)) continue;
        await api.saveDocument(site.id, ref.type, ref.key, drafts[id], doc.version);
      }
      await queryClient.invalidateQueries({ queryKey });
      setDrafts({});
      setMessage({ kind: "success", text: "Saved. Changes appear on the website within about a minute." });
    } catch (e) {
      // Keep what was saved; reload versions so a retry works.
      await queryClient.invalidateQueries({ queryKey });
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {title && <PageHeader title={title} description={description} />}
      <div className="space-y-6">
        {data.map(({ ref, doc }) => {
          const id = refId(ref);
          const current = drafts[id] ?? doc.data;
          const groups = groupFields(collectFields(ref.type, current));
          return (
            <div key={id} className="space-y-4">
              {data.length > 1 && <h2 className="pt-2 text-lg font-semibold text-stone-800">{ref.title}</h2>}
              {groups.length === 0 && <Alert kind="info">There's no editable text here.</Alert>}
              {groups.map((group) => (
                <Card key={group.section} title={group.section}>
                  {group.fields.map((field) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
                      onChange={(value) => {
                        setMessage(null);
                        setDrafts((d) => ({ ...d, [id]: setAt(d[id] ?? doc.data, field.path, value) }));
                      }}
                    />
                  ))}
                </Card>
              ))}
            </div>
          );
        })}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onDiscard={() => {
          setDrafts({});
          setMessage(null);
        }}
        message={message ? <span className={message.kind === "error" ? "text-red-700" : "text-green-700"}>{message.text}</span> : undefined}
      />
    </div>
  );
}
