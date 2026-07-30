import { cloneElement, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Tooltip — a short label attached to a control.
 *
 * Mirrors the Figma `Tooltips` set (node 2002:65452), a three-axis matrix:
 * Size (Small / Medium / Large) × Theme (Light / Blue / Dark) × Arrow (eight
 * positions). 72 variants in the file; three props here.
 *
 * Opens on hover **and** on keyboard focus, because a tooltip that only answers
 * to a pointer is invisible to half its audience. Escape closes it while the
 * trigger keeps focus.
 *
 * It is not a popover: no interactive content, no links, nothing focusable
 * inside. If the content needs a click, it needs `MenuPanel` instead.
 */

export type TooltipSize = "sm" | "md" | "lg";
export type TooltipTheme = "light" | "brand" | "dark";
export type TooltipPlacement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "right";

export interface TooltipProps {
  /**
   * The label. Keep it to a phrase for `sm`/`md`; `lg` is the only size with
   * room for a sentence.
   */
  content: ReactNode;
  /** Optional bold first line. `lg` only — Figma's Large variant is two-line. */
  title?: ReactNode;
  size?: TooltipSize;
  theme?: TooltipTheme;
  placement?: TooltipPlacement;
  /**
   * Delay before opening, ms. Stops tooltips flashing as the pointer crosses a
   * toolbar. Closing is immediate.
   */
  delay?: number;
  /** Force-open, for documentation and visual review. */
  open?: boolean;
  /** The trigger. Must accept a ref and spread props — a DOM element or `IconButton`. */
  children: ReactElement;
  className?: string;
}

const SIZE: Record<TooltipSize, string> = {
  sm: "px-2 py-1 text-xs rounded-md max-w-56",
  md: "p-2 text-base rounded-md max-w-64",
  lg: "px-3 py-2.5 text-xs rounded-xl w-66",
};

const THEME: Record<TooltipTheme, string> = {
  /* Figma `Size=*, Theme=Light`: white body, `border/neutral/muted` hairline. */
  light: "bg-surface text-primary border border-border-muted",
  /* Figma `background/brand/default`. */
  brand: "bg-brand-surface text-inverse",
  /* Figma `background/neutral/emphasis` #3d4a5c. */
  dark: "bg-emphasis text-inverse",
};

/* Arrow fill has to match the body fill, and for the light theme it also needs
   the hairline on its two outer edges — a rotated square gives both. */
const ARROW_THEME: Record<TooltipTheme, string> = {
  light: "bg-surface border-b border-r border-border-muted",
  brand: "bg-brand-surface",
  dark: "bg-emphasis",
};

/* Panel position relative to the trigger, and the arrow position on the panel.
   The arrow is a 8px square rotated 45deg, so half of it (≈5.6px) pokes out. */
const PLACEMENT: Record<TooltipPlacement, { panel: string; arrow: string }> = {
  top: { panel: "bottom-full left-1/2 -translate-x-1/2 mb-2", arrow: "top-full left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-45" },
  "top-start": { panel: "bottom-full left-0 mb-2", arrow: "top-full left-3 -translate-y-1/2 rotate-45" },
  "top-end": { panel: "bottom-full right-0 mb-2", arrow: "top-full right-3 -translate-y-1/2 rotate-45" },
  bottom: { panel: "top-full left-1/2 -translate-x-1/2 mt-2", arrow: "bottom-full left-1/2 -translate-x-1/2 translate-y-1/2 rotate-[225deg]" },
  "bottom-start": { panel: "top-full left-0 mt-2", arrow: "bottom-full left-3 translate-y-1/2 rotate-[225deg]" },
  "bottom-end": { panel: "top-full right-0 mt-2", arrow: "bottom-full right-3 translate-y-1/2 rotate-[225deg]" },
  left: { panel: "right-full top-1/2 -translate-y-1/2 mr-2", arrow: "left-full top-1/2 -translate-y-1/2 -translate-x-1/2 rotate-[315deg]" },
  right: { panel: "left-full top-1/2 -translate-y-1/2 ml-2", arrow: "right-full top-1/2 -translate-y-1/2 translate-x-1/2 rotate-[135deg]" },
};

export function Tooltip({
  content,
  title,
  size = "md",
  theme = "dark",
  placement = "top",
  delay = 200,
  open,
  children,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const shown = open ?? visible;

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setVisible(false);
  };

  const trigger = cloneElement(children, {
    /* aria-describedby, not labelledby: a tooltip supplements the control's
       name, it does not replace it. */
    "aria-describedby": shown ? id : undefined,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") hide();
      (children.props as { onKeyDown?: (e: React.KeyboardEvent) => void }).onKeyDown?.(e);
    },
  } as Record<string, unknown>);

  const place = PLACEMENT[placement];

  return (
    <span className={cn("relative inline-flex", className)}>
      {trigger}
      {shown && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "pointer-events-none absolute z-[var(--pl-z-tooltip)] w-max",
            "font-medium tracking-body shadow-lg",
            SIZE[size],
            THEME[theme],
            /* `leading-snug` sits AFTER SIZE deliberately. A Tailwind font-size
               utility carries its own default line-height, so `cn()` treats a
               later `text-*` as superseding an earlier explicit `leading-*` —
               put it before SIZE and the snug leading is silently dropped. */
            "leading-snug",
            place.panel,
          )}
        >
          {title && <span className="mb-0.5 block text-base font-semibold">{title}</span>}
          <span className="block">{content}</span>
          <span
            aria-hidden="true"
            className={cn("absolute size-2", ARROW_THEME[theme], place.arrow)}
          />
        </span>
      )}
    </span>
  );
}
