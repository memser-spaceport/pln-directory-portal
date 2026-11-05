import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { McpMemberProofService } from './mcp-member-proof.service';
import { decodeHtmlEntities } from '../utils/html-entities';
import { McpActorContext, McpToolDef } from './mcp-tools';

/**
 * Forum tools (LAB-3031): an agent searches and reads threads, lists categories, starts threads, replies, and edits or
 * deletes the member's own posts (LAB-3144, LAB-3145) in NodeBB as the member who connected it. Every call mints a one-time member proof for this connection (LAB-3075) and sends it
 * to NodeBB in `X-PL-Member-Proof`; NodeBB redeems it, runs that one request as the member under the member's own
 * forum privileges, and stores which agent wrote the post. No session outlives the request, so a disconnected agent
 * can't post: no proof is issued for it.
 *
 * Reads go to NodeBB too, not to the OpenSearch `forum_thread` index: the agent sees exactly what the member may read,
 * a thread is readable the moment it is posted, and no environment needs OpenSearch access for the forum.
 */

export const FORUM_PROOF_HEADER = 'X-PL-Member-Proof';
const FORUM_TIMEOUT_MS = 10_000;
/** NodeBB's default maximum post length. */
const CONTENT_MAX = 32_767;
const TITLE_MAX = 255;
const TAGS_MAX = 5;
const SEARCH_LIMIT_DEFAULT = 20;
const SEARCH_LIMIT_MAX = 50;
/** NodeBB returns matching posts, several per thread; ask for more posts than threads so a page fills. */
const SEARCH_POSTS_PER_THREAD = 3;
/** NodeBB caps itemsPerPage at 100. */
const SEARCH_POSTS_MAX = 100;
const SEARCH_QUERY_MAX = 200;
const SNIPPET_MAX = 240;
/** NodeBB's category sorts. The Directory forum opens on recently created, so the agent does too. */
export const FORUM_THREAD_SORTS = [
  'recently_created',
  'recently_replied',
  'most_posts',
  'most_votes',
  'most_views',
] as const;
const LIST_PAGE_MAX = 1000;

const NOT_SET_UP = 'Agents cannot use the forum on this LabOS environment yet.';
const FORUM_DOWN = 'The forum did not answer. Try again later.';

const logger = new Logger('McpForumTools');

type ProofIssuer = Pick<McpMemberProofService, 'issueForAuthorization'>;
type Row = Record<string, unknown>;

function forumApiUrl(): string {
  return (process.env.FORUM_API_URL || '').trim().replace(/\/+$/, '');
}

/** The uid of NodeBB's integration key: the audience a forum proof is issued for. Not a secret. */
function forumProofAudience(): string {
  return (process.env.FORUM_MEMBER_PROOF_AUDIENCE || '').trim();
}

function webUiBase(): string {
  return (process.env.WEB_UI_BASE_URL || '').replace(/\/+$/, '');
}

export function forumThreadUrl(cid: number, tid: number): string {
  return `${webUiBase()}/forum/topics/${cid}/${tid}`;
}

function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

/** NodeBB's own words for a refusal: `{ status: { message } }` from its API, `{ error }` from its auth layer. */
function forumMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const body = data as { error?: unknown; status?: { message?: unknown } };
  const message = typeof body.error === 'string' ? body.error : body.status?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : undefined;
}

/**
 * What the agent is told when NodeBB refuses. 4xx carry NodeBB's reason; a 5xx or no answer at all (`status`
 * undefined: network error or timeout) is "try later".
 */
export function forumError(status: number | undefined, data: unknown, cause?: unknown): Error {
  if (!status || status >= 500) {
    logger.warn(
      `Forum call failed${status ? ` (${status})` : ''}: ${String((cause as Error)?.message ?? cause ?? '')}`
    );
    return new BadRequestException(FORUM_DOWN);
  }
  const message = forumMessage(data);
  if (status === 401) {
    // The proof was refused: expired on the way, or NodeBB can't reach LabOS to redeem it.
    return new BadRequestException('The forum could not confirm this member. Try again.');
  }
  if (status === 404) {
    return new NotFoundException(message ?? 'Not found in the forum');
  }
  return new BadRequestException(message ?? `The forum refused the request (${status})`);
}

