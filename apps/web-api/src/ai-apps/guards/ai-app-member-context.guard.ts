import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { validateUserAccessToken } from '../../guards/user-access-token-validate.guard';
import { extractTokenFromRequest } from '../../utils/auth';
import { AiAppsSessionService, isAiAppSessionToken } from '../ai-apps-session.service';

/**
 * Identity for the app-facing member-context route. An app session token (what deployed apps hold once their auth
 * gate issues sessions) must be live for the app it names and come from that app's origin; it sets `memberUid` for
 * the RBAC guard that follows. Any other token goes through the usual LabOS token validation, unchanged.
 */
@Injectable()
export class AiAppMemberContextGuard implements CanActivate {
  constructor(private readonly sessionService: AiAppsSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(req);
    if (isAiAppSessionToken(token)) {
      const session = await this.sessionService.authenticateAppRequest(token as string, req.headers?.origin);
      if (!session) {
        throw new UnauthorizedException('Invalid or expired app session');
      }
      req.memberUid = session.memberUid;
      return true;
    }
    await validateUserAccessToken(req);
    return true;
  }
}
