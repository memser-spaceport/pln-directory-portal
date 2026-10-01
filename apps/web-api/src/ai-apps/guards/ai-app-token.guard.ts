import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AnalyticsService } from '../../analytics/service/analytics.service';
import { PrismaService } from '../../shared/prisma.service';
import { AI_APP_TOKEN_HEADER, AI_APPS_AGENT_FEEDBACK_DENIED } from '../ai-apps.constants';

/**
 * Authenticates the headless AI agent by the short-lived deploy token (sent in
 * the `x-app-token` header) that was minted when the member approved a connect
 * session. The token must belong to an APPROVED session and be unexpired. On
 * success it stamps the session's member uid onto the request as
 * `aiAppMemberUid`, plus the session's self-reported `clientName` as
 * `aiAppClientName` (stored on the app for debugging).
 */
@Injectable()
export class AiAppTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly analytics: AnalyticsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.headers?.[AI_APP_TOKEN_HEADER];

    if (!token || typeof token !== 'string') {
      this.rejectFeedbackToken(req, 'Missing AI Apps deploy token');
    }

    const session = await this.prisma.aiAppConnectSession.findUnique({ where: { deployToken: token } });
    if (session?.status === 'APPROVED' && session.memberUid) {
      if (!session.deployTokenExpiresAt || session.deployTokenExpiresAt.getTime() <= Date.now()) {
        this.rejectFeedbackToken(req, 'Expired AI Apps deploy token — reconnect via LabOS to get a new one');
      }
      req.aiAppMemberUid = session.memberUid;
      req.aiAppClientName = session.clientName;
      await this.prisma.aiAppConnectSession.update({
        where: { uid: session.uid },
        data: { lastUsedAt: new Date() },
      });
      return true;
    }

    const keys = (this.prisma as any).aiAppDeployKey;
    if (!keys?.findUnique) {
      this.rejectFeedbackToken(req, 'Invalid AI Apps deploy token');
    }
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const key = await keys.findUnique({ where: { tokenHash } });
    if (!key || key.revokedAt) {
      this.rejectFeedbackToken(req, 'Invalid AI Apps deploy token');
    }
    const app = await this.prisma.aiApp.findUnique({ where: { uid: key.appUid } });
    if (!app || app.status === 'DELETED') {
      this.rejectFeedbackToken(req, 'Invalid AI Apps deploy token');
    }
    req.aiAppMemberUid = app.memberUid;
    req.aiAppClientName = null;
    req.aiAppKeyScope = { appUid: app.uid, environment: key.environment };
    await keys.update({ where: { uid: key.uid }, data: { lastUsedAt: new Date() } });
    return true;
  }

  /** A bad token on the feedback routes. Other agent routes keep the same rejection and record nothing. */
  private rejectFeedbackToken(
    req: { originalUrl?: string; url?: string; method?: string; params?: { uid?: string } },
    message: string
  ): never {
    const url = req.originalUrl ?? req.url ?? '';
    if (url.includes('/agent/feedback')) {
      const appUid = req.params?.uid ?? null;
      void this.analytics.trackEvent({
        name: AI_APPS_AGENT_FEEDBACK_DENIED,
        distinctId: `agent:${appUid ?? 'unknown'}`,
        properties: {
          appUid,
          action: req.method === 'GET' ? 'list' : 'update',
          reason: 'bad_token',
        },
      });
    }
    throw new UnauthorizedException(message);
  }
}
