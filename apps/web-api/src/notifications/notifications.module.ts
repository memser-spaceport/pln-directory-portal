import { forwardRef, Module } from '@nestjs/common';
import { NotificationService } from './notifications.service';
import { NotificationConsumer } from './notifications.processor';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../shared/shared.module';
import { MemberSubscriptionsModule } from '../member-subscriptions/member-subscriptions.module';
import { PLEventsModule } from '../pl-events/pl-events.module';

@Module({
  controllers: [],
  providers: [NotificationService, NotificationConsumer],
  exports: [NotificationService],
  imports: [
    SharedModule,
    MemberSubscriptionsModule,
    forwardRef(() => PLEventsModule),
    BullModule.registerQueue({
      name: 'notifications',
    })
  ]
})
export class NotificationsModule { }
