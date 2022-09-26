import { CacheInterceptor, ExecutionContext } from '@nestjs/common';

/* If the handler has the `@IgnoreCaching()` decorator, then don't cache the response. */
export class MyCacheInterceptor extends CacheInterceptor {
  isRequestCacheable(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest();

    const ignoreCaching: boolean = this.reflector.get(
      'ignoreCaching',
      context.getHandler()
    );

    return !ignoreCaching && request.method === 'GET';
  }
}
