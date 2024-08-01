import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class EmptyStringToNullInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
  