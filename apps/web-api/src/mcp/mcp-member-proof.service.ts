import {
  BadRequestException,
  CACHE_MANAGER,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cache } from 'cache-manager';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { MemberSignInService, SignedInMember } from '../integration-keys/member-sign-in.service';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { trackMcpToolCalled } from './mcp-analytics';
import { MemberProofScope } from './dto/member-proof.dto';
import { limitRefusalText, limitWarningText } from './mcp-limit.messages';
import { McpLimitService } from './mcp-limit.service';
import { MCP_CONNECT_PERMISSION, MCP_MEMBER_PROOF_TTL_SECONDS, MCP_TOKEN_PREFIX } from './mcp.constants';
import { generateSecret, hashSecret } from './mcp.crypto';
import { McpOAuthService } from './mcp-oauth.service';
import { scopeLabel } from './mcp-scopes.registry';
import { McpScopesService } from './mcp-scopes.service';

const MEMBER_SIGN_IN_SCOPE = 'members:sign-in';
const INVALID_PROOF = 'Invalid or expired member proof';

type StoredProof = {
  memberUid: string;
  authorizationUid: string;
  clientName: string;
  access: 'read' | 'write';
  /** Missing on proofs issued before LAB-3075, which all carried the AI Apps level. */
  scope?: MemberProofScope;
  audience: string;
};

export type RedeemedMemberProof = SignedInMember & {
  /** The agent's connection; lets the app record which connection acted. */
  authorizationUid: string;
  agent: { clientName: string; access: 'read' | 'write'; scope: MemberProofScope };
};

function proofKey(proof: string): string {
  const env = process.env.ENVIRONMENT ?? 'local';
  return `${env}:mcp-member-proof:${hashSecret(proof)}`;
}

/**
 * One-time proof of "this member, through this agent" for a PL app outside LabOS (LAB-2900). An agent exchanges its
 * MCP access token for a proof bound to one integration key; that app's server redeems it once, within 5 minutes,
 * with the same key. Same shape as member sign-in for the ATS: the proof lives only in the cache, hashed.
 *
 * The proof carries the connection's level for one scope: AI Apps by default, or Forum for the forum (LAB-3075). A
 * connection with no access to that scope gets no proof.
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
    private readonly scopes: McpScopesService,
    private readonly limits: McpLimitService
  ) {}

  async issue(
    accessToken: string,
    audience: string,
    scope: MemberProofScope = 'ai_apps'
  ): Promise<{ proof: string; expiresAt: Date; warning?: string }> {
    const actor = await this.oauth.authenticateAccessToken(accessToken);
    const key = await this.prisma.integrationKey.findUnique({
      where: { uid: audience },
      select: { revokedAt: true, scopes: true },
    });
    if (!key || key.revokedAt || !key.scopes.includes(MEMBER_SIGN_IN_SCOPE)) {
      throw new NotFoundException('Unknown audience');
    }

    const access = await this.accessFor(actor.scopeLevels, scope);
    if (access === 'none') {
      throw new ForbiddenException(`This connection has no ${scopeLabel(scope)} access`);
    }

    let warning: string | undefined;
    if (scope === 'forum' && access === 'write') {
      const decision = await this.limits.tryConsume(actor.memberUid, 'forum_post');
      trackMcpToolCalled(this.analytics, actor, {
        toolName: 'forum_post',
        result: decision.allowed ? 'ok' : 'refused',
        reason: decision.allowed ? undefined : decision.unavailable ? 'limit_unavailable' : 'rate_limited',
        callType: 'forum_post',
        limitResult: decision.allowed ? (decision.warned ? 'warned' : 'allowed') : 'limited',
      });
      if (!decision.allowed) {
        throw new HttpException(limitRefusalText(decision), HttpStatus.TOO_MANY_REQUESTS);
      }
      if (decision.warned) warning = limitWarningText(decision);
    }

    const proof = generateSecret(MCP_TOKEN_PREFIX.memberProof);
    const expiresAt = new Date(Date.now() + MCP_MEMBER_PROOF_TTL_SECONDS * 1000);
    const stored: StoredProof = {
      memberUid: actor.memberUid,
      authorizationUid: actor.authorizationUid,
      clientName: actor.clientName,
      access,
      scope,
      audience,
    };
    await this.cache.set(proofKey(proof), stored, { ttl: MCP_MEMBER_PROOF_TTL_SECONDS });
    this.track(ANALYTICS_EVENTS.MCP.MEMBER_PROOF_ISSUED, actor.memberUid, { audience, scope });
    return warning ? { proof, expiresAt, warning } : { proof, expiresAt };
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

    // Claim before anything else: Redis DEL answers 1 to exactly one caller, so a proof redeems once even when
    // two requests race.
    if (!(await this.claim(key))) {
      throw new BadRequestException(INVALID_PROOF);
    }

    const authorization = await this.prisma.mcpAuthorization.findUnique({
      where: { uid: stored.authorizationUid },
      select: { revokedAt: true },
    });
    const { allowed } = await this.accessControl.hasPermission(stored.memberUid, MCP_CONNECT_PERMISSION);
    if (!authorization || authorization.revokedAt || !allowed) {
      throw new BadRequestException(INVALID_PROOF);
    }

    const scope = stored.scope ?? 'ai_apps';
    const member = await this.signIn.member(stored.memberUid);
    this.track(ANALYTICS_EVENTS.MCP.MEMBER_PROOF_REDEEMED, stored.memberUid, { audience: callerKeyUid, scope });
    return {
      ...member,
      authorizationUid: stored.authorizationUid,
      agent: { clientName: stored.clientName, access: stored.access, scope },
    };
  }

  private async accessFor(
    levels: Parameters<McpScopesService['aiAppsAccess']>[0],
    scope: MemberProofScope
  ): Promise<'none' | 'read' | 'write'> {
    // AI Apps keeps its LAB-2900 behavior: never below read, read when admin settings can't be read.
    if (scope === 'ai_apps') {
      return this.scopes.aiAppsAccess(levels);
    }
    // Other scopes fail closed: unreadable admin settings throw and no proof is issued.
    return this.scopes.scopeLevel(levels, scope);
  }

  /** True for the one caller whose delete removed the entry. */
  private async claim(key: string): Promise<boolean> {
    const deleted = await (this.cache.del as (key: string) => Promise<unknown>)(key);
    return deleted === 1;
  }

  private track(name: string, memberUid: string, properties: Record<string, unknown>) {
    this.analytics
      .trackEvent({ name, distinctId: memberUid, properties: { memberUid, ...properties } })
      .catch((error) => {
        this.logger.warn(`Failed to track ${name}`, error);
      });
  }
}
