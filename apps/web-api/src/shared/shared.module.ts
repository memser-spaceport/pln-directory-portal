import { Global, Logger, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LogService } from './log.service';

@Global()
@Module({
  providers: [PrismaService, LogService, Logger],
  exports: [PrismaService, LogService],
})
export class SharedModule {}
