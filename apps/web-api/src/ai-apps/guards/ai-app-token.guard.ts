import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { AI_APP_TOKEN_HEADER } from '../ai-apps.constants';

/**
 * Authenticates the headless AI agent by its personal deploy token (sent in the
 * `x-app-token` header) instead of a user JWT. On success it stamps the
 * resolved member uid onto the request as `aiAppMemberUid`.
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

    const record = await this.prisma.aiAppToken.findUnique({ where: { token } });
    if (!record || record.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked AI Apps deploy token');
    }

    req.aiAppMemberUid = record.memberUid;
    await this.prisma.aiAppToken.update({
      where: { uid: record.uid },
      data: { lastUsedAt: new Date() },
    });

    return true;
  }
}
