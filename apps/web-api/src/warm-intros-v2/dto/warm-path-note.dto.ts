/**
 * Warm Intros v2 — per-user path note (useful context, not correction feedback).
 */

export class UpsertWarmPathNoteDto {
  connectorProfileUid: string;
  /** Free-text note; null/empty clears. Max 600. */
  note: string | null;
}

export type MyWarmPathNote = {
  note: string;
  updatedAt: string;
};

export type WarmPathNoteRecent = {
  actorEmail: string | null;
  note: string;
  updatedAt: string;
};
