import { decodeHtmlEntities } from '../utils/html-entities';

const MAX_BLURB_CHARS = 220;

// Turns a stored (possibly AI-generated, possibly HTML) Member.bio into a short,
// plain-text sentence or two for the referral draft note. Not AI-summarized —
// just the bio's own leading sentences, minus markup and the AI disclaimer.
// See member-bio-generation skill for how Member.bio itself gets generated.
export function deriveReferralBlurb(bio: string | null): string | null {
  if (!bio) return null;

  // Strip tags BEFORE decoding. Decoding first would turn an escaped `&lt;b&gt;` into
  // a real `<b>` that the strip pass then eats, silently losing the text.
  const plain = decodeHtmlEntities(bio.replace(/<[^>]+>/g, ' '))
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return null;

  const sentences = plain.split(/(?<=[.!?])\s+/).filter((sentence) => !/AI generated/i.test(sentence));
  let blurb = '';
  for (const sentence of sentences) {
    if (blurb.length + sentence.length > MAX_BLURB_CHARS) break;
    blurb = blurb ? `${blurb} ${sentence}` : sentence;
  }
  return blurb || null;
}
