import { useState } from "react";
import { Eye, EyeOff, Wand2 } from "lucide-react";
import { TextInput } from "./ui";

export const MIN_PASSWORD = 15;

/** 32 symbols so each random byte maps evenly; no 0/o or 1/l look-alikes. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** A strong random password like `kfp7-x2mq-9wzh-c3rt-v8nd` (100 bits). */
export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = Array.from(bytes, (b) => ALPHABET[b % 32]);
  return [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join("")).join("-");
}

export const passwordLength = (p: string) => [...p].length;

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  allowGenerate,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password" | "off";
  allowGenerate?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <TextInput
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-12 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 px-3 text-stone-500 hover:text-stone-800"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {allowGenerate && (
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword());
            setShow(true);
          }}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 text-sm font-medium text-stone-800 hover:bg-stone-50"
        >
          <Wand2 size={16} /> Generate
        </button>
      )}
    </div>
  );
}
