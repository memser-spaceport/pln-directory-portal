import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

export const ApproveMcpOAuthSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(1),
  codeChallengeMethod: z.literal('S256'),
  state: z.string().optional(),
  resource: z.string().optional(),
  /** Accepted for older consent pages and ignored: every consent starts read only (LAB-2995). */
  allowChanges: z.boolean().optional(),
  /** The member acknowledged that read access shows other members' contact details. Stored as `contactAckAt`. */
  acknowledgedContactDetails: z.boolean().optional(),
});

export class ApproveMcpOAuthDto extends createZodDto(ApproveMcpOAuthSchema) {}
