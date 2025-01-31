import { Module } from '@nestjs/common';
import { AskService } from './asks.service';

@Module({
  imports: [],
  controllers: [],
  providers: [AskService],
})
export class AskModule {}
