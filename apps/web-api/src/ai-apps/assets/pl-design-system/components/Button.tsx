import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Button — the product's single action primitive.
 *
 * Mirrors the Figma `Button` component set (node 13053:5771), which is a
 * four-axis matrix:
 *
 *   Type   → `tone`        primary | secondary | success | warning | error
 *   Style  → `appearance`  fill | border | light
 *
 * with one deliberate restriction: **the status tones are Light-only.** Fill and
 * Border carry brand blue and the dark neutral; success, warning and error have
 * neither. See `ButtonActionTone` for why.
 *   Size   → `size`        tiny | xs | sm | md | lg | xl
 *   State  → CSS           normal / hover / active / focus / disabled
 *
 * States are real CSS pseudo-classes rather than props, so the browser drives
 * them. `loading` is the one exception — it is an application state, not a
 * pointer state, so it has to be passed in.
 *
 * Figma's `State=Focus` is expressed through `:focus-visible`, so the ring
 * appears for keyboard users and not on every mouse click.
 */

export type ButtonTone = "primary" | "secondary" | "success" | "warning" | "error";
export type ButtonAppearance = "fill" | "border" | "light";

/**
 * Two families of tone, with different treatments available to each.
 *
 * **Action tones** — brand blue and the dark neutral — are what a button normally
 * is, and they carry all three appearances.
 *
 * **Status tones** — success, warning, error — are `light` only. Neither Fill nor
 * Border is available to them, and the reasoning is the same in both cases: a
 * button is an action, and status colour applied with weight reads as a *state*.
 * A green Fill button looks like a success banner someone made clickable; a red
 * outlined button looks like an error message with a border. The Light treatment
 * puts the colour on a soft tint and the label, which says "this action concerns
 * something successful/risky" without impersonating a status message.
 *
 * The practical consequence: a destructive confirmation is
 * `tone="error" appearance="light"`, and its weight has to come from the content
 * around it — a danger `Alert` in the dialog, `dismissible={false}` on the `Modal`
 * — rather than from the button being loud.
 */
export type ButtonActionTone = Extract<ButtonTone, "primary" | "secondary">;
export type ButtonStatusTone = Exclude<ButtonTone, "primary" | "secondary">;

/** @deprecated Renamed to `ButtonActionTone`, which now also gates Border. */
export type ButtonFillTone = ButtonActionTone;
export type ButtonSize = "tiny" | "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Legacy shorthand, kept so existing call sites keep working. Each value maps
 * onto a tone + appearance pair; prefer those two props in new code.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_MAP: Record<ButtonVariant, { tone: ButtonTone; appearance: ButtonAppearance }> = {
  primary: { tone: "primary", appearance: "fill" },
  secondary: { tone: "secondary", appearance: "border" },
  ghost: { tone: "secondary", appearance: "light" },
  /* Was error/fill, then error/border. Status tones are Light-only, so this is
     where `danger` lands. */
  danger: { tone: "error", appearance: "light" },
};

interface ButtonBase extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ButtonSize;
  /**
   * @deprecated Use `tone` + `appearance`. Retained as a shorthand:
   * primary → primary/fill · secondary → secondary/border ·
   * ghost → secondary/light · danger → error/fill.
   */
  variant?: ButtonVariant;
  /** Swaps the leading icon for a spinner and blocks interaction. */
  loading?: boolean;
  /** Leading icon. Size it to match the button — the button owns the spacing. */
  iconStart?: ReactNode;
  /** Trailing icon — chevrons on menu triggers, for example. */
  iconEnd?: ReactNode;
  fullWidth?: boolean;
}

/**
 * Tone and appearance are a pair, not two independent props: `fill` only accepts
 * the two Fill tones. Writing `tone="error" appearance="fill"` is a type error.
 */
type ToneAndAppearance =
  | {
      /** Visual weight. Figma's `Style` axis. */
      appearance?: "fill" | "border";
      /**
       * Semantic colour. Figma's `Type` axis. Fill and Border carry the action
       * tones only — brand blue and the dark neutral.
       */
      tone?: ButtonActionTone;
    }
  | {
      appearance?: "light";
      tone?: ButtonTone;
    };

export type ButtonProps = ButtonBase & ToneAndAppearance;

/* Heights and type come from the measured Figma variants; `xs` and `sm` sit
   between measured steps and are interpolated (documented in Button.mdx).
   Radius is Figma's `corner radius/md` (8px) up to `md`, and `corner radius/lg`
   (10px) on lg/xl — the latter previously rounded up to 12px because the 10px
   step had no token. It does now. */
const SIZES: Record<ButtonSize, string> = {
  tiny: "h-6 gap-1 px-2 text-2xs rounded-lg",
  xs: "h-8 gap-1 px-2.5 text-xs rounded-lg",
  sm: "h-9 gap-1.5 px-3 text-sm rounded-lg",
  md: "h-10 gap-1 px-4 text-base rounded-lg",
  lg: "h-12 gap-1 px-5 text-md rounded-10",
  xl: "h-14 gap-0.5 px-5 text-lg rounded-10",
};

