import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class IsVerifiedMemberInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    if (request.query.isVerified === 'all') {
      delete request.query.isVerified;
    } else if (request.query.isVerified !== 'false') {
      request.query.isVerified = 'true';
    }
    return next.handle();
  }
}
