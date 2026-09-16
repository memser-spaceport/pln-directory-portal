import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { INTEGRATION_SCOPES_KEY } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeysService } from '../integration-keys/integration-keys.service';

/**
 * Authenticates a third-party server on `/v1/integrations` routes by a team-scoped
 * integration key sent as `Authorization: Bearer <key>`.
 *
 * Missing, malformed, unknown and revoked keys all get the same 401 so a caller
 * cannot learn whether a key ever existed. After authentication the guard checks
 * the scopes a route declared with `@RequireIntegrationScopes` and rejects a key
 * lacking any of them with 403. On success it sets `req.integrationKey` and logs
 * the key uid, method and path. The key itself is never logged.
 */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  private readonly logger = new Logger(IntegrationKeyGuard.name);

  constructor(private readonly integrationKeys: IntegrationKeysService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = req.headers?.authorization;
    const [scheme, presented] = typeof header === 'string' ? header.split(' ') : [];

    if (scheme !== 'Bearer' || !presented) {
      this.logger.debug('Integration request without a bearer key');
      throw new UnauthorizedException('Invalid integration key');
    }

    const key = await this.integrationKeys.authenticate(presented);
    if (!key) {
      this.logger.debug('Integration request with an unknown or revoked key');
      throw new UnauthorizedException('Invalid integration key');
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(INTEGRATION_SCOPES_KEY, [context.getHandler(), context.getClass()]) ??
      [];
    const missing = required.filter((scope) => !key.scopes.includes(scope as typeof key.scopes[number]));
    if (missing.length > 0) {
      throw new ForbiddenException(`Integration key lacks required scope: ${missing.join(', ')}`);
    }

    req.integrationKey = key;
    this.logger.log(`integrationKey=${key.uid} ${req.method} ${req.originalUrl ?? req.url}`);
    return true;
  }
}
