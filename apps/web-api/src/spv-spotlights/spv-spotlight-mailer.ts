import { Injectable } from '@nestjs/common';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { AuthService } from '../auth/auth.service';
import {
  asStringRecord,
  formatTeamPitchFromHeader,
  resolveTeamPitchSenderEmail,
} from '../team-pitches/team-pitch.utils';
import { EmailTemplate, mergeTemplate, normalizeEmail } from './spv-spotlight.utils';

const LOGIN_TOKEN_TTL_SECONDS = 864000;

export type SpotlightMailContext = {
  uid: string;
  slug: string;
  title: string;
  supportEmail: string;
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  teamName: string;
};

@Injectable()
export class SpvSpotlightMailer {
  constructor(
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly authService: AuthService
  ) {}

  async loginLink(slug: string, email: string): Promise<string> {
    const normalized = normalizeEmail(email);
    const loginToken = await this.authService.issueLoginToken(normalized, LOGIN_TOKEN_TTL_SECONDS);
    const webBase = process.env.WEB_UI_BASE_URL || '';
    return `${webBase}/spv-spotlight/${slug}?prefillEmail=${encodeURIComponent(
      normalized
    )}&loginToken=${encodeURIComponent(loginToken)}`;
  }

  async send(input: {
    spotlight: SpotlightMailContext;
    template: EmailTemplate;
    to: string;
    memberUid: string;
    memberName: string;
    extra?: Record<string, string>;
  }) {
    const email = normalizeEmail(input.to);
    const spotlightLink = await this.loginLink(input.spotlight.slug, email);
    const vars: Record<string, string> = {
      investorName: input.memberName || '',
      investorEmail: email,
      spotlightTitle: input.spotlight.title,
      spotlightLink,
      teamName: input.spotlight.teamName,
      supportEmail: input.spotlight.supportEmail,
      ...asStringRecord(input.extra),
    };
    const senderEmail = resolveTeamPitchSenderEmail(input.spotlight.senderEmail);
    const replyTo = input.spotlight.replyToEmail?.trim() || undefined;
    const webBase = (process.env.WEB_UI_BASE_URL || 'https://os.pl.xyz').replace(/\/$/, '');
    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: 'SPV_SPOTLIGHT_EMAIL',
      recipientsInfo: {
        from: formatTeamPitchFromHeader(senderEmail, input.spotlight.senderName),
        to: [email],
        bcc: senderEmail ? [senderEmail] : [],
        ...(replyTo ? { replyTo } : {}),
      },
      deliveryPayload: {
        body: {
          subject: mergeTemplate(input.template.subject, vars),
          bodyHtml: mergeTemplate(input.template.body, vars),
          preferencesUrl: `${webBase}/settings/email`,
        },
      },
      entityType: 'SPV_SPOTLIGHT',
      actionType: 'INVESTOR_EMAIL',
      sourceMeta: {
        activityId: input.spotlight.uid,
        activityType: 'SPV_SPOTLIGHT',
        activityUserId: input.memberUid,
        activityUserName: input.memberName,
      },
      targetMeta: {
        emailId: email,
        userId: input.memberUid,
        userName: input.memberName,
      },
    });
    return spotlightLink;
  }
}
