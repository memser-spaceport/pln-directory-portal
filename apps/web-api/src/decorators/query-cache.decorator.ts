import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to mark endpoints for query-based caching instead of user-based caching.
 * When applied, the cache key will be based on query parameters only,
 * allowing different users to share cached results for the same query.
 */
export const QueryCache = () => SetMetadata('queryBasedCache', true);
