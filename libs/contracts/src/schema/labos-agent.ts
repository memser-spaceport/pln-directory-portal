import { z } from 'zod';

/** The intro target of the `intro` page (LAB-3300, contract section 8.1). */
export const LabosAgentIntroTargetSchema = z.object({
  type: z.enum(['member', 'team']),
  uid: z.string().min(1).max(64),
});
export type LabosAgentIntroTarget = z.infer<typeof LabosAgentIntroTargetSchema>;

/**
 * The page the member is on when they ask (LAB-3272 contract C1). S1: `news-story`, `home`. S3: `intro`.
 * S5 (LAB-3302, contract section 9): `member`, `team`, `job` (no `jobUid` is the job board) and `profile` (no id: the
 * backend reads the own member from the session).
 */
export const LabosAgentContextSchema = z
  .object({
    page: z.enum(['news-story', 'home', 'intro', 'member', 'team', 'job', 'profile']),
    newsUid: z.string().min(1).optional(),
    introTarget: LabosAgentIntroTargetSchema.optional(),
    memberUid: z.string().min(1).max(64).optional(),
    teamUid: z.string().min(1).max(64).optional(),
    jobUid: z.string().min(1).max(64).optional(),
  })
  .refine((context) => context.page !== 'news-story' || !!context.newsUid, {
    message: 'newsUid is required when page is "news-story"',
    path: ['newsUid'],
  })
  .refine((context) => (context.page === 'intro') === !!context.introTarget, {
    message: 'introTarget is required when page is "intro" and not allowed for other pages',
    path: ['introTarget'],
  })
  .refine((context) => (context.page === 'member') === !!context.memberUid, {
    message: 'memberUid is required when page is "member" and not allowed for other pages',
    path: ['memberUid'],
  })
  .refine((context) => (context.page === 'team') === !!context.teamUid, {
    message: 'teamUid is required when page is "team" and not allowed for other pages',
    path: ['teamUid'],
  })
  .refine((context) => context.page === 'job' || !context.jobUid, {
    message: 'jobUid is allowed only when page is "job"',
    path: ['jobUid'],
  });

/** The text limits of the C1 `introDraft` (contract change 4, section 11.1). The minimum is 1, not 20 (11.6). */
export const LABOS_AGENT_INTRO_DRAFT_INPUT_LIMITS = { minLength: 1, maxLength: 3500 } as const;

/**
 * The intro card that waits in this chat, with the member's edits (LAB-3362, contract section 11.1). The frontend sends
 * the newest waiting card only. `.strict()` on the object and on `target` rejects an extra key. The backend uses it for this turn only and stores
 * nothing.
 */
export const LabosAgentIntroDraftSchema = z
  .object({
    // Strict here only: an extra key in the card target fails (Oleg's review). `context.introTarget` stays as it is.
    target: LabosAgentIntroTargetSchema.strict(),
    text: z
      .string()
      .transform((value) => value.trim())
      .refine(
        (value) =>
          value.length >= LABOS_AGENT_INTRO_DRAFT_INPUT_LIMITS.minLength &&
          value.length <= LABOS_AGENT_INTRO_DRAFT_INPUT_LIMITS.maxLength,
        { message: 'introDraft.text must be 1 to 3500 characters after trim' }
      ),
  })
  .strict();
export type LabosAgentIntroDraft = z.infer<typeof LabosAgentIntroDraftSchema>;

/** S6 (LAB-3318, contract 10.3): at most 5 mentions in one C1 message. */
export const LABOS_AGENT_MAX_MENTIONS = 5;

/** The pages a member can mention (contract 10.3). `job` is the job board. */
export const LABOS_AGENT_MENTION_PAGES = ['home', 'job', 'profile'] as const;

/**
 * One item the member picked with `@` or + (S6, contract 10.3). `.strict()` rejects an extra key, for example `uid` on
 * a `page` item or a `label`.
 */
