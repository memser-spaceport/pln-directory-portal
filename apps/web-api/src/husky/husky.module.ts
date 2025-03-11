import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyChatsController } from './husky-chats.controller';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { HuskyAiService } from './husky-ai.service';
import { HuskyThreadsController } from './husky-threads.controller';
import { PrismaService } from '../shared/prisma.service';
@Module({
  controllers: [HuskyChatsController, HuskyThreadsController],
  providers: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService, PrismaService],
  imports: [],
  exports: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService],
})
export class HuskyModule {}
