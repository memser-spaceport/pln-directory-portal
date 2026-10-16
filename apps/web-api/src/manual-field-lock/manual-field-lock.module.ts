import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ManualFieldLockService } from './manual-field-lock.service';

@Module({
  imports: [SharedModule],
  providers: [ManualFieldLockService],
  exports: [ManualFieldLockService],
})
export class ManualFieldLockModule {}
