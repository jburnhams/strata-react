import * as React from "react";
import { CircleAlert, CircleCheck, Eye, EyeOff, KeyRound } from "lucide-react";
import { format } from "../lib/format";
import { cn } from "../lib/utils";
import { controlHeight } from "../lib/control";
import { AsyncButton, useAsyncAction } from "./async-button";
import { AlertDialog } from "./dialog";
import { useFieldControl } from "./field";
import { Button, IconButton } from "./button";

// A credential the server keeps and never shows again (strata-react issue #221, from strata-360's
// two API keys): write-only, so the page must say whether one is set without ever knowing it.
// Every app that holds a credential needs the same states and the same wording, so they live here.
//
// - **Not set / set / editing / saving / failed** are one component's states, not five screens'
//   hand-written words. While set and untouched there is NO input: the field is an `<output>`
//   ("Set", and when, if the app says) that the surrounding `Field`'s label still points at (an
//   output is a labelable element), so nothing a browser, an extension or a test could read holds
//   the secret, and nothing is there to autofill. A stored key's length or characters are never
//   drawn, not even as dots, because a row of dots is its length.
// - **Editing** is a masked input (`type="password"`) with a Show toggle named for what it reveals
//   ("Show API key"). It is `autoComplete="new-password"` (so a password manager does not fill an
//   unrelated login into it) with the common manager opt-outs, and it holds the typed value in
//   state only: not the URL, not `localStorage`, not a log. React Aria has no secret or reveal
//   field (its `TextField` is a plain text input; checked in its types), so the input is the
//   platform's, as `Input` is.
// - **A set field that is untouched reports nothing.** `onChange` is called only with what was
//   typed or pasted (a string), and with `null` when the person cancels or the edit is emptied, so
//   a form that submits `{ key }` never re-sends an empty value over the stored one; "no change"
//   is the absence of a call.
// - **Saving** is `onSave(value)` through `useAsyncAction`, drawn as an `AsyncButton` ("Save key" →
//   "Saving…" → "Saved"); the server's reason for a refusal lands on the `Field` through
//   `fieldErrors` (pass `error` from it), as for every form. A form that saves everything with one
//   button leaves `onSave` out and reads `onChange` instead.
// - **Replace and Remove**. Remove is irreversible and breaks whatever uses the key, so it is an
//   `AlertDialog` whose text names what stops working (`consequence`), and a required one.
// - **Test** asks the app whether the key works (the typed one while editing, the stored one when
//   set: the callback gets `null` and the server uses its own) and the answer sits beside the field
//   as text with an icon, in a polite live region ("Key accepted" or the reason).

/** What a `test` callback returns: the key works, or why it does not. */
export type SecretTestResult = { ok: true; message?: string } | { ok: false; message: string };

/** Props for `SecretField`. */
export type SecretFieldProps = {
  /** What the secret is, singular, lower case or a name: "API key". Names the toggle, the buttons and the dialog. */
  noun: string;
  /** Whether the server holds one. Never the value. */
  isSet: boolean;
  /** When it was set, if the app knows: shown as "Set 12 Nov, 14:02". */
  setAt?: Date | string | number | null;
  /** The typed or pasted value, or `null` when nothing is being entered (cancelled, emptied). Not called while a set field is untouched. */
  onChange?: (value: string | null) => void;
  /** Send the typed value. A rejection's reason is the app's to put on the `Field` through `error`. Leave out when the form's own button saves it. */
  onSave?: (value: string) => Promise<unknown>;
  /** Take the stored one away, after the person confirms. Leave out to offer no Remove. */
  onRemove?: () => void | Promise<unknown>;
  /** What stops working once it is removed, in the product's words: "Map labels stop loading until a new key is set." Required with `onRemove`. */
  consequence?: string;
  /** Ask whether the key works. `null` means the stored one. */
  test?: (value: string | null) => Promise<SecretTestResult>;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
};

const input =
  "w-full min-w-0 rounded-control border border-input bg-background pl-3 pr-1 type-body text-foreground transition-state placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger";

