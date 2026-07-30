import { createContext, useContext, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Tabs — switch between sibling views.
 *
 * Mirrors the Figma `Tabs` set (node 14998:31094) and its `_BaseTabitem`
 * (14996:29795), whose axes are Type × State. Figma calls the same component
 * "switch, Tab, Segmented Control", which is why the `fill` appearance looks
 * like a segmented control and the `underline` one like classic tabs — they are
 * one component with different chrome.
 *
 * Selection is a real roving-tabindex tablist: one stop in the tab order, arrow
 * keys to move, Home/End to jump. Panels are wired by id, so a screen reader
 * announces which panel a tab controls.
 */

export type TabsAppearance =
  | "default"
  | "fill"
  | "fill-small"
  | "underline"
  | "bordered"
  | "vertical";

interface TabsCtx {
  value: string;
  setValue: (v: string) => void;
  appearance: TabsAppearance;
  baseId: string;
  register: (v: string, el: HTMLButtonElement | null) => void;
  order: React.MutableRefObject<string[]>;
  refs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
}

const Ctx = createContext<TabsCtx | null>(null);

function useTabs(who: string) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error(`<${who}> must be used inside <Tabs>`);
  return ctx;
}

/* ── root ──────────────────────────────────────────────────────────────── */

export interface TabsProps {
  /** Selected tab value. Omit for an uncontrolled component. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Chrome. Figma's `Type` axis:
   * `default` → Default · `fill` → Fill · `fill-small` → Fill-small ·
   * `underline` → Border Bottom · `bordered` → Double Sided Border ·
   * `vertical` → Left Border.
   */
  appearance?: TabsAppearance;
  children: ReactNode;
  className?: string;
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  appearance = "default",
  children,
  className,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const baseId = useId();
  const order = useRef<string[]>([]);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const current = value ?? internal;

  const setValue = (v: string) => {
    if (value === undefined) setInternal(v);
    onValueChange?.(v);
  };

  const register = (v: string, el: HTMLButtonElement | null) => {
    if (el) {
      refs.current.set(v, el);
      if (!order.current.includes(v)) order.current.push(v);
    } else {
      refs.current.delete(v);
      order.current = order.current.filter((x) => x !== v);
    }
  };

