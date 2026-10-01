import { Prisma, type AiAppFeedbackPin, type AiAppFeedbackStatus } from '@prisma/client';
import { FeedbackPinInputSchema, type FeedbackPinInput } from './dto/submit-feedback.dto';

/**
 * Element pins on AI App feedback: the rows behind the live-app overlay.
 *
 * Pins reach us twice in one submission: as rows (`pins` in the body, stored
 * here) and as the HTML block inside `text` that people read. The rows are the
 * source of truth; the HTML is never parsed again except by the one-off
 * backfill of feedback filed before the rows existed (see
 * `parsePinsFromFeedbackHtml`).
 */

/** The overlay never needs more; feedback per app is small, and this bounds a runaway. */
export const MAX_PINS_PER_RESPONSE = 500;

/** Prisma create payload for one pin, nulls made explicit. */
export function toPinCreateData(pin: FeedbackPinInput): Omit<Prisma.AiAppFeedbackPinCreateManyInput, 'feedbackUid'> {
  return {
    n: pin.n,
    env: pin.env,
    pagePath: pin.pagePath,
    pageQuery: pin.pageQuery ?? null,
    selector: pin.selector,
    tag: pin.tag,
    text: pin.text,
    role: pin.role ?? null,
    ariaLabel: pin.ariaLabel ?? null,
    component: pin.component ?? null,
    source: pin.source ?? null,
    rect: pin.rect,
    viewportW: pin.viewportW,
    viewportH: pin.viewportH,
    note: pin.note,
    cropUrl: pin.cropUrl ?? null,
    ox: pin.ox ?? null,
    oy: pin.oy ?? null,
  };
}

/** The columns a pin exposes; `id` and the internal foreign key never leave the server. */
export const PIN_PUBLIC_SELECT = Prisma.validator<Prisma.AiAppFeedbackPinSelect>()({
  uid: true,
  feedbackUid: true,
  n: true,
  env: true,
  pagePath: true,
  pageQuery: true,
  selector: true,
  tag: true,
  text: true,
  role: true,
  ariaLabel: true,
  component: true,
  source: true,
  rect: true,
  viewportW: true,
  viewportH: true,
  note: true,
  cropUrl: true,
  ox: true,
  oy: true,
  createdAt: true,
});

export type PublicFeedbackPin = Omit<AiAppFeedbackPin, 'id'>;

/** A pin as the overlay reads it: the pin plus what it needs from its feedback. */
export type OverlayFeedbackPin = PublicFeedbackPin & {
  feedback: {
    uid: string;
    status: AiAppFeedbackStatus;
    createdAt: Date;
    member: { uid: string; name: string; image: string | null } | null;
  };
};

const PINS_LIST = /<ol\b[^>]*\bclass=["'][^"']*\bai-app-element-pins\b[^"']*["'][^>]*>/i;
const DATA_PINS = /\bdata-pins=("([^"]*)"|'([^']*)')/i;
const PIN_CROP_IMG = /<img\b[^>]*\bclass=["'][^"']*\bai-app-pin-crop\b[^"']*["'][^>]*>/gi;
const SRC = /\bsrc=("([^"]*)"|'([^']*)')/i;

/** Undo the attribute escaping DOMPurify applies on serialization. */
function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

type LegacySerializedPin = {
  n?: unknown;
  note?: unknown;
  crop?: unknown;
  selector?: unknown;
  tag?: unknown;
  text?: unknown;
  role?: unknown;
  ariaLabel?: unknown;
  component?: unknown;
  source?: unknown;
  rect?: unknown;
  page?: { path?: unknown; viewportW?: unknown; viewportH?: unknown };
};

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * Recovers pin rows from feedback filed before they were stored as rows: the
 * `data-pins` payload (URL-encoded JSON, `version: 1`) that the frontend's
 * `pinsHtml` writes on the pins list, with crop URLs taken from the payload or,
 * failing that, from the `ai-app-pin-crop` images in order.
 *
 * `env` is 'prod': nothing recorded it before. Each pin is validated exactly
 * like a submitted one, and a pin that fails is dropped, never guessed at.
 */
export function parsePinsFromFeedbackHtml(html: string): { pins: FeedbackPinInput[]; skipped: number } {
  const list = html.match(PINS_LIST);
  const attr = list?.[0].match(DATA_PINS);
  if (!attr) return { pins: [], skipped: 0 };

  let payload: { version?: unknown; pins?: unknown };
  try {
    payload = JSON.parse(decodeURIComponent(unescapeAttr(attr[2] ?? attr[3] ?? '')));
  } catch {
    return { pins: [], skipped: 1 };
  }
  if (payload?.version !== 1 || !Array.isArray(payload.pins)) return { pins: [], skipped: 1 };

  const cropImgs = Array.from(html.matchAll(PIN_CROP_IMG)).map((img) => {
    const src = img[0].match(SRC);
    return src ? unescapeAttr(src[2] ?? src[3] ?? '') : null;
  });

  const pins: FeedbackPinInput[] = [];
  let skipped = 0;
  (payload.pins as LegacySerializedPin[]).forEach((raw, index) => {
    const path = str(raw?.page?.path) ?? '';
    const queryAt = path.indexOf('?');
    const candidate = {
      n: typeof raw?.n === 'number' ? raw.n : index + 1,
      env: 'prod',
      pagePath: queryAt === -1 ? path : path.slice(0, queryAt),
      pageQuery: queryAt === -1 ? null : path.slice(queryAt + 1),
      selector: str(raw?.selector),
      tag: str(raw?.tag),
      text: str(raw?.text) ?? '',
      role: str(raw?.role),
      ariaLabel: str(raw?.ariaLabel),
      component: str(raw?.component),
      source: str(raw?.source),
      rect: raw?.rect,
      viewportW: raw?.page?.viewportW,
      viewportH: raw?.page?.viewportH,
      note: str(raw?.note) ?? '',
      cropUrl: str(raw?.crop) ?? cropImgs[index] ?? null,
    };
    const parsed = FeedbackPinInputSchema.safeParse(candidate);
    if (parsed.success) {
      pins.push(parsed.data);
    } else {
      skipped += 1;
    }
  });
  return { pins, skipped };
}
