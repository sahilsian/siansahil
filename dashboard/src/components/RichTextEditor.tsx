import { useEffect, useRef } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { docToMarkdown, markdownToHtml, safeHref } from "../lib/markdown";

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  id?: string;
}

/** WYSIWYG editor that reads and writes the websites' markdown subset. */
export function RichTextEditor({ value, onChange, id }: Props) {
  // Remember what we last emitted, so outside changes (e.g. "Discard") reload the
  // editor but our own edits don't reset the cursor.
  const lastEmitted = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto", "tel"],
          isAllowedUri: (url) => safeHref(url) !== null,
        },
      }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class: "prose-editor",
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor }) => {
      const markdown = docToMarkdown(editor.getJSON());
      lastEmitted.current = markdown;
      onChange(markdown);
    },
  });

  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(markdownToHtml(value), { emitUpdate: false });
    }
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            link: editor.isActive("link"),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            canUndo: editor.can().undo(),
            canRedo: editor.can().redo(),
          }
        : null,
  });

  if (!editor || !state) return null;

  const setLink = () => {
    const previous = String(editor.getAttributes("link").href ?? "");
    const input = window.prompt("Link address (e.g. https://example.com or /contact). Leave empty to remove the link.", previous);
    if (input === null) return;
    if (input.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const href = safeHref(input.includes(":") || input.startsWith("/") ? input : `https://${input}`);
    if (!href) {
      window.alert("That link address isn't allowed. Use a web address, an email (mailto:) or a page path like /contact.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const tools = [
    { label: "Bold", icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Link", icon: Link2, active: state.link, run: setLink },
    { label: "Heading", icon: Heading2, active: state.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Subheading", icon: Heading3, active: state.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { label: "Bulleted list", icon: List, active: state.bullet, run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: state.ordered, run: () => editor.chain().focus().toggleOrderedList().run() },
  ];

  return (
    <div className="rounded-lg border border-stone-300 bg-white focus-within:border-stone-500 focus-within:ring-2 focus-within:ring-stone-200">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-stone-200 p-1" role="toolbar" aria-label="Formatting">
        {tools.map(({ label, icon: Icon, active, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            onClick={run}
            className={`rounded-md p-2 ${active ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100"}`}
          >
            <Icon size={18} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-stone-200" />
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
          className="rounded-md p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-30"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
          className="rounded-md p-2 text-stone-700 hover:bg-stone-100 disabled:opacity-30"
        >
          <Redo2 size={18} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