/** A credential the server keeps and never shows again: "Not set", "Set" (no characters, not even its length), a masked entry with a named Show toggle, Replace, a confirmed Remove that says what stops working, and a Test with its result beside it. A set, untouched field reports nothing. */
export function SecretField({ noun, isSet, setAt, onChange, onSave, onRemove, consequence, test, disabled, id: idProp, name, className }: SecretFieldProps) {
  const { field } = useFieldControl();
  const id = idProp ?? field?.id;
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<SecretTestResult | null>(null);
  // A test belongs to the value and the editing state it was asked about: any change after it starts
  // (typing, Cancel, Replace, a new stored key) makes its answer stale, and a stale answer is dropped.
  const asked = React.useRef(0);

  // Typing is the editing state: with nothing set the entry is always shown.
  const entering = editing || !isSet;
  const change = (next: string) => {
    asked.current++;
    setValue(next);
    setResult(null);
    onChange?.(next === "" ? null : next);
  };
  const stop = () => {
    asked.current++;
    setTesting(false);
    setEditing(false);
    setValue("");
    setShown(false);
    setResult(null);
  };
  const cancel = () => {
    stop();
    onChange?.(null);
  };

  // A new value held by the server (set, replaced) ends the edit: the typed text is dropped, not kept in a field that now says "Set".
  const version = `${isSet}|${setAt == null ? "" : new Date(setAt).getTime()}`;
  const [seen, setSeen] = React.useState(version);
  if (seen !== version) {
    setSeen(version);
    if (value !== "" || editing) stop();
  }

  const save = useAsyncAction(async () => {
    await onSave?.(value);
    stop();
  });

  const runTest = async () => {
    if (!test) return;
    const mine = ++asked.current;
    setTesting(true);
    setResult(null);
    let outcome: SecretTestResult;
    try {
      outcome = await test(entering ? value : null);
    } catch (thrown) {
      outcome = { ok: false, message: thrown instanceof Error && thrown.message ? thrown.message : `The ${noun} could not be tested. Try again.` };
    }
    if (mine !== asked.current) return;
    setResult(outcome);
    setTesting(false);
  };

  const describedBy = field?.describedBy;
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      {entering ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative flex min-w-40 flex-1 items-center">
            <input
              id={id}
              name={name}
              type={shown ? "text" : "password"}
              value={value}
              onChange={(e) => change(e.target.value)}
              disabled={disabled}
              autoComplete="new-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              data-form-type="other"
              aria-describedby={describedBy}
              aria-invalid={field?.invalid || undefined}
              placeholder={isSet ? `New ${noun}` : `Paste the ${noun}`}
              className={cn(input, controlHeight.default, "pr-11")}
            />
            <span className="absolute right-0.5">
              <IconButton
                icon={shown ? EyeOff : Eye}
                label={shown ? `Hide ${noun}` : `Show ${noun}`}
                size="sm"
                disabled={disabled}
                onPress={() => setShown((s) => !s)}
              />
            </span>
          </div>
          {onSave && (
            <AsyncButton
              variant="default"
              phase={save.phase}
              error={save.error}
              labels={{ idle: `Save ${noun}`, pending: "Saving…", done: "Saved" }}
              disabled={disabled || value === ""}
              onPress={() => void save.run()}
            />
          )}
          {isSet && (
            <Button variant="ghost" onPress={cancel} disabled={disabled || save.phase === "pending"}>
              Cancel
            </Button>
          )}
          {test && (
            <Button onPress={() => void runTest()} disabled={disabled || testing || value === ""}>
              {testing ? "Testing…" : `Test ${noun}`}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <output id={id} aria-describedby={describedBy} className={cn("flex min-w-48 flex-1 items-center gap-2 whitespace-nowrap rounded-control border border-input bg-muted px-3 type-body text-foreground", controlHeight.default)}>
            <KeyRound aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span>Set</span>
            {setAt != null && <span className="min-w-0 truncate text-muted-foreground">{format.dateTime(setAt)}</span>}
          </output>
          <Button onPress={() => setEditing(true)} disabled={disabled}>
            {`Replace ${noun}`}
          </Button>
          {onRemove && (
            <AlertDialog
              title={`Remove the ${noun}?`}
              description={consequence}
              confirm={`Remove ${noun}`}
              onConfirm={onRemove}
              trigger={<Button variant="ghost" disabled={disabled}>{`Remove ${noun}`}</Button>}
            />
          )}
          {test && (
            <Button onPress={() => void runTest()} disabled={disabled || testing}>
              {testing ? "Testing…" : `Test ${noun}`}
            </Button>
          )}
        </div>
      )}
      <div role="status" className={result ? "flex items-start gap-1.5 type-body-sm" : "sr-only"}>
        {result &&
          (result.ok ? (
            <>
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{result.message ?? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} accepted`}</span>
            </>
          ) : (
            <>
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
              <span className="text-danger">{result.message}</span>
            </>
          ))}
      </div>
    </div>
  );
}
