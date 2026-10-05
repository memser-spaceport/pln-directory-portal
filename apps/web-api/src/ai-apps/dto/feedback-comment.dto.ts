import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** Longest reply or closing note, in characters (after trimming). */
export const FEEDBACK_COMMENT_MAX_LENGTH = 2000;

/** zod 3.19 has no `.trim()`: trim first, so whitespace-only text fails `min(1)`. */
export const feedbackCommentText = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z.string().min(1).max(FEEDBACK_COMMENT_MAX_LENGTH)
);

/** Body posted to `POST /v1/ai-apps/:uid/feedback/:feedbackUid/comments`. Plain text; clients render it escaped. */
export const CreateFeedbackCommentSchema = z.object({
  text: feedbackCommentText,
});

export class CreateFeedbackCommentDto extends createZodDto(CreateFeedbackCommentSchema) {}

/** Body of `PATCH …/comments/:commentUid`: the reply's new text (its author only). */
export const EditFeedbackCommentSchema = z.object({
  text: feedbackCommentText,
});

export class EditFeedbackCommentDto extends createZodDto(EditFeedbackCommentSchema) {}

/**
 * Body of `PATCH :uid/feedback/:feedbackUid/note`: a COMMENT's new note (its
 * author only). Plain text; the server rebuilds the item's HTML and the pin's
 * note from it, so the two never disagree.
 */
export const EditFeedbackNoteSchema = z.object({
  note: feedbackCommentText,
});

export class EditFeedbackNoteDto extends createZodDto(EditFeedbackNoteSchema) {}