export const LabosAgentMentionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('member'), uid: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('team'), uid: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('news'), uid: z.string().min(1).max(64) }).strict(),
  z.object({ type: z.literal('page'), page: z.enum(LABOS_AGENT_MENTION_PAGES) }).strict(),
]);
export type LabosAgentMention = z.infer<typeof LabosAgentMentionSchema>;

/** The key of a mention: `type:uid`, or `page:<page>`. Two mentions with one key give 400. */
export function labosAgentMentionKey(mention: LabosAgentMention): string {
  return mention.type === 'page' ? `page:${mention.page}` : `${mention.type}:${mention.uid}`;
}

/** The C1 `surface` values (LAB-3457 QA1). */
export const LABOS_AGENT_SURFACES = ['page', 'panel'] as const;
export type LabosAgentSurface = typeof LABOS_AGENT_SURFACES[number];

/** Body of `POST /v1/labos-agent/chat`. */
export const LabosAgentChatRequestSchema = z.object({
  threadId: z.string().min(1).max(64),
  chatId: z.string().min(1).max(64),
  message: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= 1 && value.length <= 2000, {
      message: 'message must be 1 to 2000 characters after trim',
    }),
  context: LabosAgentContextSchema.optional(),
  mentions: z
    .array(LabosAgentMentionSchema)
    .max(LABOS_AGENT_MAX_MENTIONS)
    .refine((items) => new Set(items.map(labosAgentMentionKey)).size === items.length, {
      message: 'mentions must not have two items with the same type and uid, or the same page',
    })
    .optional(),
  /** Contract change 4 (section 11): allowed with any `context.page` and with no `context`. */
  introDraft: LabosAgentIntroDraftSchema.optional(),
  /**
   * LAB-3457: true saves this turn in the shared chat history (`GET /v1/labos-agent/threads`) under `threadId`. The
   * thread is new, or one of the member's own threads (an old AI search thread too). Absent or false: the turn is not
   * saved, as before LAB-3457. Either way, a `threadId` that belongs to another member or is deleted gives 404
   * THREAD_NOT_FOUND before the stream.
   */
  persist: z.boolean().optional(),
  /**
   * LAB-3457 QA1: where the chat is. `page` is the full agent page (`/ai-search`), `panel` the agent panel on any other
   * page. Absent is `panel`, as before. It changes only what the agent tells a member who asks for an intro with no
   * target: on the page, to type @ and pick the member or team, never to open a profile.
   */
  surface: z.enum(LABOS_AGENT_SURFACES).optional(),
});

export type LabosAgentContext = z.infer<typeof LabosAgentContextSchema>;
export type LabosAgentChatRequest = z.infer<typeof LabosAgentChatRequestSchema>;

/** The item types of C4 (contract 10.2). Pages are a frontend list (10.5). */
export const LABOS_AGENT_MENTION_TYPES = ['member', 'team', 'news'] as const;
export type LabosAgentMentionType = typeof LABOS_AGENT_MENTION_TYPES[number];

/** C4 query limits (contract 10.2). */
export const LABOS_AGENT_MENTIONS_QUERY_LIMITS = {
  maxQueryLength: 64,
  minLimit: 1,
  maxLimit: 10,
  defaultLimit: 5,
} as const;

const { maxQueryLength, minLimit, maxLimit, defaultLimit } = LABOS_AGENT_MENTIONS_QUERY_LIMITS;

/**
 * Query of `GET /v1/labos-agent/mentions` (C4). Query values are strings. `q` is trimmed (absent is empty). `types` is a
 * comma list; absent means all three types. `limit` is an integer for each type.
 */
