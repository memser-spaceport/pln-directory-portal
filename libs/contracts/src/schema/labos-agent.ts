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
