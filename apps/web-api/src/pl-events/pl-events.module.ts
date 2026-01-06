import { forwardRef, Module } from '@nestjs/common';
import { PLEventsController } from './pl-events.controller';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventsService } from './pl-events.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { MembersModule } from '../members/members.module';
import { JwtService } from '../utils/jwt/jwt.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MemberSubscriptionsModule } from '../member-subscriptions/member-subscriptions.module';
import { PLEventSyncService } from './pl-event-sync.service';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { AdminModule } from '../admin/admin.module';
import { PLEventLocationAssociationService } from './pl-event-location-association.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { IrlGatheringPushCandidatesService } from './push/irl-gathering-push-candidates.service';
import { IrlGatheringPushNotificationsJob } from './push/irl-gathering-push-notifications.job';

import { EventsModule } from '../events/events.module';
import {IrlGatheringPushConfigService} from "./push/irl-gathering-push-config.service";
import {IrlGatheringPushConfigController} from "./push/irl-gathering-push-config.controller";
@Module({
  controllers: [PLEventsController, IrlGatheringPushConfigController],
  providers: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService,
    IrlGatheringPushConfigService,
    JwtService,
    PLEventSyncService,
    PLEventLocationAssociationService,
    IrlGatheringPushCandidatesService,
    IrlGatheringPushNotificationsJob,
  ],
  exports: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService,
    PLEventLocationAssociationService,
  ],
  imports: [
    forwardRef(() => MembersModule),
    forwardRef(() => AdminModule),
    forwardRef(() => NotificationsModule),
    MemberSubscriptionsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => TeamsModule),
    forwardRef(() => EventsModule),
    PushNotificationsModule,
  ],
})
export class PLEventsModule {}
