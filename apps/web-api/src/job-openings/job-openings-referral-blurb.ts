const MAX_BLURB_CHARS = 220;

// Reverses the HTML entities that reach Member.bio: the Husky generator emits HTML,
// and the profile's Quill editor re-encodes quotes and ampersands on save. Without
// this the draft note renders them literally ("... for &quot;Team A&quot; ...").
//
// `&amp;` MUST be decoded LAST. Decoding it first turns a legitimately double-encoded
// `&amp;quot;` into `"` instead of the `&quot;` the bio actually says.
// Mirrors the frontend's utils/forum/stripHtml.ts, which gets this ordering right.
const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&quot;|&#0*34;/g, '"')
    .replace(/&apos;|&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&');

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
