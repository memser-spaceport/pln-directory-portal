import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AI_APPS_AGENT_FEEDBACK_DENIED } from './ai-apps.constants';

type DenialReason = 'bad_token' | 'forbidden' | 'wrong_app' | 'not_found' | 'invalid_status';

export function agentFeedbackDenialReason(exception: HttpException): DenialReason | null {
  const status = exception.getStatus();
  if (status === 401) return 'bad_token';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'invalid_status';
  if (status === 403) {
    const response = exception.getResponse();
    const message = typeof response === 'string' ? response : (response as { message?: unknown }).message;
    const text = Array.isArray(message) ? message.join(' ') : String(message ?? '');
    return text.includes('deployment key') ? 'wrong_app' : 'forbidden';
  }
  return null;
}

/**
 * Records a rejected agent feedback call. Guards run before this, so a bad
 * token is recorded in `AiAppTokenGuard` instead.
 */
@Injectable()
export class AgentFeedbackDeniedInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) {
          const reason = agentFeedbackDenialReason(error);
          if (reason) {
            const req = context.switchToHttp().getRequest();
            const appUid = req.params?.uid ?? null;
            const memberUid = req.aiAppMemberUid as string | undefined;
            void this.analytics.trackEvent({
              name: AI_APPS_AGENT_FEEDBACK_DENIED,
              distinctId: memberUid ?? `agent:${appUid ?? 'unknown'}`,
              properties: {
                appUid,
                action: req.method === 'GET' ? 'list' : 'update',
                reason,
              },
            });
          }
        }
        return throwError(() => error);
      })
    );
  }
}
