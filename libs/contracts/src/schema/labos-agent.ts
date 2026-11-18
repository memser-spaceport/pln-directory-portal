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

/** Error codes before the stream starts. */
export const LABOS_AGENT_ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AGENT_NOT_ENABLED: 'AGENT_NOT_ENABLED',
  NEWS_NOT_FOUND: 'NEWS_NOT_FOUND',
} as const;