/** One request to NodeBB as the member behind this connection. Returns NodeBB's `response` payload. */
async function callForum(
  proofs: ProofIssuer,
  ctx: McpActorContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: Row
) {
  const base = forumApiUrl();
  const audience = forumProofAudience();
  if (!base || !audience) {
    throw new BadRequestException(NOT_SET_UP);
  }

  let proof: string;
  try {
    ({ proof } = await proofs.issueForAuthorization(ctx.authorizationUid, audience, 'forum'));
  } catch (error) {
    if (error instanceof NotFoundException) {
      // No live key with that uid: the environment's audience is wrong, not the agent's request.
      logger.error(`Forum proof audience ${audience} is not a live members:sign-in key`);
      throw new BadRequestException(NOT_SET_UP);
    }
    if (error instanceof ForbiddenException) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }

  let response: Response;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FORUM_TIMEOUT_MS);
  try {
    response = await fetch(`${base}${path}`, {
      method,
      // The proof is the only credential: NodeBB refuses it next to any other.
      headers: { [FORUM_PROOF_HEADER]: proof, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: abort.signal,
    });
  } catch (error) {
    throw forumError(undefined, undefined, error);
  } finally {
    clearTimeout(timer);
  }
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw forumError(response.status, data);
  }
  const payload = data && typeof data === 'object' && 'response' in data ? (data as Row).response : data;
  return (payload ?? {}) as Row;
}

type ForumCategory = { cid: number; name: string; description?: string; parentCid?: number };

/** NodeBB sends names and titles HTML-escaped ("Comments &amp; Feedback"); the agent gets plain text. */
function forumText(value: unknown): string {
  return typeof value === 'string' ? decodeHtmlEntities(value).trim() : '';
}

/** Categories an agent can post in: real ones (NodeBB lists "uncategorized" as -1), not links or disabled ones. */
export function forumCategories(payload: Row): ForumCategory[] {
  const out: ForumCategory[] = [];
  const seen = new Set<number>();
  const visit = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list as Row[]) {
      const cid = asNumber(item?.cid);
      if (cid !== undefined && cid > 0 && !seen.has(cid) && !item.disabled && !item.link) {
        seen.add(cid);
        const description = forumText(item.description);
        const parentCid = asNumber(item.parentCid);
        out.push({
          cid,
          name: forumText(item.name),
          ...(description ? { description } : {}),
          ...(parentCid ? { parentCid } : {}),
        });
      }
      visit(item?.children);
    }
  };
  visit(payload.categories);
  return out;
}

/**
 * NodeBB post HTML as plain text an agent can read: paragraphs and list items keep their line breaks, a link keeps its
 * URL next to its text, every other tag is dropped. Tags are stripped before entities are decoded (see
 * `decodeHtmlEntities`), so an escaped `&lt;b&gt;` in a post stays the text `<b>`.
 */
export function forumPlainText(html: unknown): string {
  if (typeof html !== 'string') return '';
  const text = html
    .replace(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, inner: string) => {
      const label = inner.replace(/<[^>]*>/g, '').trim();
      const url = decodeHtmlEntities(href);
      return /^https?:\/\//i.test(url) && label && decodeHtmlEntities(label) !== url ? `${label} (${href})` : label;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(p|div|li|ul|ol|blockquote|pre|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeHtmlEntities(text)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function snippetOf(html: unknown): string | null {
  const text = forumPlainText(html).replace(/\s+/g, ' ');
  if (!text) return null;
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
}

function clampSearchLimit(value: unknown): number {
  const n = asNumber(value);
  if (n === undefined) return SEARCH_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(n), 1), SEARCH_LIMIT_MAX);
}

type ForumThreadRow = {
  uid: string;
  topicTitle: string;
  topicSlug: string | null;
  topicUrl: string;
  replyCount: number;
  cid: number;
  snippet: string | null;
};

/**
 * NodeBB's search answers with matching posts, best first, several per thread. One row per thread, in the order its
 * best post ranked; the snippet is from that post. Deleted posts and threads are left out.
 */