const BASE =
  "inline-flex items-center justify-center border border-transparent font-medium " +
  "tracking-body whitespace-nowrap cursor-pointer select-none " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "outline-none focus-visible:shadow-action-focus " +
  "disabled:cursor-not-allowed disabled:shadow-none";

/* Fill — solid background, inverse label. Hover darkens; active drops the
   elevation to shadow-card; focus lightens the fill and adds the brand ring. */
const FILL: Record<ButtonActionTone, string> = {
  primary:
    "bg-action text-action-fg shadow-action hover:bg-action-hover " +
    "active:bg-action-active active:shadow-card " +
    "focus-visible:bg-action-focus focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 " +
    "disabled:bg-action-disabled disabled:text-action-fg",
  secondary:
    "bg-primary text-inverse shadow-action-regular hover:opacity-90 " +
    "active:shadow-card focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 " +
    "disabled:bg-surface-sunken disabled:text-disabled",
};

/** Tones that `fill` and `border` can render. Everything else is Light-only. */
const ACTION_TONES = new Set<string>(["primary", "secondary"]);

/* Border — white surface, 1px border, tone-coloured label. Action tones only. */
const BORDER: Record<ButtonActionTone, string> = {
  primary:
    "bg-surface text-brand border-border-brand shadow-action-border hover:bg-selected " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 " +
    "disabled:bg-surface disabled:text-disabled disabled:border-border-subtle",
  secondary:
    "bg-surface text-secondary border-border shadow-action-border hover:bg-hover hover:text-primary " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 " +
    "disabled:bg-surface disabled:text-disabled disabled:border-border-subtle",
};

/* Light — translucent tone tint, no border, tone-coloured label. */
const LIGHT: Record<ButtonTone, string> = {
  primary:
    /* Brand Light uses the brand inner shadow, not the neutral one — Figma has a
       separate effect style for it, so a primary Light button glows rather than
       dents. */
    "bg-selected text-brand shadow-action-light-brand hover:bg-action-neutral-light " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 " +
    "disabled:bg-surface-subtle disabled:text-disabled",
  secondary:
    "bg-action-neutral-light text-secondary shadow-action-light hover:bg-hover hover:text-primary " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2 " +
    "disabled:bg-surface-subtle disabled:text-disabled",
  success:
    "bg-action-success-light text-action-success-fg shadow-action-light hover:opacity-80 " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-action-success focus-visible:ring-offset-2 " +
    "disabled:bg-surface-subtle disabled:text-disabled",
  warning:
    "bg-action-warning-light text-action-warning-fg shadow-action-light hover:opacity-80 " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-action-warning focus-visible:ring-offset-2 " +
    "disabled:bg-surface-subtle disabled:text-disabled",
  error:
    "bg-action-error-light text-action-error-fg shadow-action-light hover:opacity-80 " +
    "active:shadow-none focus-visible:ring-2 focus-visible:ring-action-error focus-visible:ring-offset-2 " +
    "disabled:bg-surface-subtle disabled:text-disabled",
};

/**
 * The appearance a tone gets when the caller does not say.
 *
 * Status tones default to `light` because it is their only treatment; action tones
 * keep `border`, which is what the system has always defaulted to. So
 * `<Button tone="error">Delete</Button>` is valid and renders Light, rather than
 * silently asking for a Border that no longer exists.
 */
function defaultAppearance(tone: ButtonTone): ButtonAppearance {
  return ACTION_TONES.has(tone) ? "border" : "light";
}

/**
 * Resolve the tone/appearance pair to a class string.
 *
 * Types forbid a status tone with `fill` or `border`, but a tone arriving from an
 * API or a CMS is not type-checked — so anything invalid falls back to Light rather
 * than rendering `undefined` into the class list.
 */
function resolveStyles(tone: ButtonTone, appearance: ButtonAppearance): string {
  if (appearance === "light") return LIGHT[tone];
  if (!ACTION_TONES.has(tone)) return LIGHT[tone];
  return appearance === "fill"
    ? FILL[tone as ButtonActionTone]
    : BORDER[tone as ButtonActionTone];
}

const SPINNER_SIZE: Record<ButtonSize, number> = {
  tiny: 12,
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
};

function Spinner({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="shrink-0 animate-spin motion-reduce:animate-none"
    >
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.75" opacity="0.25" />
      <path
        d="M8 1.75A6.25 6.25 0 0 1 14.25 8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Button({
  tone,
  appearance,
  size = "md",
  variant,
  loading = false,
  iconStart,
  iconEnd,
  fullWidth,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonProps) {
  // `variant` supplies defaults; an explicit tone/appearance always wins.
  const legacy = variant ? VARIANT_MAP[variant] : undefined;
  const resolvedTone = tone ?? legacy?.tone ?? "secondary";
  const resolvedAppearance =
    appearance ?? legacy?.appearance ?? defaultAppearance(resolvedTone);

  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        BASE,
        SIZES[size],
        resolveStyles(resolvedTone, resolvedAppearance),
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={SPINNER_SIZE[size]} /> : iconStart}
      {children}
      {!loading && iconEnd}
    </button>
  );
}
