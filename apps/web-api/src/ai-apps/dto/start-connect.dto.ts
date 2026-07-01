import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/**
 * Body posted by the member's AI agent to `POST /v1/ai-apps/connect` to start a
 * connect session. No auth — starting a session grants nothing; only a member
 * approving it in LabOS mints a deploy token. `clientName` is an optional label
 * (e.g. "Claude Code") shown on the connect page so the member knows what is
 * asking to connect.
 */
export const StartConnectSchema = z.object({
  clientName: z.string().max(100).optional(),
});

export class StartConnectDto extends createZodDto(StartConnectSchema) {}
