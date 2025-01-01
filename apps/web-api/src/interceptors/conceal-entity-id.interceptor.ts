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
        // Replace ocurrences with a an empty string:
        const dataWithoutIds = JSON.stringify(data).replace(matchIdPropsRegex, '');
        return typeof data == 'object' ? JSON.parse(dataWithoutIds) : data;
      })
    );
  }
}