  return (
    <Ctx.Provider value={{ value: current, setValue, appearance, baseId, register, order, refs }}>
      <div
        className={cn(
          appearance === "vertical"
            ? "flex items-start gap-6"
            // items-start so an inline-flex strip (fill, fill-small) hugs its
            // content instead of stretching to the container width.
            : "flex flex-col items-start gap-4",
          className,
        )}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

/* ── list ──────────────────────────────────────────────────────────────── */

/* Chrome that belongs to the strip rather than the items. `underline` and
   `bordered` draw the rule the unselected tabs sit on; the rest draw nothing. */
const LIST: Record<TabsAppearance, string> = {
  default: "flex items-center gap-0",
  fill: "inline-flex items-center gap-1 rounded-xl bg-action-neutral-light p-1",
  "fill-small": "inline-flex items-center gap-0.5 rounded-lg bg-action-neutral-light p-0.5",
  underline: "flex items-center gap-0 border-b border-table-border",
  bordered: "flex items-center gap-0 border-y border-table-border",
  vertical: "flex shrink-0 flex-col items-stretch gap-0 border-l border-table-border",
};

export interface TabListProps {
  /** Accessible name for the strip, e.g. "Prompt status". */
  label: string;
  children: ReactNode;
  className?: string;
}

export function TabList({ label, children, className }: TabListProps) {
  const { appearance, order, refs, value, setValue } = useTabs("TabList");

  const move = (dir: 1 | -1 | "first" | "last") => {
    const list = order.current;
    if (!list.length) return;
    const i = list.indexOf(value);
    const next =
      dir === "first"
        ? list[0]!
        : dir === "last"
          ? list[list.length - 1]!
          : list[(i + dir + list.length) % list.length]!;
    setValue(next);
    /* Selection follows focus, which is the expected model for tabs whose
       panels are cheap to render. */
    refs.current.get(next)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const vertical = appearance === "vertical";
    const prev = vertical ? "ArrowUp" : "ArrowLeft";
    const next = vertical ? "ArrowDown" : "ArrowRight";
    if (e.key === next) { e.preventDefault(); move(1); }
    else if (e.key === prev) { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); move("first"); }
    else if (e.key === "End") { e.preventDefault(); move("last"); }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation={appearance === "vertical" ? "vertical" : "horizontal"}
      onKeyDown={onKeyDown}
      className={cn(
        LIST[appearance],
        /* Horizontal strips scroll rather than wrap: a tab list that wraps to a
           second row stops reading as one control. */
        appearance !== "vertical" && appearance !== "fill" && appearance !== "fill-small" &&
          "overflow-x-auto",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── item ──────────────────────────────────────────────────────────────── */

/* Padding and radius per Figma. `default`/`underline`/`bordered`/`vertical` are
   py-3 (48px tall with the 24px line box); `fill` is py-1.5 (36px) and
   `fill-small` py-0.5 with 14px type (24px). */
const ITEM_BASE =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-1 " +
  "font-medium tracking-title whitespace-nowrap " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "outline-none focus-visible:ring-2 focus-visible:ring-action-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:text-disabled-subtle";

const ITEM: Record<TabsAppearance, { idle: string; on: string }> = {
  default: {
    idle: "px-3 py-3 text-md rounded-md text-secondary hover:bg-hover",
    on: "px-3 py-3 text-md rounded-lg bg-surface text-emphasis border border-action-neutral-light shadow-card",
  },
  fill: {
    idle: "px-3 py-1.5 text-md rounded-lg text-secondary hover:text-primary",
    on: "px-3 py-1.5 text-md rounded-lg bg-surface text-emphasis shadow-md",
  },
  "fill-small": {
    idle: "px-2.5 py-0.5 text-base rounded-md text-secondary hover:text-primary",
    on: "px-2.5 py-0.5 text-base rounded-md bg-surface text-emphasis shadow-md",
  },
  underline: {
    idle:
      "px-3 py-3 text-md text-secondary hover:text-primary " +
      "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent",
    on:
      "px-3 py-3 text-md text-brand " +
      "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-action",
  },
  bordered: {
    idle: "px-3 py-3 text-md text-secondary hover:bg-hover",
    on: "px-3 py-3 text-md bg-brand-subtle text-brand",
  },
  vertical: {
    idle:
      "px-3 py-3 text-md justify-start text-left text-secondary hover:bg-hover " +
      "before:absolute before:inset-y-0 before:-left-px before:w-0.5 before:bg-transparent",
    on:
      "px-3 py-3 text-md justify-start text-left bg-brand-faint text-brand " +
      "before:absolute before:inset-y-0 before:-left-px before:w-0.5 before:bg-action",
  },
};

export interface TabProps {
  /** Identifier, matched by the corresponding `TabPanel`. */
  value: string;
  children: ReactNode;
  /** 20px leading icon — Figma's `Left icon`. */
  icon?: ReactNode;
  /** Trailing count or "New" chip — Figma's `Badges` slot. */
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Tab({ value, children, icon, badge, disabled, className }: TabProps) {
  const ctx = useTabs("Tab");
  const selected = ctx.value === value;
  const style = ITEM[ctx.appearance];

  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      aria-selected={selected}
      /* Roving tabindex: only the selected tab is in the tab order, so Tab
         moves past the whole strip rather than through every item. */
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      ref={(el) => ctx.register(value, disabled ? null : el)}
      onClick={() => ctx.setValue(value)}
      className={cn(ITEM_BASE, selected ? style.on : style.idle, className)}
    >
      {icon}
      <span className="px-1">{children}</span>
      {badge}
    </button>
  );
}

/**
 * TabBadge — the pill in a tab's trailing slot. Brand-tinted, from Figma's
 * `Badges` sub-instance: 2% brand fill, `border/brand/subtle` outline, 14px
 * medium brand label.
 */
export function TabBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-pill border px-2 py-0.5",
        "border-border-brand-subtle bg-brand-faint text-base font-medium tracking-body text-link",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── panel ─────────────────────────────────────────────────────────────── */

export interface TabPanelProps {
  value: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({ value, children, className }: TabPanelProps) {
  const ctx = useTabs("TabPanel");
  if (ctx.value !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-tab-${value}`}
      /* Focusable so that Tab from the strip lands in the panel, which is how a
         keyboard user gets to the content they just selected. */
      tabIndex={0}
      className={cn("min-w-0 flex-1 outline-none focus-visible:ring-2 focus-visible:ring-action-ring", className)}
    >
      {children}
    </div>
  );
}
