import { Module } from '@nestjs/common';
import { IndustryTagsController } from './industry-tags.controller';
import { IndustryTagsService } from './industry-tags.service';

@Module({
  controllers: [IndustryTagsController],
  providers: [IndustryTagsService],
})
export class IndustryTagsModule {}
