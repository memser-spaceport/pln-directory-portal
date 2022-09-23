import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import * as Sentry from '@sentry/minimal';
import { catchError, Observable } from 'rxjs';

@Injectable()
export class SentryInterceptor implements NestInterceptor {
  /**
   * It intercepts the request, checks if the environment is production, if it is, it sends the error
   * to Sentry
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (process.env.environment !== 'production') {
      return;
    }
    /* Catching the error and sending it to Sentry. */
    return next.handle().pipe(
      catchError((exception) => {
        Sentry.captureException(exception);
        throw exception;
      })
    );
  }
}
