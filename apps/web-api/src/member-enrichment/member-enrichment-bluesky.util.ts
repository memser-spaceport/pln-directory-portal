import { normalizeBlueskyHandler } from '../teams/team-handle-normalizer';

// Matches a bare Bluesky handle mention embedded in free text (e.g. LinkedIn "about"
// text or an X bio), such as "find me on bsky at jane.bsky.social" — as opposed to a
// full bsky.app profile URL, which `normalizeBlueskyHandler` already extracts on its own.
const BLUESKY_MENTION = /\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.bsky\.social)\b/i;

/**
 * Best-effort, zero-cost extraction of a Bluesky handle out of free text that was
 * already fetched for another purpose (a member's LinkedIn "about" section or X bio).
 * Looks for an explicit `bsky.app/profile/<handle>` URL first, then a bare
 * `<handle>.bsky.social` mention. Returns undefined when neither shape is present —
 * this is deliberately conservative, not a general social-link scraper.
 */
export function extractBlueskyHandleFromText(text: string | null | undefined): string | undefined {
  if (!text) return undefined;

  const urlMatch = text.match(/(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\/([a-zA-Z0-9._-]+)/i);
  if (urlMatch) {
    return normalizeBlueskyHandler(urlMatch[1]);
  }

  const mentionMatch = text.match(BLUESKY_MENTION);
  if (mentionMatch) {
    return normalizeBlueskyHandler(mentionMatch[1]);
  }

  return undefined;
}
