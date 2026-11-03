import { BadRequestException, ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { McpMemberProofService } from './mcp-member-proof.service';
import { McpActorContext, McpToolDef } from './mcp-tools';

/**
 * Forum tools (LAB-3031): an agent reads categories, starts threads and replies in NodeBB as the member who connected
 * it. Every call mints a one-time member proof for this connection (LAB-3075) and sends it to NodeBB in
 * `X-PL-Member-Proof`; NodeBB redeems it, runs that one request as the member under the member's own forum
 * privileges, and stores which agent wrote the post. No session outlives the request, so a disconnected agent can't
 * post: no proof is issued for it.
 */

export const FORUM_PROOF_HEADER = 'X-PL-Member-Proof';
const FORUM_TIMEOUT_MS = 10_000;
/** NodeBB's default maximum post length. */
const CONTENT_MAX = 32_767;
const TITLE_MAX = 255;
const TAGS_MAX = 5;

const NOT_SET_UP = 'Agents cannot post to the forum on this LabOS environment yet.';
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
async function callForum(proofs: ProofIssuer, ctx: McpActorContext, method: 'GET' | 'POST', path: string, body?: Row) {
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
        const description = typeof item.description === 'string' ? item.description.trim() : '';
        const parentCid = asNumber(item.parentCid);
        out.push({
          cid,
          name: String(item.name ?? ''),
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

export function forumTools(proofs: ProofIssuer): McpToolDef[] {
  return [
    {
      name: 'list_forum_categories',
      description:
        'List the LabOS forum categories this member can see, with their cid. Call it before start_forum_thread to ' +
        'pick a category.',
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
            title: typeof created.title === 'string' ? created.title : args.title,
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
  ];
}
