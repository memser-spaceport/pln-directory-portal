import { Injectable, Logger } from '@nestjs/common';
import type { LabosDigestPageForumPost } from 'libs/contracts/src/schema/team-news';
import { decodeHtmlEntities } from '../utils/html-entities';

/**
 * Reads the forum posts of one digest for the public digest page (LAB-3263).
 *
 * The page opens from an email link without sign-in, so it cannot read the forum as the member (NodeBB member
 * proofs belong to MCP connections). It reads with the same kind of NodeBB API key the notification service uses
 * to build the digest (`FORUM_API_KEY`), and only the topic ids signed into the link.
 */
export const LABOS_DIGEST_FORUM_TIMEOUT_MS = 5_000;

type Row = Record<string, unknown>;

export type DigestForumRead = { posts: LabosDigestPageForumPost[]; unavailable: boolean };

const asNumber = (value: unknown): number | undefined => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const text = (value: unknown): string => (typeof value === 'string' ? decodeHtmlEntities(value).trim() : '');

const absoluteUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;

/** Maps NodeBB's `GET /api/topic/:tid` payload to a page post, or null for a deleted or empty topic. */
export function toDigestForumPost(payload: Row, webUiBase: string): LabosDigestPageForumPost | null {
  const tid = asNumber(payload.tid);
  const cid = asNumber(payload.cid);
  const posts = Array.isArray(payload.posts) ? (payload.posts as Row[]) : [];
  const opening = posts.find((post) => asNumber(post?.index) === 0) ?? posts[0];
  if (tid === undefined || cid === undefined || payload.deleted || !opening || opening.deleted) return null;
  const content = typeof opening.content === 'string' ? opening.content : '';
  if (!content.trim()) return null;
  const user = (opening.user ?? {}) as Row;
  return {
    tid,
    title: text(payload.titleRaw) || text(payload.title),
    authorName: text(user.fullname) || text(user.displayname) || text(user.username) || 'anonymous',
    authorRole: text(user.teamRole) || null,
    authorTeam: text(user.teamName) || null,
    authorAvatarUrl: absoluteUrl(user.picture),
    contentHtml: content,
    url: `${webUiBase}/forum/topics/${cid}/${tid}`,
  };
}

@Injectable()
export class LabosDigestForumReader {
  private readonly logger = new Logger(LabosDigestForumReader.name);

  /**
   * The posts for these topic ids, in the given order. A topic the forum does not return is left out. When the
   * forum is not configured or does not answer at all, `unavailable` is true and `posts` is empty.
   */
  async read(tids: number[]): Promise<DigestForumRead> {
    if (tids.length === 0) return { posts: [], unavailable: false };
    const base = (process.env.FORUM_API_URL || '').trim().replace(/\/+$/, '');
    const key = (process.env.FORUM_API_KEY || '').trim();
    const webUiBase = (process.env.WEB_UI_BASE_URL || '').trim().replace(/\/+$/, '');
    if (!base || !key) {
      this.logger.warn('Digest page forum posts skipped: FORUM_API_URL or FORUM_API_KEY is not set');
      return { posts: [], unavailable: true };
    }

    const results = await Promise.all(tids.map((tid) => this.readTopic(base, key, tid)));
    if (results.every((result) => result === 'failed')) return { posts: [], unavailable: true };
    const posts = results
      .filter((result): result is Row => result !== 'failed' && result !== null)
      .map((payload) => toDigestForumPost(payload, webUiBase))
      .filter((post): post is LabosDigestPageForumPost => post !== null);
    return { posts, unavailable: false };
  }

  /** The topic payload, null when the forum says it doesn't exist or is not readable, 'failed' when it doesn't answer. */
  private async readTopic(base: string, key: string, tid: number): Promise<Row | null | 'failed'> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), LABOS_DIGEST_FORUM_TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/api/topic/${tid}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: abort.signal,
      });
      if (response.status === 403 || response.status === 404) return null;
      if (!response.ok) {
        this.logger.warn(`Digest page forum topic ${tid}: ${response.status}`);
        return 'failed';
      }
      const data = (await response.json().catch(() => null)) as Row | null;
      if (!data || typeof data !== 'object') return 'failed';
      return 'response' in data && data.response && typeof data.response === 'object' ? (data.response as Row) : data;
    } catch (error) {
      this.logger.warn(`Digest page forum topic ${tid} failed: ${String((error as Error)?.message ?? error)}`);
      return 'failed';
    } finally {
      clearTimeout(timer);
    }
  }
}
