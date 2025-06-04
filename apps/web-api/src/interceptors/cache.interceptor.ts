import { CacheInterceptor, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Custom cache interceptor that extends NestJS CacheInterceptor
 * to provide separate caching for authenticated and guest users.
 * This prevents sharing sensitive cached data between different user types.
 */
export class MyCacheInterceptor extends CacheInterceptor {
  /**
   * Determines if a request should be cached
   * @param context Execution context containing the request
   * @returns Boolean indicating if the request is cacheable
   */
  isRequestCacheable(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest();

    // Get the ignoreCaching metadata from the handler
    const ignoreCaching: boolean = this.reflector.get(
      'ignoreCaching',
      context.getHandler()
    );

    // Only cache GET requests that don't have the ignoreCaching flag
    return !ignoreCaching && request.method === 'GET';
  }

  /**
   * Generates a cache key based on the request and authentication status
   * Creates separate cache spaces for authenticated and guest users
   * @param context Execution context containing the request
   * @returns Cache key string with auth/guest prefix
   */
  trackBy(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Check for any authentication indicators set by the various guards
    const isAuthenticated = !!(
      request['userEmail'] || 
      request['isUserLoggedIn'] || 
      request['userUid'] || 
      request['userAccessToken'] 
    );
    
    // Get the base cache key from parent implementation
    const baseKey = super.trackBy(context);
    
    // Prefix the key based on user authentication status
    // This creates separate cache spaces for authenticated vs guest users
    return isAuthenticated ? `auth:${baseKey}` : `guest:${baseKey}`;
  }
}
