import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatsController } from './husky-chats.controller';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { HuskyAiService } from './husky-ai.service';
import { HuskyThreadsController } from './husky-threads.controller';
import { PrismaService } from '../shared/prisma.service';
import { HuskyRevalidationService } from './husky-revalidation.service';
import { HuskyAiToolsModule } from './tools/husky-ai-tools.module';
import { HuskyGenerationService } from './husky-generation.service';
import { HuskyGenerationController } from './husky-generation.controller';
@Module({
  controllers: [HuskyChatsController, HuskyThreadsController, HuskyGenerationController],
  providers: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService, PrismaService, HuskyRevalidationService, HuskyGenerationService],
  imports: [HuskyAiToolsModule],
  exports: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService, HuskyRevalidationService, HuskyGenerationService,],
})
export class HuskyModule {}
