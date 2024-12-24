import { CollectionCustomizer } from '@forestadmin/agent';
import cacheManager from 'cache-manager';
import redisStore from 'cache-manager-redis-store';

/**
 * This is a quick & short-term solution
 * to avoid having stale data on our in-memory cache.
 *
 * TODO:
 * Implement a better cache invalidation mechanism that's able
 * to map the Forest Admin collection being created/updated/deleted
 * to all of our API endpoints that are affected by those data changes.
 *
 * @param dataSource
 * @param collection
 */
export async function resetCacheAfterCreateOrUpdateOrDelete(
  dataSource,
  collection
) {
  // Allow the plugin to be used both on the dataSource or on individual collections
  const collections: CollectionCustomizer[] = collection
    ? [collection]
    : dataSource.collections;
  const redisCache = cacheManager.caching({
    store: redisStore,
    host: process.env.REDIS_HOST,
    url: process.env.REDIS_TLS_URL,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_WITH_TLS
      ? {
          rejectUnauthorized: false,
          requestCert: true,
        }
      : null,
  });

  // Clear cache after create or update
  for (const currentCollection of collections) {
    currentCollection.addHook('After', 'Create', async () => {
     await redisCache.reset();
    });
    currentCollection.addHook('After', 'Update', async () => {
     await redisCache.reset();
    });
    currentCollection.addHook('After', 'Delete', async () => {
     await redisCache.reset();
    });
  }
  
}
