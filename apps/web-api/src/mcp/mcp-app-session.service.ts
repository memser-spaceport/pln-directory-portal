import { Injectable, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AiAppsAccessService } from '../ai-apps/ai-apps-access.service';
import { AiAppSessionGrant, AiAppsSessionService } from '../ai-apps/ai-apps-session.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { McpOAuthService } from './mcp-oauth.service';

/**
 * Mints one app session for the member behind a live MCP access token (LAB-2763).
 * Checks the token, the member, and `mcp.connect` on every call. The grant is the
 * same `{ token, expiresAt }` a browser session returns. The MCP token is not copied into it.
 */
@Injectable()
export class McpAppSessionService {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly access: AiAppsAccessService,
    private readonly sessions: AiAppsSessionService,
    private readonly analytics: AnalyticsService
  ) {}

  async mint(accessToken: string, appId: string): Promise<AiAppSessionGrant> {
    const actor = await this.oauth.authenticateAccessToken(accessToken);
    const app = await this.access.findAppForAccessCheck(appId);
    if (!app) {
      throw new NotFoundException('Unknown app');
    }
    await this.access.checkAccess(actor.memberUid, appId, 'GET', { app }, 'prod');
    const grant = await this.sessions.openAgentSession(actor.memberUid, appId, actor.authorizationUid);
    void this.analytics.trackEvent({
      name: ANALYTICS_EVENTS.MCP.APP_SESSION_OPEN,
      distinctId: actor.memberUid,
      properties: { memberUid: actor.memberUid, appId },
    });
    return grant;
  }
}
