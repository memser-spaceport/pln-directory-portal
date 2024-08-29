import { Module } from '@nestjs/common';
import { HuskyService } from './husky.service';

@Module({
  controllers: [],
  providers: [
    HuskyService
  ],
  imports:[],
  exports: [
    HuskyService
  ]
})
export class  HuskyModule {}