export function forumThreadRows(payload: Row, limit: number): ForumThreadRow[] {
  const posts = Array.isArray(payload.posts) ? (payload.posts as Row[]) : [];
  const rows: ForumThreadRow[] = [];
  const seen = new Set<number>();
  for (const post of posts) {
    const topic = (post?.topic ?? {}) as Row;
    const tid = asNumber(topic.tid) ?? asNumber(post?.tid);
    const cid = asNumber(topic.cid);
    if (tid === undefined || cid === undefined || seen.has(tid) || post.deleted || topic.deleted) continue;
    seen.add(tid);
    rows.push({
      uid: String(tid),
      topicTitle: forumText(topic.title),
      topicSlug: typeof topic.slug === 'string' ? topic.slug : null,
      topicUrl: forumThreadUrl(cid, tid),
      replyCount: Math.max(0, (asNumber(topic.postcount) ?? 1) - 1),
      cid,
      snippet: snippetOf(post.content),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * One page of a NodeBB category as the agent sees it: its threads in the order NodeBB sorted them, pinned ones first
 * as NodeBB puts them. NodeBB sends one page (the member's topics-per-page setting, 20 by default). The snippet is the
 * thread's teaser, its latest reply; a thread with no replies has none (pln-nodebb's teaserPost is `last-reply`), and
 * `withOpeningPostSnippets` fills it from the opening post. Deleted threads are left out.
 */
export function forumCategoryThreads(payload: Row, page: number, sort: string) {
  const cid = asNumber(payload.cid);
  if (cid === undefined) {
    throw new NotFoundException('Forum category not found');
  }
  const topics = Array.isArray(payload.topics) ? (payload.topics as Row[]) : [];
  const threads = topics
    .filter((topic) => topic && !topic.deleted && asNumber(topic.tid) !== undefined)
    .map((topic) => {
      const tid = asNumber(topic.tid) as number;
      const user = (topic.user ?? {}) as Row;
      const teaser = (topic.teaser ?? {}) as Row;
      return {
        uid: String(tid),
        topicTitle: forumText(topic.title),
        topicSlug: typeof topic.slug === 'string' ? topic.slug : null,
        topicUrl: forumThreadUrl(cid, tid),
        replyCount: Math.max(0, (asNumber(topic.postcount) ?? 1) - 1),
        cid,
        mainPid: asNumber(topic.mainPid) ?? null,
        author: forumText(user.displayname) || forumText(user.username) || null,
        createdAt: typeof topic.timestampISO === 'string' ? topic.timestampISO : null,
        lastActivityAt: typeof topic.lastposttimeISO === 'string' ? topic.lastposttimeISO : null,
        pinned: Boolean(topic.pinned),
        locked: Boolean(topic.locked),
        upvotes: asNumber(topic.upvotes) ?? 0,
        views: asNumber(topic.viewcount) ?? 0,
        snippet: snippetOf(teaser.content),
      };
    });
  const pagination = (payload.pagination ?? {}) as Row;
  return {
    category: { cid, name: forumText(payload.name) },
    threads,
    page,
    pageCount: asNumber(pagination.pageCount) ?? 1,
    threadCount: asNumber(payload.topic_count) ?? threads.length,
    sort,
  };
}

const SNIPPET_FETCH_CONCURRENCY = 5;

/**
 * Threads with no teaser (no replies yet) get the opening post as their snippet: one NodeBB read each, through a new
 * proof, a few at a time. A read that fails leaves that snippet empty instead of failing the whole list.
 */
async function withOpeningPostSnippets<T extends { snippet: string | null; mainPid: number | null }>(
  proofs: ProofIssuer,
  ctx: McpActorContext,
  threads: T[]
): Promise<T[]> {
  const missing = threads.filter((thread) => thread.snippet === null && thread.mainPid !== null);
  const snippets = new Map<number, string | null>();
  for (let i = 0; i < missing.length; i += SNIPPET_FETCH_CONCURRENCY) {
    await Promise.all(
      missing.slice(i, i + SNIPPET_FETCH_CONCURRENCY).map(async ({ mainPid }) => {
        const pid = mainPid as number;
        try {
          const summary = await callForum(proofs, ctx, 'GET', `/api/v3/posts/${pid}/summary`);
          snippets.set(pid, snippetOf(summary.content));
        } catch (error) {
          logger.warn(`Opening post ${pid} snippet failed: ${String((error as Error)?.message ?? error)}`);
        }
      })
    );
  }
  return threads.map((thread) =>
    thread.mainPid !== null && snippets.has(thread.mainPid)
      ? { ...thread, snippet: snippets.get(thread.mainPid) ?? null }
      : thread
  );
}

/**
 * A NodeBB topic page as the agent sees it: the thread, then its posts as plain text, oldest first. NodeBB sends one
 * page of posts (the member's posts-per-page setting, 20 by default); `truncated` says the thread has more.
 *
 * Deleted posts are left out, and so is a deleted thread: NodeBB still sends one to a member who may view deleted
 * threads (a moderator, or its author), but the agent sees the forum as members do. NodeBB's `postcount` keeps
 * soft-deleted posts (only a purge lowers it), so `replyCount` takes off the deleted posts on this page. A deleted
 * post on a later page of a truncated thread is still counted.
 */
export function forumThread(payload: Row): Row {
  const tid = asNumber(payload.tid);
  const cid = asNumber(payload.cid);
  if (tid === undefined || payload.deleted) {
    throw new NotFoundException('Forum thread not found');
  }
  const postCount = asNumber(payload.postcount) ?? 0;
  const rawPosts = Array.isArray(payload.posts) ? (payload.posts as Row[]) : [];
  const deletedOnPage = rawPosts.filter((post) => post?.deleted).length;
  const posts = rawPosts
    .filter((post) => post && !post.deleted)
    .map((post) => {
      const user = (post.user ?? {}) as Row;
      const author = forumText(user.displayname) || forumText(user.username);
      const toPid = asNumber(post.toPid);
      return {
        pid: asNumber(post.pid),
        index: asNumber(post.index),
        author: author || null,
        postedAt: typeof post.timestampISO === 'string' ? post.timestampISO : null,
        ...(toPid ? { toPid } : {}),
        upvotes: asNumber(post.upvotes) ?? 0,
        content: forumPlainText(post.content),
      };
    });
  const tags = Array.isArray(payload.tags)
    ? (payload.tags as Row[]).map((tag) => forumText(tag?.value)).filter(Boolean)
    : [];
  return {
    uid: String(tid),
    tid,
    cid: cid ?? null,
    title: forumText(payload.title),
    url: cid !== undefined ? forumThreadUrl(cid, tid) : null,
    replyCount: Math.max(0, postCount - 1 - deletedOnPage),
    locked: Boolean(payload.locked),
    ...(tags.length ? { tags } : {}),
    posts,
    truncated: rawPosts.length < postCount,
  };
}

/** A post id from the agent, checked before a proof is minted: it goes into the NodeBB path. */
function forumPostId(value: unknown): number {
  const pid = Number(value);
  if (!Number.isInteger(pid) || pid < 1) {
    throw new BadRequestException(`Forum post pid is a positive number, got: ${String(value)}`);
  }
  return pid;
}

export function forumTools(proofs: ProofIssuer): McpToolDef[] {
  return [
    {
      name: 'search_forum_threads',
      description:
        'Search LabOS forum threads the member can read, by words in thread titles and posts (all words must match). ' +
        'Returns one row per thread, best match first: uid (the thread id, tid), topicTitle, topicSlug, topicUrl, ' +
        'replyCount, cid, and a snippet of the best-matching post. Then call get_forum_thread with a uid for the ' +
        'whole thread.',
      visibility: 'forum',
      inputSchema: {
        q: z.string().trim().min(1).max(SEARCH_QUERY_MAX).describe('Search text'),
        limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional().describe('Max threads (default 20, max 50)'),
      },
      execute: async (ctx, args = {}) => {
        const limit = clampSearchLimit(args.limit);
        const query = new URLSearchParams({
          term: String(args.q ?? '').trim(),
          in: 'titlesposts',
          matchWords: 'all',
          itemsPerPage: String(Math.min(limit * SEARCH_POSTS_PER_THREAD, SEARCH_POSTS_MAX)),
          searchOnly: '1',
        });
        const found = await callForum(proofs, ctx, 'GET', `/api/search?${query.toString()}`);
        return { results: forumThreadRows(found, limit), limit };
      },
    },
    {
      name: 'get_forum_thread',
      description:
        'Fetch one LabOS forum thread by uid (the thread id, tid, from search_forum_threads): title, category, and ' +
        'its posts as plain text, oldest first, with author and time. Returns the first page of posts (20 by ' +
        'default); truncated is true when the thread has more.',
      visibility: 'forum',
      inputSchema: {
        uid: z.string().trim().min(1).describe('Forum thread uid (tid) from search_forum_threads'),
      },
      execute: async (ctx, args = {}) => {
        const uid = String(args.uid ?? '').trim();
        if (!/^\d+$/.test(uid)) {
          throw new BadRequestException(`Forum thread uid is a number (tid), got: ${uid}`);
        }
        return forumThread(await callForum(proofs, ctx, 'GET', `/api/topic/${uid}`));
      },
    },
    {
      name: 'list_forum_threads',
      description:
        'List the threads in one LabOS forum category (cid from list_forum_categories), one page at a time, newest ' +
        'first by default. Each row: uid (the thread id, tid), topicTitle, topicUrl, replyCount, mainPid (the opening ' +
        'post), author, createdAt, lastActivityAt, pinned, locked, upvotes, views, and a snippet of the latest reply ' +
        '(of the opening post when there are no replies). Returns page, pageCount ' +
        'and threadCount; ask for the next page while page < pageCount. Then call get_forum_thread with a uid for ' +
        'the whole thread.',
      visibility: 'forum',
      inputSchema: {
        cid: z.number().int().positive().describe('Category id from list_forum_categories'),
        page: z.number().int().min(1).max(LIST_PAGE_MAX).optional().describe('Page, from 1 (default 1)'),
        sort: z
          .enum(FORUM_THREAD_SORTS)
          .optional()
          .describe(
            'Order (default recently_created): recently_created, recently_replied, most_posts, most_votes, most_views'
          ),
      },
      execute: async (ctx, args = {}) => {
        const cid = Number(args.cid);
        if (!Number.isInteger(cid) || cid < 1) {
          throw new BadRequestException(`Forum category cid is a positive number, got: ${String(args.cid)}`);
        }
        const page = Math.min(Math.max(Math.trunc(asNumber(args.page) ?? 1), 1), LIST_PAGE_MAX);
        const sort = (FORUM_THREAD_SORTS as readonly string[]).includes(String(args.sort))
          ? String(args.sort)
          : FORUM_THREAD_SORTS[0];
        const query = new URLSearchParams({ page: String(page), sort });
        const found = await callForum(proofs, ctx, 'GET', `/api/category/${cid}?${query.toString()}`);
        const listed = forumCategoryThreads(found, page, sort);
        return { ...listed, threads: await withOpeningPostSnippets(proofs, ctx, listed.threads) };
      },
    },
    {
      name: 'list_forum_categories',
      description:
        'List the LabOS forum categories this member can see, with their cid. Call it before list_forum_threads to ' +
        'browse a category, or before start_forum_thread to pick one.',
      visibility: 'forum',
      execute: async (ctx) => ({
        categories: forumCategories(await callForum(proofs, ctx, 'GET', '/api/v3/categories')),
      }),
    },
    {
      name: 'start_forum_thread',
      description:
        'Start a new LabOS forum thread as the member, in a category from list_forum_categories. content is Markdown. ' +
        "The thread is posted under the member's name, so only post what the member asked you to. Returns the " +
        "thread's tid and url.",
      visibility: 'forum_write',
      inputSchema: {
        cid: z.number().int().positive().describe('Category id from list_forum_categories'),
        title: z.string().trim().min(1).max(TITLE_MAX).describe('Thread title'),
        content: z.string().trim().min(1).max(CONTENT_MAX).describe('Opening post, Markdown'),
        tags: z.array(z.string().trim().min(1).max(64)).max(TAGS_MAX).optional().describe('Optional tags'),
      },
      execute: async (ctx, args = {}) => {
        const cid = Number(args.cid);
        const created = await callForum(proofs, ctx, 'POST', '/api/v3/topics', {
          cid,
          title: args.title,
          content: args.content,
          ...(Array.isArray(args.tags) && args.tags.length ? { tags: args.tags } : {}),
        });
        const tid = asNumber(created.tid);
        if (tid === undefined) {
          throw new BadRequestException('The forum did not return the new thread');
        }
        const threadCid = asNumber(created.cid) ?? cid;
        return {
          posted: {
            tid,
            cid: threadCid,
            pid: asNumber(created.mainPid),
            title: forumText(created.title) || args.title,
            url: forumThreadUrl(threadCid, tid),
          },
        };
      },
    },
    {
      name: 'reply_to_forum_thread',
      description:
        'Reply in a LabOS forum thread as the member. tid comes from search_forum_threads or get_forum_thread; pass ' +
        "toPid to reply to one post. content is Markdown. The reply is posted under the member's name, so only post " +
        'what the member asked you to.',
      visibility: 'forum_write',
      inputSchema: {
        tid: z.number().int().positive().describe('Thread id (tid)'),
        content: z.string().trim().min(1).max(CONTENT_MAX).describe('Reply, Markdown'),
        toPid: z.number().int().positive().optional().describe('Post id (pid) this replies to'),
      },
      execute: async (ctx, args = {}) => {
        const tid = Number(args.tid);
        const reply = await callForum(proofs, ctx, 'POST', `/api/v3/topics/${tid}`, {
          content: args.content,
          ...(args.toPid !== undefined ? { toPid: Number(args.toPid) } : {}),
        });
        const pid = asNumber(reply.pid);
        if (pid === undefined) {
          throw new BadRequestException('The forum did not return the reply');
        }
        const topic = (reply.topic ?? {}) as Row;
        const cid = asNumber(reply.cid) ?? asNumber(topic.cid);
        return {
          posted: {
            pid,
            tid,
            ...(cid !== undefined ? { cid, url: forumThreadUrl(cid, tid) } : {}),
          },
        };
      },
    },
    {
      name: 'edit_forum_post',
      description:
        "Edit one of the member's own LabOS forum posts: a thread's opening post or a reply (pid from " +
        'get_forum_thread). content is Markdown and replaces the whole post; title renames the thread and applies only ' +
        "to a thread's opening post. Only the member's own posts can be edited, and only what the member asked you to.",
      visibility: 'forum_write',
      inputSchema: {
        pid: z.number().int().positive().describe('Post id (pid) from get_forum_thread'),
        content: z.string().trim().min(1).max(CONTENT_MAX).describe('The whole new post, Markdown'),
        title: z.string().trim().min(1).max(TITLE_MAX).optional().describe('New thread title (opening post only)'),
      },
      execute: async (ctx, args = {}) => {
        const pid = forumPostId(args.pid);
        const edited = await callForum(proofs, ctx, 'PUT', `/api/v3/posts/${pid}`, {
          content: args.content,
          ...(typeof args.title === 'string' && args.title.trim() ? { title: args.title } : {}),
        });
        const topic = (edited.topic ?? {}) as Row;
        const tid = asNumber(edited.tid) ?? asNumber(topic.tid);
        const cid = asNumber(topic.cid);
        return {
          edited: {
            pid,
            ...(tid !== undefined ? { tid } : {}),
            ...(forumText(topic.title) ? { title: forumText(topic.title) } : {}),
            ...(tid !== undefined && cid !== undefined ? { cid, url: forumThreadUrl(cid, tid) } : {}),
          },
        };
      },
    },
    {
      name: 'delete_forum_post',
      description:
        "Delete one of the member's own LabOS forum posts (pid from get_forum_thread). It is a soft delete: the post " +
        'disappears for members, and forum moderators can restore it. Deleting the opening post of a thread with no ' +
        "replies deletes the thread. Only the member's own posts can be deleted. Confirm with the member before you " +
        'delete.',
      visibility: 'forum_write',
      inputSchema: {
        pid: z.number().int().positive().describe('Post id (pid) from get_forum_thread'),
      },
      execute: async (ctx, args = {}) => {
        const pid = forumPostId(args.pid);
        await callForum(proofs, ctx, 'DELETE', `/api/v3/posts/${pid}/state`);
        return { deleted: { pid } };
      },
    },
  ];
}
