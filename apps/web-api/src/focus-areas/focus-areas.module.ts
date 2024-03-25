import { Module } from '@nestjs/common';
import { FocusAreaController } from './focus-areas.controller';
import { FocusAreasService } from './focus-areas.service';

@Module({
  controllers: [FocusAreaController],
  providers: [FocusAreasService],
})
export class FocusAreasModule {}
