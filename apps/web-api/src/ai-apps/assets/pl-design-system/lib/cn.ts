import { extendTailwindMerge } from "tailwind-merge";

/**
 * cn — class joiner with Tailwind conflict resolution.
 *
 * Every component ends with `cn(<own classes>, className)`, which reads as
 * "the caller wins". With a plain join it doesn't: two conflicting utilities
 * both reach the DOM at equal specificity in the same `utilities` layer, so the
 * winner is whichever Tailwind emits *later* — and Tailwind v4 emits
 * alphabetically. Measured against this theme:
 *
 *   <Card className="p-5" />  → 20px   the override happens to win
 *   <Card className="p-0" />  → 16px   the override silently loses to p-4
 *
 * Same asymmetry on radius, and reversing the argument order changes nothing.
 * `tailwind-merge` drops the losing class instead of relying on emission order,
 * so last-argument-wins becomes true rather than coincidental.
 *
 * ── Why the `extend` block ─────────────────────────────────────────────────
 * tailwind-merge groups utilities by Tailwind's *default* scales. Four of this
 * system's namespaces use names that aren't in them, and unknown names are
 * treated as separate groups — so both classes survive and the bug persists
 * exactly where it looks fixed. Each list below was found by asserting that
 * every pair within the family merges to one class (see Card.stories.tsx,
 * "Override contract"). Add to these when a token namespace gains a name:
 *
 *   radius       10, pill        (`--pl-radius-10`, `--pl-radius-pill`)
 *   tracking     title, display, body
 *   font-weight  regular         (Tailwind's own name is `normal`)
 *   shadow       the semantic elevation names, which would otherwise be read
 *                as shadow *colours* and never conflict with shadow-md/lg
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["10", "pill"],
      tracking: ["title", "display", "body"],
      "font-weight": ["regular"],
      shadow: [
        "card",
        "raised",
        "navbar",
        "overlay",
        "action",
        "action-regular",
        "action-border",
        "action-light",
        "action-light-brand",
        "action-focus",
      ],
    },
  },
});

export function cn(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(" "));
}
