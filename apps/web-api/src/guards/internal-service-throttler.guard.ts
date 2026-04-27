import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const INTERNAL_SERVICE_PATH_PREFIX = 'v1/service';

@Injectable()
export class InternalServiceThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const raw = (req.originalUrl ?? req.url ?? req.path ?? '') as string;
    const path = raw.split('?')[0] ?? '';
    if (path === INTERNAL_SERVICE_PATH_PREFIX || path.includes(`${INTERNAL_SERVICE_PATH_PREFIX}/`)) {
      return true;
    }
    return super.canActivate(context);
  }
}
