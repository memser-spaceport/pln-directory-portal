import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

const INTERNAL_SERVICE_PATH_PREFIX = 'v1/service';

/** The header the frontend's server sends on its own API reads (LAB-3086). */
export const FRONTEND_RENDER_HEADER = 'x-frontend-render-token';

const READ_METHODS = new Set(['GET', 'HEAD']);

@Injectable()
export class InternalServiceThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const raw = (req.originalUrl ?? req.url ?? req.path ?? '') as string;
    const path = raw.split('?')[0] ?? '';
    if (path === INTERNAL_SERVICE_PATH_PREFIX || path.includes(`${INTERNAL_SERVICE_PATH_PREFIX}/`)) {
      return true;
    }
    if (isFrontendRenderRead(req, process.env.FRONTEND_RENDER_THROTTLE_TOKEN)) {
      return true;
    }
    return super.canActivate(context);
  }
}

/**
 * Whether a request is the frontend server reading the API to render a page (LAB-3086), which the throttler lets
 * through.
 *
 * The frontend renders every profile, listing and sitemap on its server, so all crawlers and visitors behind one
 * frontend instance share its address. At 10 requests a second, a crawler's burst came back as 429s, and healthy pages
 * rendered the error page. The frontend proves itself with a shared token, not an address list, because its
 * addresses change.
 *
 * Reads only: a write keeps the limit even when the frontend relays it. With no token configured, nothing is exempt.
 */
export function isFrontendRenderRead(
  req: { method?: string; headers?: Record<string, string | string[] | undefined> },
  expected: string | undefined
): boolean {
  if (!expected || !READ_METHODS.has((req.method ?? '').toUpperCase())) {
    return false;
  }
  const header = req.headers?.[FRONTEND_RENDER_HEADER];
  const provided = Array.isArray(header) ? header[0] : header;
  return !!provided && sameSecret(provided, expected);
}

function sameSecret(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}
