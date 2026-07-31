/**
 * Warm Intros v2 — path feedback (canRefer + free-text note) DTOs.
 */

export type WarmPathCanRefer = 'yes' | 'no';

export class UpsertWarmPathFeedbackDto {
  /** Best connector or alternate connector MasterProfile.uid. */
  connectorProfileUid: string;
  /** Omit to leave unchanged; null clears (same as undo when sent alone). */
  canRefer?: WarmPathCanRefer | null;
  /** Free-text note; omit to leave unchanged; null/empty clears. Max 600. */
  note?: string | null;
}

export class ClearWarmPathReferDto {
  connectorProfileUid: string;
}

export class ListWarmPathFeedbackQueryDto {
  targetProfileUid?: string;
  /** Case-insensitive match on actor email or note. */
  q?: string;
  limit?: string;
  offset?: string;
}

export type FeedbackActor = {
  uid: string | null;
  email: string | null;
};

export type MyWarmPathFeedback = {
  canRefer: WarmPathCanRefer | null;
  note: string | null;
  updatedAt: string;
};

export type WarmPathFeedbackSummaryRecent = {
  actorEmail: string | null;
  canRefer: WarmPathCanRefer | null;
  note: string | null;
  updatedAt: string;
};

export type WarmPathFeedbackSummary = {
  yesCount: number;
  noCount: number;
  noteCount: number;
  recent: WarmPathFeedbackSummaryRecent[];
};
