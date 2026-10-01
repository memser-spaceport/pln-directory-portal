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
 *
 * `pins` and `context` are optional so older clients keep working: pins also
 * travel inside `text` as HTML for people reading it, and these rows are what
 * the live-app overlay and the agent read.
 */
// JSON cannot carry Infinity or NaN, so a plain number is already finite here.
const coord = z.number();

/**
 * One pinned element, as the LabOS feedback dialog sends it. The bridge already
 * caps every field inside the app; these limits are re-applied here because the
 * request comes from a browser, not from the bridge.
 */
export const FeedbackPinInputSchema = z
  .object({
    n: z.number().int().min(1).max(50),
    env: z.enum(['prod', 'preview']),
    pagePath: z
      .string()
      .max(2000)
      .refine((path) => path.startsWith('/'), 'pagePath must start with /'),
    pageQuery: z.string().max(2000).nullable().optional(),
    selector: z.string().min(1).max(1000),
    tag: z.string().min(1).max(64),
    text: z.string().max(200),
    role: z.string().max(100).nullable().optional(),
    ariaLabel: z.string().max(200).nullable().optional(),
    component: z.string().max(200).nullable().optional(),
    source: z.string().max(300).nullable().optional(),
    rect: z.object({ x: coord, y: coord, w: coord.min(0), h: coord.min(0) }).strict(),
    viewportW: z.number().int().min(1).max(20000),
    viewportH: z.number().int().min(1).max(20000),
    note: z.string().max(2000),
    // A hosted image (S3 or the IPFS worker, depending on the environment), so
    // only the scheme is checked: https, never an inline data: URI.
    /** The click within the element, as a fraction of its box; optional for older clients. */
    ox: z.number().min(0).max(1).nullable().optional(),
    oy: z.number().min(0).max(1).nullable().optional(),
    cropUrl: z
      .string()
      .max(2000)
      .url()
      .refine((url) => url.startsWith('https://'), 'cropUrl must be an https URL')
      .nullable()
      .optional(),
  })
  .strict();

/** Where the feedback was left. Viewport is the app frame's, which is what a layout bug depends on. */
export const FeedbackContextSchema = z
  .object({
    env: z.enum(['prod', 'preview']),
    appPath: z.string().max(2000),
    labosUrl: z.string().url().max(2000),
    viewport: z.object({ w: z.number().int().min(0).max(20000), h: z.number().int().min(0).max(20000) }).strict(),
    pixelRatio: z.number().positive().max(10),
    touch: z.boolean(),
    userAgent: z.string().max(500),
    bridge: z
      .object({ version: z.number().int().min(1).max(100), capabilities: z.array(z.string().max(32)).max(10) })
      .strict()
      .nullable(),
  })
  .strict();

export const SubmitFeedbackSchema = z.object({
  text: z.string().trim().min(1).max(200000),
  pins: z
    .array(FeedbackPinInputSchema)
    .max(20)
    .refine((pins) => new Set(pins.map((pin) => pin.n)).size === pins.length, 'pin numbers must be unique')
    .optional(),
  context: FeedbackContextSchema.optional(),
});

export type FeedbackPinInput = z.infer<typeof FeedbackPinInputSchema>;
export type FeedbackContext = z.infer<typeof FeedbackContextSchema>;

export class SubmitFeedbackDto extends createZodDto(SubmitFeedbackSchema) {}
