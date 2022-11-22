import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  providers: [LocationsService, PrismaService],
  controllers: [LocationsController],
})
export class LocationsModule {}
