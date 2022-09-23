import { ExecutionContext, CanActivate } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  verify,
  getSecretFromRequest,
  getCsrfFromRequest,
  CsrfNotFoundException,
  CsrfInvalidException,
} from 'ncsrf';

export class CSRFGuard implements CanActivate {
  /**
   * Activates CSFR protection for every request that produces side-effects:
   * POST, PATCH, PUT, DELETE
   *
   * This was built on top of ncsrf's guard:
   * https://github.com/huy97/csrf/blob/master/src/guards/csrf.guard.ts
   *
   * @param context ExecutionContext
   * @returns boolean
   */
  canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const requestNeedsProtection = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(
      request.method
    );
    // Skip protection if it's a read-only request:
    if (!requestNeedsProtection) {
      return true;
    }
    // Grab both the session cookie and csrf token:
    const secret = getSecretFromRequest(
      request,
      'session',
      request.cookieConfig
    );
    const token = getCsrfFromRequest(request);
    // Validate the session cookie and csrf token:
    if (!secret || !token) {
      throw new CsrfNotFoundException();
    }
    if (!verify(secret, token)) {
      throw new CsrfInvalidException();
    }
    // Having passed validation, let the request go through:
    return true;
  }
}
