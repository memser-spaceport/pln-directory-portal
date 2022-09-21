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
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (process.env.environment !== 'production') {
      return;
    }
    return next.handle().pipe(
      catchError((exception) => {
        Sentry.captureException(exception);
        throw exception;
      })
    );
  }
}
