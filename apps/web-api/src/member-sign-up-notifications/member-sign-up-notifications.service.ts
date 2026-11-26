import { Injectable } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { isExcludedMember } from '../member-signals/member-exclusion';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { SIGN_UP_EVENTS, SIGN_UP_MEMBER_SELECT } from './member-sign-up-notifications.constants';
import type { SignUpEvent } from './member-sign-up-notifications.types';
import { memberSignUpTelegramText } from './member-sign-up-message';

/* Posts never throw: a failed post is logged and must not fail the sign-up or the verification. */
@Injectable()
export class MemberSignUpNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly logger: LogService
  ) {}

  notifySignUp(memberUid: string): Promise<void> {
    return this.post('SIGN_UP', memberUid);
  }

  notifyLinkedInVerified(memberUid: string): Promise<void> {
    return this.post('LINKEDIN_VERIFIED', memberUid);
  }

  notifyJobAspirantSignUp(memberUid: string): Promise<void> {
    return this.post('JOB_ASPIRANT_SIGN_UP', memberUid);
  }

  private async post(event: SignUpEvent, memberUid: string): Promise<void> {
    try {
      const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: SIGN_UP_MEMBER_SELECT });
      if (!member || isExcludedMember(member)) {
        return;
      }
      await this.notificationServiceClient.sendTelegramOutboxMessage({
        channelType: SIGN_UP_EVENTS[event].channelType,
        text: memberSignUpTelegramText(event, member),
        meta: { source: 'member-sign-up', event, memberUid },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Member sign-up Telegram post failed: event=${event} memberUid=${memberUid}: ${reason}`);
    }
  }
}
