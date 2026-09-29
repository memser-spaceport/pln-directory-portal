import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { extractTokenFromRequest } from '../utils/auth';
import { aiAppSessionTokenAppId, isAiAppSessionToken } from './ai-apps-session.service';
import { AI_APPS_APP_DOMAIN, isReservedAppId } from './ai-apps.constants';

/** The host label of a deployed app's browser origin (`https://<label>.<AI_APPS_APP_DOMAIN>`), or null. */
export function appIdFromOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
  const suffix = `.${AI_APPS_APP_DOMAIN}`;
  const label = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(label) || isReservedAppId(label)) return null;
  return label;
}

const route = (req: Request) => `${req.method} ${req.originalUrl.split('?')[0]}`;

/**
 * App session tokens (what deployed AI Apps hold) are valid only on the app-facing routes excluded from this
 * middleware in app.module (`/v1/ai-apps/me`, `/v1/ai-apps/track`, `/v1/ai-apps/access-check`). Anywhere else they
 * get a 401 before any guard or auth-service call, and the attempt is logged with the app it came from.
 *
 * Soak telemetry: a LabOS token sent from a deployed app's origin to one of those other routes is logged
 * (`ai_app_origin_labos_token`) but not blocked. It shows which apps would break once they only hold app sessions.
 */
@Injectable()
export class AiAppSessionScopeMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AiAppSessionScopeMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const [type, token] = req.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && isAiAppSessionToken(token)) {
      this.logger.warn(
        JSON.stringify({
          event: 'ai_app_session_disallowed_route',
          appId: aiAppSessionTokenAppId(token),
          route: route(req),
        })
      );
      res
        .status(401)
        .send({ statusCode: 401, message: 'App session tokens are only valid for the AI Apps member API' });
      return;
    }
    const appId = appIdFromOrigin(req.headers.origin);
    if (appId && extractTokenFromRequest(req)) {
      this.logger.warn(JSON.stringify({ event: 'ai_app_origin_labos_token', appId, route: route(req) }));
    }
    next();
  }
}
