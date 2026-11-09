import type { Phase } from "../components/async-button";

// Assertions for the rules a screen keeps, read from what the components draw rather than from
// their class names (strata-react issue #48, from the Tubes Library test, which matched
// `bg-primary`). `Button` marks its variant (`data-variant`), so "one filled button per view"
// (ux-research patterns.md §2, with the BulkBar hand-over: while rows are chosen the bulk action is
// the filled one) is a check a screen test can make after every interaction. `AsyncButton` marks
// its phase (`data-phase`), because it keeps every phase's label in the DOM to hold its width, so
// its text reads "AddAdding…AddedTry again" and only the phase says which one shows.

/** Whether an element is out of the view: hidden, inert or aria-hidden, itself or by an ancestor. */
function outOfView(el: Element) {
  return Boolean(el.closest('[hidden], [inert], [aria-hidden="true"]'));
}

/** An element's name as a person reads it: its `aria-label`, else its text without the parts hidden from screen readers. */
function nameOf(el: Element): string {
  const label = el.getAttribute("aria-label");
  if (label) return label;
  const walk = (node: Node): string =>
    node.nodeType === 3
      ? (node.textContent ?? "")
      : node instanceof Element && node.getAttribute("aria-hidden") === "true"
        ? ""
        : [...node.childNodes].map(walk).join("");
  return walk(el).replace(/\s+/g, " ").trim();
}

/** The filled (`variant="default"`) buttons and links in `container` (default the whole document) that are in view. */
export function filledButtons(container: ParentNode = document.body): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-variant="default"]')].filter((el) => !outOfView(el));
}

/** Throws unless `container` (default the whole document) has exactly one filled button in view; the message names the ones found. */
export function expectOneFilledButton(container: ParentNode = document.body): HTMLElement {
  const found = filledButtons(container);
  if (found.length === 1) return found[0];
  const names = found.map((el) => `"${nameOf(el)}"`).join(", ");
  throw new Error(`Expected one filled button in the view, found ${found.length}${names ? `: ${names}` : ""}.`);
}

/** The phase an `AsyncButton` is in (`idle`, `pending`, `done`, `error`), from the button or any element inside it. */
export function asyncButtonPhase(el: Element): Phase {
  const phase = el.closest("[data-phase]")?.getAttribute("data-phase");
  if (phase === "idle" || phase === "pending" || phase === "done" || phase === "error") return phase;
  throw new Error(`Not an AsyncButton: ${el.outerHTML.slice(0, 120)}`);
}
