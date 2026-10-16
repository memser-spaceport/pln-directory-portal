import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { ManualFieldsPatchAuthFilter } from './manual-field-lock.analytics';
import { ManualFieldLockService } from './manual-field-lock.service';

@Module({
  imports: [SharedModule],
  providers: [ManualFieldLockService, ManualFieldsPatchAuthFilter],
  exports: [ManualFieldLockService, ManualFieldsPatchAuthFilter],
})
export class ManualFieldLockModule {}
