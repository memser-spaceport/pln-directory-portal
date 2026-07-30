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
 * Modal — a centred dialog that interrupts the page.
 *
 * From the Figma `Modals` page. Behaviour (focus trap, focus return, Escape,
 * scroll lock, scrim) comes from the shared `Overlay` primitive, which `Drawer`
 * also uses — see Overlay.tsx.
 *
 * Reach for it sparingly. A modal is the most expensive component in a design
 * system: it takes the page away. Confirmations that are undoable belong in a
 * `Toast` with an undo action, and forms longer than a few fields belong on a
 * page of their own.
 */

export type ModalSize = "sm" | "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  sm: "w-full max-w-100",
  md: "w-full max-w-140",
  lg: "w-full max-w-180",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Dialog heading. Wired to `aria-labelledby`, so it is required. */
  title: ReactNode;
  /** Line under the title. Wired to `aria-describedby`. */
  supporting?: ReactNode;
  children: ReactNode;
  /** Buttons. Primary action last — it sits closest to the reader's thumb. */
  footer?: ReactNode;
  size?: ModalSize;
  /**
   * Set false when the dialog must be resolved deliberately — an unsaved form,
   * a destructive confirmation. Escape is disabled with it.
   */
  dismissible?: boolean;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  supporting,
  children,
  footer,
  size = "md",
  dismissible = true,
  className,
}: ModalProps) {
  const { titleId, descId } = useOverlayIds();

  return (
    <Overlay
      open={open}
      onClose={onClose}
      closeOnScrim={dismissible}
      closeOnEscape={dismissible}
      labelledBy={titleId}
      describedBy={supporting ? descId : undefined}
      containerClassName="items-center justify-center p-4"
      panelClassName={cn(
        "flex max-h-[calc(100dvh-2rem)] flex-col",
        "rounded-2xl bg-surface shadow-overlay",
        SIZE[size],
        className,
      )}
    >
      <OverlayHeader
        id={titleId}
        title={title}
        supporting={supporting ? <span id={descId}>{supporting}</span> : undefined}
        onClose={dismissible ? onClose : undefined}
        closeLabel={`Close ${typeof title === "string" ? title : "dialog"}`}
      />
      <OverlayBody className="pb-6">{children}</OverlayBody>
      {footer && <OverlayFooter>{footer}</OverlayFooter>}
    </Overlay>
  );
}
