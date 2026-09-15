import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { PrismaService } from '../shared/prisma.service';
import { HuskyRevalidationService } from './husky-revalidation.service';
import { HuskyGenerationService } from './husky-generation.service';
import { HuskyGenerationController } from './husky-generation.controller';
import { MemberBioRefreshService } from './member-bio-refresh.service';
import { MemberScrapingDogService } from './member-scrapingdog.service';

/**
 * Narrow, widely-depended-on Husky services (member bio/enrichment helpers,
 * cache/revalidation hooks). Deliberately has no dependency on the AI-search
 * tool-calling stack — see husky-search.module.ts for that and why it's split
 * out — so the ~10 unrelated modules that import HuskyModule directly (no
 * forwardRef needed) can keep doing so safely.
 */
@Module({
  controllers: [HuskyGenerationController],
  providers: [
    HuskyService,
    RedisCacheDbService,
    MongoPersistantDbService,
    PrismaService,
    HuskyRevalidationService,
    HuskyGenerationService,
    MemberBioRefreshService,
    MemberScrapingDogService,
  ],
  exports: [
    HuskyService,
    RedisCacheDbService,
    MongoPersistantDbService,
    HuskyRevalidationService,
    HuskyGenerationService,
    MemberBioRefreshService,
    MemberScrapingDogService,
  ],
})
export class HuskyModule {}
