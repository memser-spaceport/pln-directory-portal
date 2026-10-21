import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class InternalAuthHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_AUTH_TOKEN;
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-internal-auth-token'];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!expected || !provided || !sameSecret(provided, expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

function sameSecret(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}
