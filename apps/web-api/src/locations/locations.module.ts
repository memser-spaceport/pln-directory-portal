import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
@Module({
  providers: [LocationsService, LocationTransferService],
  controllers: [LocationsController],
})
export class LocationsModule {}
