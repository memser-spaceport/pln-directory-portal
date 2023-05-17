import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  providers: [LocationsService],
  controllers: [LocationsController],
})
export class LocationsModule {}
