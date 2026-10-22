import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { validateUserAccessToken } from '../../guards/user-access-token-validate.guard';
import { extractTokenFromRequest } from '../../utils/auth';
import { AiAppsSessionService, aiAppSessionTokenAppId, isAiAppSessionToken } from '../ai-apps-session.service';
import { AiAppsTestingUsersService } from '../ai-apps-testing-users.service';
import { buildAppUrl } from '../ai-apps.constants';

/**
 * Identity for the app-facing member-context route. An app session token (what deployed apps hold once their auth
 * gate issues sessions) must be live for the app it names and come from that app's origin; it sets `memberUid` for
 * the RBAC guard that follows. An app that names itself with `?appId=` gets a 401 for a session minted for another
 * app, with or without `Origin` (LAB-2894). Any other token goes through the usual LabOS token validation, unchanged.
 */
@Injectable()
export class AiAppMemberContextGuard implements CanActivate {
  constructor(
    private readonly sessionService: AiAppsSessionService,
    private readonly testingUsersService: AiAppsTestingUsersService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(req);
    if (isAiAppSessionToken(token)) {
      const askingAppId = typeof req.query?.appId === 'string' ? req.query.appId.trim() : '';
      if (askingAppId && askingAppId !== aiAppSessionTokenAppId(token as string)) {
        throw new UnauthorizedException('Invalid or expired app session');
      }
      const origin = req.headers?.origin as string | undefined;
      const session = await this.sessionService.authenticateAppRequest(token as string, origin);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired app session');
      }
      if (session.testing) {
        if (origin && origin !== buildAppUrl(session.appId, 'preview')) {
          throw new ForbiddenException('Testing sessions are only valid on Preview');
        }
        const live = await this.testingUsersService.findLiveForAppId(session.memberUid, session.appId);
        if (!live) {
          throw new UnauthorizedException('Invalid or expired app session');
        }
        req.memberUid = live.uid;
        req.aiAppTestingUser = { uid: live.uid, name: live.name };
        return true;
      }
      req.memberUid = session.memberUid;
      if (session.isAgent) {
        req.aiAppAgent = { agentAccess: session.agentAccess ?? 'write' };
      }
      return true;
    }
    await validateUserAccessToken(req);
    return true;
  }
}
