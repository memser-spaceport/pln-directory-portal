import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AcceleratorProgramsController } from './accelerator-programs.controller';
import { AcceleratorProgramsService } from './accelerator-programs.service';

@Module({
  controllers: [AcceleratorProgramsController],
  providers: [AcceleratorProgramsService, PrismaService],
})
export class AcceleratorProgramsModule {}
