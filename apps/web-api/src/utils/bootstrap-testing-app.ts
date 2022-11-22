import { CACHE_MANAGER, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Cache } from 'cache-manager';
import { AppModule } from '../app.module';
import { mainConfig } from '../main.config';

/**
 * Helper method to easily bootstrap
 * a testing app with all that's needed!
 */
export const bootstrapTestingApp = async (metadata?: ModuleMetadata) => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    ...(metadata && { ...metadata }),
  }).compile();
  const app = moduleRef.createNestApplication();
  const cacheManager = moduleRef.get<Cache>(CACHE_MANAGER);

  // Load main app config:
  mainConfig(app);

  return { app, cacheManager };
};
