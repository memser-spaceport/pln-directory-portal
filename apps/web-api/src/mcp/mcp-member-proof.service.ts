import { BadRequestException, CACHE_MANAGER, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { MemberSignInService, SignedInMember } from '../integration-keys/member-sign-in.service';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { MCP_CONNECT_PERMISSION, MCP_MEMBER_PROOF_TTL_SECONDS, MCP_TOKEN_PREFIX } from './mcp.constants';
import { generateSecret, hashSecret } from './mcp.crypto';
import { McpOAuthService } from './mcp-oauth.service';
import { McpScopesService } from './mcp-scopes.service';

const MEMBER_SIGN_IN_SCOPE = 'members:sign-in';
const INVALID_PROOF = 'Invalid or expired member proof';

type StoredProof = {
  memberUid: string;
  authorizationUid: string;
  clientName: string;
  access: 'read' | 'write';
  audience: string;
};

export type RedeemedMemberProof = SignedInMember & { agent: { clientName: string; access: 'read' | 'write' } };

function proofKey(proof: string): string {
  const env = process.env.ENVIRONMENT ?? 'local';
  return `${env}:mcp-member-proof:${hashSecret(proof)}`;
}

/**
 * One-time proof of "this member, through this agent" for a PL app outside LabOS (LAB-2900). An agent exchanges its
 * MCP access token for a proof bound to one integration key; that app's server redeems it once, within 5 minutes,
 * with the same key. Same shape as member sign-in for the ATS: the proof lives only in the cache, hashed.
 */
@Injectable()
export class McpMemberProofService {
  private readonly logger = new Logger(McpMemberProofService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: McpOAuthService,
    private readonly accessControl: AccessControlV2Service,
    private readonly signIn: MemberSignInService,
    private readonly analytics: AnalyticsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly scopes: McpScopesService
  ) {}

  async issue(accessToken: string, audience: string): Promise<{ proof: string; expiresAt: Date }> {
    const actor = await this.oauth.authenticateAccessToken(accessToken);
    const key = await this.prisma.integrationKey.findUnique({
      where: { uid: audience },
      select: { revokedAt: true, scopes: true },
    });
    if (!key || key.revokedAt || !key.scopes.includes(MEMBER_SIGN_IN_SCOPE)) {
      throw new NotFoundException('Unknown audience');
    }

    const proof = generateSecret(MCP_TOKEN_PREFIX.memberProof);
    const expiresAt = new Date(Date.now() + MCP_MEMBER_PROOF_TTL_SECONDS * 1000);
    const stored: StoredProof = {
      memberUid: actor.memberUid,
      authorizationUid: actor.authorizationUid,
      clientName: actor.clientName,
      access: await this.scopes.aiAppsAccess(actor.scopeLevels),
      audience,
    };
    await this.cache.set(proofKey(proof), stored, { ttl: MCP_MEMBER_PROOF_TTL_SECONDS });
    this.track(ANALYTICS_EVENTS.MCP.MEMBER_PROOF_ISSUED, actor.memberUid, { audience });
    return { proof, expiresAt };
  }

  /**
   * The member behind a proof, for the integration key it was issued to. A proof for another key stays redeemable by
   * its own key; every refusal is the same 400.
   */
  async redeem(proof: string, callerKeyUid: string): Promise<RedeemedMemberProof> {
    const key = proofKey(proof);
    const stored = await this.cache.get<StoredProof>(key);
    if (!stored || stored.audience !== callerKeyUid) {
      throw new BadRequestException(INVALID_PROOF);
    }

    const authorization = await this.prisma.mcpAuthorization.findUnique({
      where: { uid: stored.authorizationUid },
      select: { revokedAt: true },
    });
    const { allowed } = await this.accessControl.hasPermission(stored.memberUid, MCP_CONNECT_PERMISSION);
    await this.cache.del(key);
    if (!authorization || authorization.revokedAt || !allowed) {
      throw new BadRequestException(INVALID_PROOF);
    }

    const member = await this.signIn.member(stored.memberUid);
    this.track(ANALYTICS_EVENTS.MCP.MEMBER_PROOF_REDEEMED, stored.memberUid, { audience: callerKeyUid });
    return { ...member, agent: { clientName: stored.clientName, access: stored.access } };
  }

  private track(name: string, memberUid: string, properties: Record<string, unknown>) {
    this.analytics
      .trackEvent({ name, distinctId: memberUid, properties: { memberUid, ...properties } })
      .catch((error) => {
        this.logger.warn(`Failed to track ${name}`, error);
      });
  }
}
