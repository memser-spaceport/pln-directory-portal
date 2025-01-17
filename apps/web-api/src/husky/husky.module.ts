import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyController } from './husky.controller';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { Neo4jGraphDbService } from './db/neo4j-graph-db.service';
import { HuskyAiService } from './husky-ai.service';

@Module({
  controllers: [HuskyController],
  providers: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService],
  imports: [],
  exports: [HuskyService, HuskyAiService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService],
})
export class HuskyModule {}
