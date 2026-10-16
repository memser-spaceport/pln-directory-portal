import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { SuggestedCandidatesEmailPreferenceService } from './suggested-candidates-email-preference.service';

/** Imported by `NotificationSettingsModule` (GET/PUT routes) and `JobMatchModule` (send, unsubscribe). LAB-2850. */
@Module({
  imports: [SharedModule],
  providers: [SuggestedCandidatesEmailPreferenceService],
  exports: [SuggestedCandidatesEmailPreferenceService],
})
export class SuggestedCandidatesEmailPreferenceModule {}
