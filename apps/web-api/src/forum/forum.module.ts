import { Module } from '@nestjs/common';
import { ProtosphereApiClient } from './protosphere-api.client';
import { ForumController } from './forum.controller';

@Module({
  controllers: [ForumController],
  providers: [ProtosphereApiClient],
  exports: [ProtosphereApiClient],
})
export class ForumModule {}
