import { createContext, useContext, useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Accordion — collapsible sections. Figma describes the set as
 * "Disclosure, FAQ" (`Accordion` component set on the Accordion page).
 *
 * Each header is a real `<button>` with `aria-expanded` and `aria-controls`, so
 * it is reachable by Tab and announced as collapsed or expanded. The content is
 * removed from the DOM when closed rather than hidden with CSS, so a screen
 * reader and a Ctrl+F search agree with what is on screen.
 *
 * Use it to shorten a long page of independent sections. Do not use it to hide
 * something people need — a collapsed section is a section most users never see.
 */

export type AccordionAppearance = "separated" | "contained" | "flush";

interface AccordionCtx {
  open: string[];
  toggle: (v: string) => void;
  appearance: AccordionAppearance;
  baseId: string;
}

const Ctx = createContext<AccordionCtx | null>(null);

export interface AccordionProps {
  /**
   * `single` closes the previously open section, `multiple` leaves it open.
   * Prefer `multiple` — forcing sections closed loses the reader's place.
   */
  mode?: "single" | "multiple";
  /** Values open on first render. */
  defaultOpen?: string[];
  /** Controlled open set. */
  open?: string[];
  onOpenChange?: (open: string[]) => void;
  /**
   * `separated` gives each item its own bordered card, `contained` groups them
   * in one bordered box with dividers, `flush` is dividers only.
   */
  appearance?: AccordionAppearance;
  children: ReactNode;
  className?: string;
}

export function Accordion({
  mode = "multiple",
  defaultOpen = [],
  open,
  onOpenChange,
  appearance = "contained",
  children,
  className,
}: AccordionProps) {
  const [internal, setInternal] = useState<string[]>(defaultOpen);
  const baseId = useId();
  const current = open ?? internal;

  const toggle = (v: string) => {
    const next = current.includes(v)
      ? current.filter((x) => x !== v)
      : mode === "single"
        ? [v]
        : [...current, v];
    if (open === undefined) setInternal(next);
    onOpenChange?.(next);
  };

  const FRAME: Record<AccordionAppearance, string> = {
    separated: "flex flex-col gap-3",
    contained:
      "overflow-hidden rounded-xl border border-border-subtle bg-surface " +
      "divide-y divide-table-border",
    flush: "divide-y divide-table-border",
  };

  return (
    <Ctx.Provider value={{ open: current, toggle, appearance, baseId }}>
      <div className={cn(FRAME[appearance], className)}>{children}</div>
    </Ctx.Provider>
  );
}

export interface AccordionItemProps {
  value: string;
  /** Header label. Keep it a phrase — it is a button, not a paragraph. */
  title: ReactNode;
  children: ReactNode;
  /** Secondary line under the title, e.g. a count or a date. */
  supporting?: ReactNode;
  /** 20px leading icon. */
  icon?: ReactNode;
  /** Right-aligned chip before the chevron — a count or status `Badge`. */
  meta?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function AccordionItem({
  value,
  title,
  children,
  supporting,
  icon,
  meta,
  disabled,
  className,
}: AccordionItemProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("<AccordionItem> must be used inside <Accordion>");

  const isOpen = ctx.open.includes(value);
  const btnId = `${ctx.baseId}-h-${value}`;
  const panelId = `${ctx.baseId}-p-${value}`;

  return (
    <div
      className={cn(
        ctx.appearance === "separated" &&
          "overflow-hidden rounded-xl border border-border-subtle bg-surface",
        className,
      )}
    >
      {/* h3 so the headers form a real outline; the button inside carries the
          expand semantics. */}
      <h3 className="m-0">
        <button
          type="button"
          id={btnId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => ctx.toggle(value)}
          className={cn(
            "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left",
            "transition-colors hover:bg-hover",
            "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:-ring-offset-2",
            "disabled:cursor-not-allowed disabled:text-disabled disabled:hover:bg-transparent",
          )}
        >
          {icon}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-md font-medium tracking-title text-primary">
              {title}
            </span>
            {supporting && (
              <span className="truncate text-xs tracking-body text-tertiary">{supporting}</span>
            )}
          </span>
          {meta}
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className={cn(
              "shrink-0 text-secondary transition-transform duration-200 motion-reduce:transition-none",
              isOpen && "rotate-180",
            )}
          >
            <path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </h3>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={btnId}
          className="px-4 pb-4 pt-0 text-base leading-normal tracking-body text-secondary"
        >
          {children}
        </div>
      )}
    </div>
  );
}
