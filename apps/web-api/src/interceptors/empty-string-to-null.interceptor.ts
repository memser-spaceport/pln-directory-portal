import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';

const SKIP_EMPTY_STRING_TO_NULL = 'SKIP_EMPTY_STRING_TO_NULL';

@Injectable()
export class EmptyStringToNullInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_EMPTY_STRING_TO_NULL,
      [context.getHandler(), context.getClass()]
    );
    if (skip) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      request.body = this.convertEmptyStringsToNull(request.body);
    }
    return next.handle();
  }

  private convertEmptyStringsToNull(obj: any): any {
    if (typeof obj === 'string') {
      return obj === '' ? null : obj;
    } else if (Array.isArray(obj)) {
      return obj.map((item) => this.convertEmptyStringsToNull(item));
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        newObj[key] = this.convertEmptyStringsToNull(obj[key]);
      }
      return newObj;
    }
    return obj;
  }
}
  