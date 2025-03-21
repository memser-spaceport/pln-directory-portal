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
@Module({
  controllers: [PLEventsController],
  providers: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService,
    JwtService,
    PLEventSyncService
  ],
  exports: [
    PLEventsService,
    PLEventLocationsService,
    PLEventGuestsService
  ],
  imports:[
    MembersModule, 
    forwardRef(() => NotificationsModule), 
    MemberSubscriptionsModule,
    AuthModule,
    TeamsModule
  ]
})
export class PLEventsModule {}
