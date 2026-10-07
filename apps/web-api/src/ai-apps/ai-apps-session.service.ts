import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../shared/prisma.service';
import {
  AI_APPS_SESSION_CODE_TTL_MS,
  AI_APPS_SESSION_IDLE_MS,
  AI_APPS_SESSION_ISSUER,
  AI_APPS_SESSION_MAX_MS,
  AI_APPS_SESSION_SECRET,
  AI_APPS_SESSION_TOUCH_MS,
  AI_APPS_TESTING_SESSION_MAX_MS,
  AiAppTargetEnvironment,
  buildAppUrl,
} from './ai-apps.constants';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export type AiAppSessionGrant = { token: string; expiresAt: Date };

/** The claims a deployed app sees when it decodes its session token. */
type AiAppSessionClaims = {
  iss: string;
  aud: string;
  uid: string;
  email: string | null;
  jti: string;
  exp: number;
  /** Set only for a testing-user Preview session (LAB-2744). */
  testing?: true;
  /** Set only for a session an agent minted (LAB-2763). Apps read this claim. */
  isAgent?: true;
};

/** A live session. Real member sessions are exactly `{ memberUid }`; testing and agent sessions add the claim. */
export type AiAppValidatedSession = {
  memberUid: string;
  testing?: true;
  isAgent?: true;
  sessionUid?: string;
  createdAt?: Date;
  lastUsedAt?: Date;
};

/** A JWT's payload without verifying it (the installed jsonwebtoken build ships no `decode`). */
function unverifiedClaims(token: string): Record<string, unknown> | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/** Unverified check used by guards to route app session tokens away from LabOS token introspection. */
export function isAiAppSessionToken(token: string | undefined | null): boolean {
  return !!token && unverifiedClaims(token)?.iss === AI_APPS_SESSION_ISSUER;
}

/** The appId an app session token claims to be for (unverified; for logging only). */
export function aiAppSessionTokenAppId(token: string): string | null {
  const aud = unverifiedClaims(token)?.aud;
  return typeof aud === 'string' ? aud : null;
}

/** Unverified check for a testing-user session (the signed `testing` claim). */
export function isTestingSessionToken(token: string | undefined | null): boolean {
  return !!token && unverifiedClaims(token)?.testing === true;
}

/**
 * App-scoped member sessions for deployed AI Apps (LAB-2695). A session is bound to one appId and one member; its
 * token is a signed JWT carrying the same `email` claim apps read from the LabOS token today, but it is only valid
 * for that app and only while its stored record says so (idle timeout, absolute expiry, revocation).
 */
@Injectable()
export class AiAppsSessionService {
  private readonly logger = new Logger(AiAppsSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return AI_APPS_SESSION_SECRET.length >= 32;
  }

