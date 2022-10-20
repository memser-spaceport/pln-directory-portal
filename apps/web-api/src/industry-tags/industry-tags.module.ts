import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IndustryTagsController } from './industry-tags.controller';
import { IndustryTagsService } from './industry-tags.service';

@Module({
  controllers: [IndustryTagsController],
  providers: [IndustryTagsService, PrismaService],
})
export class IndustryTagsModule {}
