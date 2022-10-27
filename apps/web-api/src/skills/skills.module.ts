import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  controllers: [SkillsController],
  providers: [SkillsService, PrismaService],
})
export class SkillsModule {}
