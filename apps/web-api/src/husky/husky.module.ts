import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';
import { HuskyController } from './husky.controller';
import { RedisCacheDbService } from './db/redis-cache-db.service';
import { QdrantVectorDbService } from './db/qdrant-vector-db.service';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { Neo4jGraphDbService } from './db/neo4j-graph-db.service';

@Module({
  controllers: [HuskyController],
  providers: [HuskyService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService, Neo4jGraphDbService],
  imports: [],
  exports: [HuskyService, RedisCacheDbService, QdrantVectorDbService, MongoPersistantDbService, Neo4jGraphDbService],
})
export class HuskyModule {}