export const LabosAgentMentionsQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => (value ?? '').trim())
    .refine((value) => value.length <= maxQueryLength, {
      message: `q must be 0 to ${maxQueryLength} characters after trim`,
    }),
  types: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? [...LABOS_AGENT_MENTION_TYPES] : value.split(',').map((item) => item.trim())
    )
    .refine(
      (items) =>
        items.length > 0 && items.every((item) => (LABOS_AGENT_MENTION_TYPES as readonly string[]).includes(item)),
      { message: `types must be a comma list of ${LABOS_AGENT_MENTION_TYPES.join(', ')}` }
    )
    .transform((items) => [...new Set(items)] as LabosAgentMentionType[]),
  limit: z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined || (/^\d{1,3}$/.test(value) && Number(value) >= minLimit && Number(value) <= maxLimit),
      { message: `limit must be an integer from ${minLimit} to ${maxLimit}` }
    )
    .transform((value) => (value === undefined ? defaultLimit : Number(value))),
});
export type LabosAgentMentionsQuery = z.infer<typeof LabosAgentMentionsQuerySchema>;

/** C4 member row. No email, phone, handles, Telegram, office hours or bio. */
export type LabosAgentMentionMember = {
  type: 'member';
  uid: string;
  name: string;
  imageUrl: string | null;
  teamName: string | null;
  role: string | null;
};

/** C4 team row. `shortDescription` is cut to 140 characters. */
export type LabosAgentMentionTeam = {
  type: 'team';
  uid: string;
  name: string;
  logoUrl: string | null;
  shortDescription: string | null;
};

/** C4 news row. `eventDate` is ISO. */
export type LabosAgentMentionNews = {
  type: 'news';
  uid: string;
  title: string;
  teamUid: string;
  teamName: string;
  eventDate: string;
};

/** Response 200 of C4. Each key is always present. */
export type LabosAgentMentionsResponse = {
  q: string;
  members: LabosAgentMentionMember[];
  teams: LabosAgentMentionTeam[];
  news: LabosAgentMentionNews[];
};

/** Response of `GET /v1/labos-agent/access`. */
export type LabosAgentAccessResponse = { enabled: boolean };

/** Error codes of C1 (before the stream starts) and C2. */
export const LABOS_AGENT_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AGENT_NOT_ENABLED: 'AGENT_NOT_ENABLED',
  NEWS_NOT_FOUND: 'NEWS_NOT_FOUND',
  INTRO_TARGET_NOT_FOUND: 'INTRO_TARGET_NOT_FOUND',
  MEMBER_NOT_FOUND: 'MEMBER_NOT_FOUND',
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  ACTION_NOT_ALLOWED: 'ACTION_NOT_ALLOWED',
  PROPOSAL_NOT_FOUND: 'PROPOSAL_NOT_FOUND',
  PROPOSAL_CLOSED: 'PROPOSAL_CLOSED',
  PROPOSAL_EXPIRED: 'PROPOSAL_EXPIRED',
  ACTION_FAILED: 'ACTION_FAILED',
  /** LAB-3457: no thread with this id for this member (missing, another member's, or deleted). */
  THREAD_NOT_FOUND: 'THREAD_NOT_FOUND',
  /** LAB-3457 C5: no intro draft with this id in this member's thread. */
  DRAFT_NOT_FOUND: 'DRAFT_NOT_FOUND',
  /** LAB-3457 C5: the draft is already sent or cancelled. The body has `status`. */
  DRAFT_CLOSED: 'DRAFT_CLOSED',
} as const;

/** The propose-only tools (contract section 3, S2). Only C2 runs them. */
export const LABOS_AGENT_PROPOSE_TOOLS = [
  'update_my_profile',
  'add_experience',
  'update_experience',
  'update_team',
] as const;
export type LabosAgentProposeTool = typeof LABOS_AGENT_PROPOSE_TOOLS[number];

export type LabosAgentChangeValue = string | number | boolean | string[] | null;

/** One action proposal in the C1 stream body `proposals` (contract section 4). */
export type LabosAgentProposal = {
  proposalId: string;
  tool: LabosAgentProposeTool;
  title: string;
  targetType: 'member' | 'team';
  targetUid: string;
  changes: Array<{ field: string; label: string; oldValue: LabosAgentChangeValue; newValue: LabosAgentChangeValue }>;
  expiresAt: string;
};

