import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, randomInt } from 'crypto';
import { AiAppConnectSession, AiAppEventType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import {
  AI_APP_DEPLOY_TOKEN_PREFIX,
  AI_APPS_CONNECT_POLL_INTERVAL_SEC,
  AI_APPS_CONNECT_SESSION_TTL_MS,
  AI_APPS_DEPLOY_TOKEN_TTL_MS,
  buildConnectUrl,
} from './ai-apps.constants';

/** Unambiguous alphabet for the human-readable confirmation code (no 0/O/1/I). */
const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Public connect-session status the agent/UI see (lowercased domain status). */
type ConnectOutcome = 'pending' | 'approved' | 'denied' | 'expired';

@Injectable()
export class AiAppsConnectService {
  private readonly logger = new Logger(AiAppsConnectService.name);

  constructor(private readonly prisma: PrismaService, private readonly accessControl: AccessControlV2Service) {}

  private generateUserCode(): string {
    const pick = () =>
      Array.from({ length: 4 }, () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)]).join('');
    return `${pick()}-${pick()}`;
  }

  /**
   * Starts a PENDING connect session for an agent (no auth). Returns the
   * connect URL the member opens, the confirmation code, and the `pollToken`
   * the agent uses to collect its deploy token once approved.
   */
  async startSession(clientName?: string) {
    let session: AiAppConnectSession | null = null;
    const expiresAt = new Date(Date.now() + AI_APPS_CONNECT_SESSION_TTL_MS);
    for (let attempt = 0; attempt < 5 && !session; attempt++) {
      try {
        session = await this.prisma.aiAppConnectSession.create({
          data: {
            userCode: this.generateUserCode(),
            pollToken: randomBytes(24).toString('hex'),
            clientName: clientName?.trim() || null,
            expiresAt,
          },
        });
      } catch (error) {
        // Retry on the rare userCode collision; rethrow anything else.
        if ((error as { code?: string }).code !== 'P2002') throw error;
      }
    }
    if (!session) {
      throw new Error('Failed to allocate a unique connect session code');
    }

    return {
      sessionId: session.uid,
      userCode: session.userCode,
      connectUrl: buildConnectUrl(session.uid),
      pollToken: session.pollToken,
      pollIntervalSec: AI_APPS_CONNECT_POLL_INTERVAL_SEC,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Display info for the LabOS connect page (no secrets). Marks a stale PENDING
   * session EXPIRED so the page can render the right state.
   */
  async getSessionForDisplay(uid: string) {
    let session = await this.prisma.aiAppConnectSession.findUnique({ where: { uid } });
    if (!session) {
      throw new NotFoundException(`Connect session not found: ${uid}`);
    }
    session = await this.expireIfStale(session);
    return {
      sessionId: session.uid,
      userCode: session.userCode,
      clientName: session.clientName,
      status: session.status.toLowerCase() as ConnectOutcome,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Member approval from the LabOS connect page. Checks `ai_apps.write`: on
   * success mints a short-lived deploy token bound to the session; otherwise
   * marks it DENIED. Both outcomes are audited.
   */
  async approve(uid: string, memberUid: string): Promise<{ status: ConnectOutcome }> {
    let session = await this.prisma.aiAppConnectSession.findUnique({ where: { uid } });
    if (!session) {
      throw new NotFoundException(`Connect session not found: ${uid}`);
    }

    session = await this.expireIfStale(session);
    if (session.status !== 'PENDING') {
      // Idempotent for an already-approved session by the same member; otherwise
      // report the terminal state (denied/expired) back to the page.
      return { status: session.status.toLowerCase() as ConnectOutcome };
    }

    const { allowed } = await this.accessControl.hasPermission(memberUid, AI_APPS_PERMISSIONS.WRITE);

    if (!allowed) {
      await this.prisma.aiAppConnectSession.update({
        where: { uid: session.uid },
        data: { status: 'DENIED', memberUid },
      });
      await this.recordEvent('CONNECT_DENIED', memberUid, { message: session.userCode });
      this.logger.warn(
        `AI Apps connect denied for member ${memberUid} (session ${session.uid}): missing ai_apps.write`
      );
      return { status: 'denied' };
    }

    await this.prisma.aiAppConnectSession.update({
      where: { uid: session.uid },
      data: {
        status: 'APPROVED',
        memberUid,
        approvedAt: new Date(),
        deployToken: `${AI_APP_DEPLOY_TOKEN_PREFIX}${randomBytes(24).toString('hex')}`,
        deployTokenExpiresAt: new Date(Date.now() + AI_APPS_DEPLOY_TOKEN_TTL_MS),
      },
    });
    await this.recordEvent('CONNECT_APPROVED', memberUid, { message: session.userCode });
    this.logger.log(`AI Apps connect approved for member ${memberUid} (session ${session.uid})`);
    return { status: 'approved' };
  }

  /**
   * Agent poll (no auth; authenticated by `pollToken`). Returns the issued
   * deploy token once the session is approved.
   */
  async poll(pollToken: string) {
    let session = await this.prisma.aiAppConnectSession.findUnique({ where: { pollToken } });
    // Unknown token: treat as expired rather than leaking which tokens exist.
    if (!session) {
      return { status: 'expired' as ConnectOutcome };
    }

    session = await this.expireIfStale(session);

    if (session.status === 'APPROVED') {
      return {
        status: 'approved' as ConnectOutcome,
        deployToken: session.deployToken,
        deployTokenExpiresAt: session.deployTokenExpiresAt?.toISOString() ?? null,
      };
    }
    if (session.status === 'PENDING') {
      return { status: 'pending' as ConnectOutcome, pollIntervalSec: AI_APPS_CONNECT_POLL_INTERVAL_SEC };
    }
    return { status: session.status.toLowerCase() as ConnectOutcome };
  }

  /** Flips a PENDING session whose window has passed to EXPIRED. */
  private async expireIfStale(session: AiAppConnectSession): Promise<AiAppConnectSession> {
    if (session.status === 'PENDING' && session.expiresAt.getTime() <= Date.now()) {
      return this.prisma.aiAppConnectSession.update({
        where: { uid: session.uid },
        data: { status: 'EXPIRED' },
      });
    }
    return session;
  }

  /** Append a connect event to the AI Apps audit log. Never throws. */
  private async recordEvent(type: AiAppEventType, memberUid: string, extra: { message?: string } = {}): Promise<void> {
    try {
      await this.prisma.aiAppEvent.create({ data: { type, memberUid, ...extra } });
    } catch (error) {
      this.logger.error(`Failed to record AI App event ${type}: ${(error as Error).message}`);
    }
  }
}
