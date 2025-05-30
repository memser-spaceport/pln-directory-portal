import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { IGNORED_URLS_FOR_CONCEALID } from '../utils/constants';

/**
 * This interceptor exists as a security measure because
 * all the API responses must never include auto-incremental IDs
 */
export class ConcealEntityIDInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (IGNORED_URLS_FOR_CONCEALID.some((url) => request.url.includes(url))) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // Match all ocurrences of id props:
        const matchIdPropsRegex = /(,?)(\s*)("|'?)\bid("|'?):(\s*)("|'?)\d*("|'?)(\s*)(,?|}?)/gm;
        if (typeof data === 'undefined' || data === null) {
          return data;
        }
        let jsonString;
        try {
          jsonString = JSON.stringify(data);
        } catch (e) {
          return data;
        }
        if (!jsonString || typeof jsonString !== 'string') {
          return data;
        }
        const dataWithoutIds = jsonString.replace(matchIdPropsRegex, '');
        try {
          return typeof data === 'object' ? JSON.parse(dataWithoutIds) : data;
        } catch (e) {
          // fallback: return original data if parsing fails
          return data;
        }
      })
    );
  }
}
