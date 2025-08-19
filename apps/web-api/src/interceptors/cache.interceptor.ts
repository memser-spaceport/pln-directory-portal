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
    const ignoreCaching: boolean = this.reflector.get('ignoreCaching', context.getHandler());

    // Only cache GET requests that don't have the ignoreCaching flag
    return !ignoreCaching && request.method === 'GET';
  }

  /**
   * Generates a cache key based on the request and authentication status
   * Creates separate cache spaces for authenticated and guest users,
   * unless the endpoint is marked for query-based caching
   * @param context Execution context containing the request
   * @returns Cache key string with appropriate prefix
   */
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<Request>();
    const baseKey = super.trackBy(context);

    // Get the base cache key from parent implementation
    if (!baseKey) {
      return baseKey; // If no base key, return undefined
    }

    // Check if this endpoint should use query-based caching
    const isQueryBasedCache: boolean = this.reflector.get('queryBasedCache', context.getHandler());

    // If query-based cache is enabled, only use environment prefix
    if (isQueryBasedCache) {
      return `${process.env.ENVIRONMENT}:query:${baseKey}`;
    }

    // Check for any authentication indicators set by the various guards
    const isAuthenticated = !!(
      request['userEmail'] ||
      request['isUserLoggedIn'] ||
      request['userUid'] ||
      request['userAccessToken']
    );

    // Prefix the key with the environment to prevent cache collisions between deployment stages.
    // Further prefix with auth status to create separate cache spaces for authenticated
    // and guest users, preventing sensitive data from being shared.
    return isAuthenticated
      ? `${process.env.ENVIRONMENT}:auth:${baseKey}`
      : `${process.env.ENVIRONMENT}:guest:${baseKey}`;
  }
}
