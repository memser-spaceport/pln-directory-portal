import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamEnrichmentModule } from '../team-enrichment/team-enrichment.module';
import { InvestorsModule } from '../investors/investors.module';
import { AuthModule } from '../auth/auth.module';
import { TeamPitchesService } from './team-pitches.service';
import { TeamPitchParticipantsService } from './team-pitch-participants.service';
import { TeamPitchProfilesService } from './team-pitch-profiles.service';
import { TeamPitchEngagementService } from './team-pitch-engagement.service';
import { TeamPitchesController } from './team-pitches.controller';

@Module({
  imports: [
    SharedModule,
    UploadsModule,
    AnalyticsModule,
    NotificationsModule,
    TeamEnrichmentModule,
    InvestorsModule,
    AuthModule,
  ],
  controllers: [TeamPitchesController],
  providers: [TeamPitchesService, TeamPitchParticipantsService, TeamPitchProfilesService, TeamPitchEngagementService],
  exports: [TeamPitchesService, TeamPitchParticipantsService, TeamPitchProfilesService],
})
export class TeamPitchesModule {}
