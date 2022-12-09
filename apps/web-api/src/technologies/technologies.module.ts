import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TechnologiesController } from './technologies.controller';
import { TechnologiesService } from './technologies.service';

@Module({
  controllers: [TechnologiesController],
  providers: [TechnologiesService, PrismaService],
})
export class TechnologiesModule {}
