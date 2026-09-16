/**
 * Viewer context threaded through every Husky search tool so each tool can
 * gate its own data the same way the corresponding directory surface would
 * for this member — never just a blanket "logged in or not".
 */
export interface HuskyAuthContext {
  isLoggedIn: boolean;
  /** Resolved directory member uid for the signed-in caller, when known. */
  memberUid?: string;
  /** Signed-in caller's email, for tools that reuse a directory surface's own member lookup. */
  email?: string;
}
