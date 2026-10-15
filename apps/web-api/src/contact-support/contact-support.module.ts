import { Module } from '@nestjs/common';
import { ContactSupportService } from './contact-support.service';
import { ContactSupportController } from './contact-support.controller';
import {NotificationServiceClient} from "../notifications/notification-service.client";
import { FeedbackLinearModule } from '../feedback-linear/feedback-linear.module';

@Module({
  imports: [FeedbackLinearModule],
  controllers: [ContactSupportController],
  providers: [ContactSupportService, NotificationServiceClient],
  exports: [ContactSupportService],
})
export class ContactSupportModule {}