  private assertEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException('AI App sessions are not configured');
    }
  }

  /** One-time code for the LabOS sign-in round trip, plus the target's origin the member is sent back to. */
  async issueCode(memberUid: string, appId: string, environment: AiAppTargetEnvironment) {
    this.assertEnabled();
    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + AI_APPS_SESSION_CODE_TTL_MS);
    await this.prisma.aiAppSessionCode.create({
      data: { codeHash: sha256(code), appId, environment, memberUid, expiresAt },
    });
    return { code, callbackOrigin: buildAppUrl(appId, environment), expiresAt };
  }

  /** Redeems a code once, for the same appId + target it was issued for, and opens a session. */
  async redeemCode(code: string, appId: string, environment: AiAppTargetEnvironment): Promise<AiAppSessionGrant> {
    this.assertEnabled();
    const codeHash = sha256(code);
    const now = new Date();
    // Marks the code used in the same statement that checks it, so two concurrent redeems can't both succeed.
    const claimed = await this.prisma.aiAppSessionCode.updateMany({
      where: { codeHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    const row = claimed.count ? await this.prisma.aiAppSessionCode.findUnique({ where: { codeHash } }) : null;
    if (!row || row.appId !== appId || row.environment !== environment) {
      throw new BadRequestException('Invalid or expired sign-in code');
    }
    return this.openSession(row.memberUid, appId);
  }

  /** Opens a session for a member already authenticated with a LabOS token (the gate's silent path). */
  async exchangeToken(memberUid: string, appId: string): Promise<AiAppSessionGrant> {
    this.assertEnabled();
    return this.openSession(memberUid, appId);
  }

  /**
   * Opens a session for a member an agent is acting as (LAB-2763). Same lifetime as a browser session.
   * `mcpAuthorizationUid` is stored for LAB-2764 and is not put in the token.
   */
  async openAgentSession(memberUid: string, appId: string, mcpAuthorizationUid: string): Promise<AiAppSessionGrant> {
    this.assertEnabled();
    return this.openSession(memberUid, appId, { mcpAuthorizationUid });
  }

  /**
   * One Preview session for a testing user. Absolute 24h lifetime (idle capped at the same instant), no member
   * lookup, and a `testing` claim so the access check can refuse Production. Minting again does not revoke this one.
   */
  async openTestingSession(testingUserUid: string, appId: string): Promise<AiAppSessionGrant> {
    this.assertEnabled();
    const now = Date.now();
    const createdAt = new Date(now);
    const expiresAt = new Date(now + AI_APPS_TESTING_SESSION_MAX_MS);
    const jti = randomBytes(16).toString('hex');
    const claims: Omit<AiAppSessionClaims, 'exp'> = {
      iss: AI_APPS_SESSION_ISSUER,
      aud: appId,
      uid: testingUserUid,
      email: null,
      jti,
      testing: true,
    };
    const token = jwt.sign({ ...claims, exp: Math.floor(expiresAt.getTime() / 1000) }, AI_APPS_SESSION_SECRET, {
      algorithm: 'HS256',
    });
    await this.prisma.aiAppSession.create({
      data: {
        uid: jti,
        appId,
        memberUid: testingUserUid,
        tokenHash: sha256(token),
        createdAt,
        lastUsedAt: createdAt,
        idleExpiresAt: expiresAt,
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  private async openSession(
    memberUid: string,
    appId: string,
    agent?: { mcpAuthorizationUid: string }
  ): Promise<AiAppSessionGrant> {
    const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { email: true } });
    const now = Date.now();
    const expiresAt = new Date(now + AI_APPS_SESSION_MAX_MS);
    const jti = randomBytes(16).toString('hex');
    const claims: Omit<AiAppSessionClaims, 'exp'> = {
      iss: AI_APPS_SESSION_ISSUER,
      aud: appId,
      uid: memberUid,
      email: member?.email ?? null,
      jti,
      ...(agent ? { isAgent: true as const } : {}),
    };
    const token = jwt.sign({ ...claims, exp: Math.floor(expiresAt.getTime() / 1000) }, AI_APPS_SESSION_SECRET, {
      algorithm: 'HS256',
    });
    await this.prisma.aiAppSession.create({
      data: {
        uid: jti,
        appId,
        memberUid,
        tokenHash: sha256(token),
        idleExpiresAt: new Date(Math.min(now + AI_APPS_SESSION_IDLE_MS, expiresAt.getTime())),
        expiresAt,
        isAgent: !!agent,
        mcpAuthorizationUid: agent?.mcpAuthorizationUid,
      },
    });
    return { token, expiresAt };
  }

  /**
   * The member of a live session for this app, or null. Checks the signature, the stored record (revocation, idle
   * and absolute expiry) and the binding to `appId`; slides the idle expiry, writing at most every few minutes.
   */
  async validate(appId: string, token: string, options?: { touch?: boolean }): Promise<AiAppValidatedSession | null> {
    if (!this.enabled || !token) return null;
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, AI_APPS_SESSION_SECRET, {
        algorithms: ['HS256'],
        issuer: AI_APPS_SESSION_ISSUER,
        audience: appId,
      }) as jwt.JwtPayload;
    } catch {
      return null;
    }
    const row = await this.prisma.aiAppSession.findUnique({ where: { tokenHash: sha256(token) } });
    const now = Date.now();
    if (
      !row ||
      row.appId !== appId ||
      row.revokedAt ||
      row.expiresAt.getTime() <= now ||
      row.idleExpiresAt.getTime() <= now
    ) {
      return null;
    }
    if (options?.touch !== false && now - row.lastUsedAt.getTime() >= AI_APPS_SESSION_TOUCH_MS) {
      await this.prisma.aiAppSession.update({
        where: { uid: row.uid },
        data: {
          lastUsedAt: new Date(now),
          idleExpiresAt: new Date(Math.min(now + AI_APPS_SESSION_IDLE_MS, row.expiresAt.getTime())),
        },
      });
    }
    if (payload.testing === true) {
      return {
        memberUid: row.memberUid,
        testing: true,
        sessionUid: row.uid,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
      };
    }
    if (row.isAgent) {
      return { memberUid: row.memberUid, isAgent: true };
    }
    return { memberUid: row.memberUid };
  }

  /**
   * True when `token` is a still-live testing session for a different app. Expired, revoked and ordinary member
   * tokens are false so the caller keeps answering 401.
   */
  async isLiveTestingSessionForOtherApp(token: string, appId: string): Promise<boolean> {
    if (!this.enabled || !token || !isTestingSessionToken(token)) return false;
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, AI_APPS_SESSION_SECRET, {
        algorithms: ['HS256'],
        issuer: AI_APPS_SESSION_ISSUER,
      }) as jwt.JwtPayload;
    } catch {
      return false;
    }
    const aud = typeof payload.aud === 'string' ? payload.aud : null;
    if (payload.testing !== true || !aud || aud === appId) return false;
    const row = await this.prisma.aiAppSession.findUnique({ where: { tokenHash: sha256(token) } });
    const now = Date.now();
    if (!row || row.revokedAt || row.expiresAt.getTime() <= now || row.idleExpiresAt.getTime() <= now) return false;
    return row.appId !== appId;
  }

  /** First successful Preview open of a testing session. One caller wins; later requests see a moved `lastUsedAt`. */
  async claimFirstUse(sessionUid: string, createdAt: Date): Promise<boolean> {
    const result = await this.prisma.aiAppSession.updateMany({
      where: { uid: sessionUid, lastUsedAt: createdAt, revokedAt: null },
      data: { lastUsedAt: new Date() },
    });
    return result.count === 1;
  }

  /** Whether a browser `Origin` belongs to the app (its prod or preview target). A missing origin (server call) passes. */
  isAppOrigin(appId: string, origin: string | undefined): boolean {
    if (!origin) return true;
    return origin === buildAppUrl(appId, 'prod') || origin === buildAppUrl(appId, 'preview');
  }

  /**
   * Member behind an app session token presented to an app-facing route (`/me`, `/track`): the token must be live
   * for the app it names, and a browser `Origin` must be one of that app's own origins. Null otherwise.
   */
  async authenticateAppRequest(
    token: string,
    origin: string | undefined
  ): Promise<(AiAppValidatedSession & { appId: string }) | null> {
    const appId = aiAppSessionTokenAppId(token);
    if (!appId || !this.isAppOrigin(appId, origin)) return null;
    const session = await this.validate(appId, token, isTestingSessionToken(token) ? { touch: false } : undefined);
    return session ? { ...session, appId } : null;
  }

  /** LabOS sign-out: ends every app session of the member. */
  async revokeAllForMember(memberUid: string): Promise<number> {
    const result = await this.prisma.aiAppSession.updateMany({
      where: { memberUid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  @Cron(process.env.AI_APPS_SESSION_CLEANUP_CRON || '30 3 * * *', { name: 'ai-app-session-cleanup' })
  async cleanup(): Promise<void> {
    const now = new Date();
    try {
      const sessions = await this.prisma.aiAppSession.deleteMany({ where: { expiresAt: { lt: now } } });
      const codes = await this.prisma.aiAppSessionCode.deleteMany({ where: { expiresAt: { lt: now } } });
      this.logger.log(`AI App session cleanup: ${sessions.count} sessions, ${codes.count} codes removed`);
    } catch (error) {
      this.logger.error(`AI App session cleanup failed: ${(error as Error).message}`);
    }
  }
}
