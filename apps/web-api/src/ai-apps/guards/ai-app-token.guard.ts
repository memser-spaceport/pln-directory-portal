import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AI_APP_TOKEN_HEADER } from '../ai-apps.constants';

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
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const token = req.headers?.[AI_APP_TOKEN_HEADER];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing AI Apps deploy token');
    }

    const session = await this.prisma.aiAppConnectSession.findUnique({ where: { deployToken: token } });
    if (!session || session.status !== 'APPROVED' || !session.memberUid) {
      throw new UnauthorizedException('Invalid AI Apps deploy token');
    }
    if (!session.deployTokenExpiresAt || session.deployTokenExpiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Expired AI Apps deploy token — reconnect via LabOS to get a new one');
    }

    req.aiAppMemberUid = session.memberUid;
    req.aiAppClientName = session.clientName;
    await this.prisma.aiAppConnectSession.update({
      where: { uid: session.uid },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }
}
