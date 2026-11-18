import { z } from 'zod';

/** The page the member is on when they ask (LAB-3272 contract C1). S1 has two pages. */
export const LabosAgentContextSchema = z
  .object({
    page: z.enum(['news-story', 'home']),
    newsUid: z.string().min(1).optional(),
  })
  .refine((context) => context.page !== 'news-story' || !!context.newsUid, {
    message: 'newsUid is required when page is "news-story"',
    path: ['newsUid'],
  });

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
});

export type LabosAgentContext = z.infer<typeof LabosAgentContextSchema>;
export type LabosAgentChatRequest = z.infer<typeof LabosAgentChatRequestSchema>;

/** Response of `GET /v1/labos-agent/access`. */
export type LabosAgentAccessResponse = { enabled: boolean };

/** Error codes of C1 (before the stream starts) and C2. */
export const LABOS_AGENT_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AGENT_NOT_ENABLED: 'AGENT_NOT_ENABLED',
  NEWS_NOT_FOUND: 'NEWS_NOT_FOUND',
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

/** Response 200 of C2. */
export type LabosAgentConfirmResponse = {
  proposalId: string;
  status: 'done' | 'cancelled';
  tool: LabosAgentProposeTool;
  summary: string;
  result: Record<string, unknown>;
};
