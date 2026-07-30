import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import {
  Overlay,
  OverlayBody,
  OverlayFooter,
  OverlayHeader,
  useOverlayIds,
} from "./Overlay";

/**
 * Drawer — a panel anchored to an edge of the viewport.
 *
 * From the Figma `Drawer` page, and the `Bottom Sheets` half of the
 * `Sidebars & Bottom Sheets` page: `side="bottom"` is the mobile sheet.
 *
 * Shares every behaviour with `Modal` through the `Overlay` primitive — focus
 * trap, focus return, Escape, scroll lock. The difference is purely where the
 * panel is anchored and which axis it sizes on.
 *
 * Choose a Drawer over a Modal when the content is a list, a filter set, or
 * details about something still visible on the page. Choose a Modal when the
 * page behind is irrelevant to the decision.
 */

export type DrawerSide = "right" | "left" | "bottom";
export type DrawerSize = "sm" | "md" | "lg";

/* Horizontal drawers size on width, the bottom sheet on height. */
const SIZE: Record<DrawerSide, Record<DrawerSize, string>> = {
  right: { sm: "w-80", md: "w-100", lg: "w-140" },
  left: { sm: "w-80", md: "w-100", lg: "w-140" },
  bottom: { sm: "h-1/3", md: "h-1/2", lg: "h-[85dvh]" },
};

const ANCHOR: Record<DrawerSide, { container: string; panel: string }> = {
  right: { container: "justify-end", panel: "h-full max-w-full rounded-l-2xl" },
  left: { container: "justify-start", panel: "h-full max-w-full rounded-r-2xl" },
  bottom: { container: "items-end", panel: "w-full rounded-t-2xl" },
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  supporting?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Edge to anchor to. `bottom` is the mobile sheet. */
  side?: DrawerSide;
  size?: DrawerSize;
  dismissible?: boolean;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  supporting,
  children,
  footer,
  side = "right",
  size = "md",
  dismissible = true,
  className,
}: DrawerProps) {
  const { titleId, descId } = useOverlayIds();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      closeOnScrim={dismissible}
      closeOnEscape={dismissible}
      labelledBy={titleId}
      describedBy={supporting ? descId : undefined}
      containerClassName={ANCHOR[side].container}
      panelClassName={cn(
        "flex flex-col bg-surface shadow-overlay",
        ANCHOR[side].panel,
        SIZE[side][size],
        className,
      )}
    >
      {side === "bottom" && (
        /* Grab handle. Decorative — dragging is not implemented, and a handle
           that only looks draggable is worse than none, so it is deliberately
           small and unlabelled: an affordance for "this came from the bottom". */
        <div aria-hidden="true" className="flex justify-center pt-3">
          <span className="h-1 w-10 rounded-pill bg-border" />
        </div>
      )}
      <OverlayHeader
        id={titleId}
        title={title}
        supporting={supporting ? <span id={descId}>{supporting}</span> : undefined}
        onClose={dismissible ? onClose : undefined}
        closeLabel={`Close ${typeof title === "string" ? title : "panel"}`}
      />
      <OverlayBody className="pb-6">{children}</OverlayBody>
      {footer && <OverlayFooter>{footer}</OverlayFooter>}
    </Overlay>
  );
}
