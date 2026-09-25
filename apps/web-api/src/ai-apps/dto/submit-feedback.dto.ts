import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted from the app detail page to `POST /v1/ai-apps/:uid/feedback`.
 * Quill HTML (headings, links, images) or legacy plain text. A member may
 * submit multiple entries per app.
 *
 * The cap is on the SERIALIZED string, which is mostly not prose: each
 * annotated screenshot carries its drawing in a `data-annotations` attribute as
 * URL-encoded JSON, and a freehand stroke is hundreds of points at full float
 * precision. Five strokes of a few hundred points each encode to ~87k on their
 * own — so 50000 rejected submissions whose visible text was a single line, with
 * a message about characters that named a number the writer could not see.
 *
 * 200000 is sized for that: a heavily drawn-on screenshot plus room for several
 * more. Well inside the 5 MB body-parser limit (`main.config.ts`), and the
 * column is Postgres `text`, which has no length of its own.
 *
 * The visible-character cap still lives on the frontend, and still counts
 * something different — prose the member typed, with the markup stripped.
 */
export const SubmitFeedbackSchema = z.object({
  text: z.string().trim().min(1).max(200000),
});

export class SubmitFeedbackDto extends createZodDto(SubmitFeedbackSchema) {}
