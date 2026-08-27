import { Module } from '@nestjs/common';
import { CoresignalService } from './coresignal.service';

@Module({
  providers: [CoresignalService],
  exports: [CoresignalService],
})
export class CoresignalModule {}