/** Body of `POST /v1/labos-agent/actions/confirm` (contract C2). */
export const LabosAgentConfirmRequestSchema = z.object({
  proposalId: z.string().min(1).max(64),
  decision: z.enum(['confirm', 'cancel']),
});
export type LabosAgentConfirmRequest = z.infer<typeof LabosAgentConfirmRequestSchema>;

/**
 * `status` in the C2 409 `PROPOSAL_CLOSED` body: how the proposal closed. `pending` means another request closed it
 * and its write has not finished yet.
 */
export type LabosAgentClosedStatus = 'done' | 'cancelled' | 'failed' | 'pending';

/** Body of a C2 409 `PROPOSAL_CLOSED` error. */
export type LabosAgentProposalClosedError = {
  statusCode: 409;
  code: typeof LABOS_AGENT_ERROR_CODES.PROPOSAL_CLOSED;
  message: string;
  status: LabosAgentClosedStatus;
};

/** Response 200 of C2. */
export type LabosAgentConfirmResponse = {
  proposalId: string;
  status: 'done' | 'cancelled';
  tool: LabosAgentProposeTool;
  summary: string;
  result: Record<string, unknown>;
};

/** Length limits of an intro draft: the same as the intro modal (LAB-3300, contract section 8.2). C3 allows 4000. */
export const LABOS_AGENT_INTRO_DRAFT_LIMITS = { minLength: 20, maxLength: 3500 } as const;

/**
 * One draft in the C1 stream body `drafts` (LAB-3300, contract section 8.2). The backend does not store it. The
 * member edits the text and sends it with the existing intro API (C3).
 */
export type LabosAgentDraft = {
  draftId: string;
  kind: 'intro';
  target: { type: 'member' | 'team'; uid: string; name: string };
  text: string;
  minLength: number;
  maxLength: number;
  source: 'agent';
};

/**
 * The answer counts at the end of the C1 stream body (LAB-3297, V0-R4). Counts and a boolean only: no text, names,
 * emails or ids. Each field is optional, so an older backend body still parses. The frontend sends them on the
 * `agent-answer-shown` event.
 * - `toolCount`: the tool calls of the model in the turn, all tools, web search too.
 * - `usedWebSearch`: true when at least one web search ran.
 * - `sourceCount`: the distinct items of `sources` and `sourceRefs`, the list the frontend shows as sources.
 */
export const LabosAgentAnswerCountsSchema = z.object({
  toolCount: z.number().int().min(0).optional(),
  usedWebSearch: z.boolean().optional(),
  sourceCount: z.number().int().min(0).optional(),
});
export type LabosAgentAnswerCounts = z.infer<typeof LabosAgentAnswerCountsSchema>;

/**
 * The C1 stream body after the stream ends (contract section 2). Only the fields that every turn has are required.
 * Other keys (`actions`, `proposals`, `drafts`) pass through.
 */
export const LabosAgentChatResponseSchema = z
  .object({
    steps: z.array(z.string()),
    content: z.string(),
    sources: z.array(z.string()),
    followUpQuestions: z.array(z.string()),
    sourceRefs: z.array(z.object({ type: z.string(), title: z.string() }).passthrough()).optional(),
  })
  .merge(LabosAgentAnswerCountsSchema)
  .passthrough();
export type LabosAgentChatResponse = z.infer<typeof LabosAgentChatResponseSchema>;

