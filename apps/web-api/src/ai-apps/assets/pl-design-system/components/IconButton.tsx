import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * IconButton — square, icon-only action. The "..." overflow menu trigger on
 * every card is this component.
 *
 * `label` is required and becomes aria-label: the captured markup had several
 * icon-only buttons with no accessible name.
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  icon: ReactNode;
  size?: "sm" | "md";
}

export function IconButton({
  label,
  icon,
  size = "sm",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-secondary",
        "cursor-pointer transition-colors hover:bg-hover hover:text-link",
        size === "sm" ? "h-6 w-6" : "h-10 w-10",
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
