import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** `POST /v1/mcp/member-proofs`. `audience` is the uid of the integration key that will redeem the proof. */
export const IssueMemberProofSchema = z.object({ audience: z.string().trim().min(1).max(64) });
export class IssueMemberProofDto extends createZodDto(IssueMemberProofSchema) {}

/** `POST /v1/integrations/member-proofs/redeem`. */
export const RedeemMemberProofSchema = z.object({ proof: z.string().min(1).max(200) });
export class RedeemMemberProofDto extends createZodDto(RedeemMemberProofSchema) {}