/*
 * LAB-3457: one shared chat history for the agent panel and the full page (/ai-search). Agent turns go into the same
 * MongoDB `threads` collection as AI search, so a member's old AI search threads are in the same list and continue on
 * the agent backend (C1 with that `threadId` and `persist: true`). Nothing is migrated or hard deleted.
 *
 *   T1 GET    /v1/labos-agent/threads?page&limit   -> LabosAgentThreadListResponse
 *   T2 GET    /v1/labos-agent/threads/:threadId    -> LabosAgentThread
 *   T3 DELETE /v1/labos-agent/threads/:threadId    -> LabosAgentThreadDeleteResponse (soft delete)
 *   C5 POST   /v1/labos-agent/drafts/confirm       -> LabosAgentDraftConfirmResponse (send or cancel a saved draft)
 *
 * All four use the C1 guard and gate: 401 with no member token, 403 AGENT_NOT_ENABLED outside the gate. A thread of
 * another member, or a deleted one, is 404 THREAD_NOT_FOUND (it never says that the thread exists).
 */

/** Where a thread started. An old thread with no source is `ai-search`. */
export const LABOS_AGENT_THREAD_SOURCES = ['ai-search', 'agent'] as const;
export type LabosAgentThreadSource = typeof LABOS_AGENT_THREAD_SOURCES[number];

/** T1 paging limits. */
export const LABOS_AGENT_THREADS_QUERY_LIMITS = {
  minLimit: 1,
  maxLimit: 50,
  defaultLimit: 20,
  maxPage: 10000,
} as const;

const pageInt = (name: string, min: number, max: number, fallback: number) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || (/^\d{1,5}$/.test(value) && Number(value) >= min && Number(value) <= max),
      {
        message: `${name} must be an integer from ${min} to ${max}`,
      }
    )
    .transform((value) => (value === undefined ? fallback : Number(value)));

/** Query of T1. Query values are strings. `page` starts at 1. */
export const LabosAgentThreadsQuerySchema = z.object({
  page: pageInt('page', 1, LABOS_AGENT_THREADS_QUERY_LIMITS.maxPage, 1),
  limit: pageInt(
    'limit',
    LABOS_AGENT_THREADS_QUERY_LIMITS.minLimit,
    LABOS_AGENT_THREADS_QUERY_LIMITS.maxLimit,
    LABOS_AGENT_THREADS_QUERY_LIMITS.defaultLimit
  ),
});
export type LabosAgentThreadsQuery = z.infer<typeof LabosAgentThreadsQuerySchema>;

/** Path param of T2, T3 (the same limits as the C1 `threadId`). */
export const LabosAgentThreadIdSchema = z.string().min(1).max(64);

/**
 * One row of T1. `title` is never empty: a thread with no title gets its first question (cut to 80 characters).
 * `context` is the C1 context of the first saved agent turn, absent for AI search threads. Times are ISO.
 */
export type LabosAgentThreadListItem = {
  threadId: string;
  title: string;
  source: LabosAgentThreadSource;
  context?: LabosAgentContext;
  createdAt: string;
  updatedAt: string;
};

/**
 * Response 200 of T1: the member's threads with at least one turn, newest `updatedAt` first. Old AI search threads of
 * the member's email and agent threads of the member are in one list. Deleted threads are not.
 */
export type LabosAgentThreadListResponse = {
  page: number;
  limit: number;
  total: number;
  items: LabosAgentThreadListItem[];
};

/**
 * The state of a saved action card. `open` is past `expiresAt` reads as `expired`. Only `open` (before `expiresAt`)
 * can still go to C2.
 */
export type LabosAgentStoredProposalStatus = 'open' | 'done' | 'cancelled' | 'failed' | 'expired';

/** A saved action card: the C1 proposal plus its state. `summary` is the C2 summary after `done` or `cancelled`. */
export type LabosAgentStoredProposal = LabosAgentProposal & {
  status: LabosAgentStoredProposalStatus;
  summary?: string;
};

/** The state of a saved intro draft card. Only `open` can go to C5. */
export type LabosAgentStoredDraftStatus = 'open' | 'sent' | 'cancelled';

/**
 * A saved intro draft card: the C1 draft plus its state. After `sent`, `text` is the sent text and `introRequestUid` is
 * the intro request. The frontend still decides "Replaced by a newer draft" for an older open card.
 */
