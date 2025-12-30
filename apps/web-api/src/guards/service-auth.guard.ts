import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger } from '@nestjs/common';

/**
 * Guard for service-to-service authentication using a shared secret.
 * Used by external services (e.g., NodeBB forum) to call internal APIs.
 *
 * Expects: Authorization: Basic <FORUM_SERVICE_SECRET>
 */
@Injectable()
export class ServiceAuthGuard implements CanActivate {
  private readonly logger = new Logger(ServiceAuthGuard.name);
  private readonly serviceSecret: string | undefined;

  constructor() {
    this.serviceSecret = process.env.FORUM_SERVICE_SECRET;
    if (!this.serviceSecret) {
      this.logger.warn('FORUM_SERVICE_SECRET is not configured - service auth will fail');
    }
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.serviceSecret) {
      throw new UnauthorizedException('Service authentication not configured');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Basic') {
      throw new UnauthorizedException('Invalid authorization type');
    }

    if (token !== this.serviceSecret) {
      this.logger.warn('Invalid service credentials attempt');
      throw new UnauthorizedException('Invalid service credentials');
    }

    return true;
  }
}
