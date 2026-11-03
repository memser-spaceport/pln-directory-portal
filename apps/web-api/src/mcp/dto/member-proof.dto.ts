import { createZodDto } from '@abitia/zod-dto';
import { z } from 'zod';

/** Scopes a member proof can carry the level of: AI Apps (LAB-2900, the default) or Forum for NodeBB (LAB-3075). */
export const MEMBER_PROOF_SCOPES = ['ai_apps', 'forum'] as const;
export type MemberProofScope = typeof MEMBER_PROOF_SCOPES[number];

/**
 * `POST /v1/mcp/member-proofs`. `audience` is the uid of the integration key that will redeem the proof; `scope` picks
 * which of the connection's levels the proof carries.
 */
export const IssueMemberProofSchema = z.object({
  audience: z.string().trim().min(1).max(64),
  scope: z.enum(MEMBER_PROOF_SCOPES).optional(),
});
export class IssueMemberProofDto extends createZodDto(IssueMemberProofSchema) {}

/** `POST /v1/integrations/member-proofs/redeem`. */
export const RedeemMemberProofSchema = z.object({ proof: z.string().min(1).max(200) });
export class RedeemMemberProofDto extends createZodDto(RedeemMemberProofSchema) {}