export type LabosAgentStoredDraft = LabosAgentDraft & {
  status: LabosAgentStoredDraftStatus;
  introRequestUid?: string;
  sentAt?: string;
};

/** The thumbs rating of a turn (AI search feedback, `/v1/husky/chat/feedback`), when the member gave one. */
export type LabosAgentTurnFeedback = { rating: unknown; reasons?: unknown };

/** Fields of every turn. `chatId` is the C1 `chatId` (the AI search `questionId`). `content` is the answer text. */
type LabosAgentTurnBase = {
  chatId: string;
  question: string;
  content: string;
  sources: string[];
  sourceRefs?: Array<{ type: string; title: string; [key: string]: unknown }>;
  followUpQuestions: string[];
  /** AI search directory result cards. Agent turns save what the tail gave (often empty). */
  actions: unknown[];
  /** ISO, or null for an old turn with no time. */
  createdAt: string | null;
  feedback?: LabosAgentTurnFeedback;
};

/** An old AI search turn: shown as saved, no steps and no cards. */
export type LabosAgentLegacyTurn = LabosAgentTurnBase & { kind: 'ai-search' };

/** A saved agent turn: what the member saw when it finished. A stopped or failed turn is not saved. */
export type LabosAgentSavedTurn = LabosAgentTurnBase &
  LabosAgentAnswerCounts & {
    kind: 'agent';
    /** The step lines of the stream, in order ("Worked for … · N steps" opens them). */
    steps: string[];
    context?: LabosAgentContext;
    mentions?: LabosAgentMention[];
    proposals: LabosAgentStoredProposal[];
    drafts: LabosAgentStoredDraft[];
  };

export type LabosAgentThreadTurn = LabosAgentLegacyTurn | LabosAgentSavedTurn;

/** Response 200 of T2: the thread with its turns, oldest first. It also loads the thread memory for the next C1 turn. */
export type LabosAgentThread = LabosAgentThreadListItem & { turns: LabosAgentThreadTurn[] };

/** Response 200 of T3. The thread leaves both histories (agent and AI search); the data is kept. */
export type LabosAgentThreadDeleteResponse = { threadId: string; deleted: true };

/**
 * Body of C5 `POST /v1/labos-agent/drafts/confirm`: send or cancel one saved intro draft card. `send` needs `text`
 * (the card text with the member's edits, 20 to 3500 characters after trim) and sends it with the intro API (C3) to
 * the saved draft target. The target always comes from the saved draft, never from the body. A draft is sent at most
 * once.
 */
export const LabosAgentDraftConfirmRequestSchema = z
  .object({
    threadId: z.string().min(1).max(64),
    draftId: z.string().min(1).max(64),
    decision: z.enum(['send', 'cancel']),
    text: z
      .string()
      .transform((value) => value.trim())
      .refine(
        (value) =>
          value.length >= LABOS_AGENT_INTRO_DRAFT_LIMITS.minLength &&
          value.length <= LABOS_AGENT_INTRO_DRAFT_LIMITS.maxLength,
        { message: 'text must be 20 to 3500 characters after trim' }
      )
      .optional(),
  })
  .strict()
  .refine((body) => body.decision !== 'send' || body.text !== undefined, {
    message: 'text is required when decision is "send"',
    path: ['text'],
  });
export type LabosAgentDraftConfirmRequest = z.infer<typeof LabosAgentDraftConfirmRequestSchema>;

/** Response 200 of C5. */
export type LabosAgentDraftConfirmResponse = {
  draftId: string;
  status: 'sent' | 'cancelled';
  introRequestUid?: string;
};

/** Body of a C5 409 DRAFT_CLOSED error: how the draft closed. */
export type LabosAgentDraftClosedError = {
  statusCode: 409;
  code: typeof LABOS_AGENT_ERROR_CODES.DRAFT_CLOSED;
  message: string;
  status: 'sent' | 'cancelled';
};
