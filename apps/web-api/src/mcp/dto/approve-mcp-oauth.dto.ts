import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const ApproveMcpOAuthSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
  state: z.string().optional(),
  resource: z.string().optional(),
});

export class ApproveMcpOAuthDto extends createZodDto(ApproveMcpOAuthSchema) {}
