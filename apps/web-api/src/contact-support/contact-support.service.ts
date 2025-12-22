import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ContactSupportRequestDto } from 'libs/contracts/src/schema';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { isEmails } from '../utils/helper/helper';
import { AwsService } from '../utils/aws/aws.service';
import * as path from 'path';
import { NotificationServiceClient } from '../notifications/notification-service.client';

const CONTACT_SUPPORT_SUBJECT = 'New Contact Support Request';

@Injectable()
export class ContactSupportService {
  private readonly supportEmails: string[];
  private readonly isSupportEmailsValid: boolean;
  private readonly isEmailEnabled: string | undefined;

  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private awsService: AwsService,
    private notificationServiceClient: NotificationServiceClient
  ) {
    this.supportEmails = this.getSupportEmails();
    this.isSupportEmailsValid = this.validateSupportEmails();
    this.isEmailEnabled = process.env.IS_EMAIL_ENABLED?.toLowerCase();
  }

  async createSupportRequest(request: ContactSupportRequestDto) {
    try {
      const result = await this.prisma.contactSupportRequest.create({
        data: {
          topic: request.topic,
          email: request.email,
          name: request.name,
          message: request.message,
          metadata: request.metadata as any,
        },
      });

      if (result) {
        if (this.isEmailEnabled === 'true') {
          this.notifyAdmins(result);
        }
        this.logger.info(`New contact support request created with topic "${request.topic}" and ref id ${result.uid}`);

        await this.notificationServiceClient.sendTelegramOutboxMessage({
          channelType: 'SUPPORT',
          text: [
            'New support request',
            `Topic: ${request.topic}`,
            `Email: ${request.email ?? '-'}`,
            `Name: ${request.name ?? '-'}`,
            `Message: ${request.message ?? '-'}`,
          ].join('\n'),
          meta: {
            email: request.email,
            name: request.name,
            source: 'contact-support',
          },
        });
        return { uid: result.uid };
      } else {
        throw new InternalServerErrorException('Cannot save a contact support request');
      }
    } catch (error) {
      this.logger.error('Error creating contact support request', error);
      throw new InternalServerErrorException('Cannot save a contact support request', error);
    }
  }

  private async notifyAdmins(supportRequest) {
    if (this.isSupportEmailsValid) {
      const from = process.env.SES_SOURCE_EMAIL;
      if (!from) {
        this.logger.error('An email address is not configured.');
        return;
      }

      try {
        const result = await this.awsService.sendEmailWithTemplate(
          path.join(__dirname, './shared/contactSupport.hbs'),
          {
            topic: supportRequest.topic,
            email: supportRequest.email || 'Not provided',
            name: supportRequest.name || 'Not provided',
            message: supportRequest.message || 'Not provided',
            metadata: supportRequest.metadata ? JSON.stringify(supportRequest.metadata, null, 2) : null,
            createdAt: supportRequest.createdAt.toISOString(),
          },
          '',
          `${CONTACT_SUPPORT_SUBJECT}: ${supportRequest.topic}`,
          from,
          this.supportEmails,
          []
        );
        this.logger.info(
          `Contact support request ${supportRequest.uid} notified to support team ref: ${result?.MessageId}`
        );
      } catch (error) {
        this.logger.error(`Failed to send email notification for contact support request ${supportRequest.uid}`, error);
      }
    } else {
      this.logger.error(
        `Cannot send contact support notification for ${supportRequest.uid} as ${this.supportEmails} does not contain valid email addresses`
      );
    }
  }

  private validateSupportEmails(): boolean {
    return this.supportEmails.length >= 1 && isEmails(this.supportEmails);
  }

  private getSupportEmails() {
    const adminEmailIdsFromEnv = process.env.SUPPORT_EMAILS;
    return adminEmailIdsFromEnv?.split(',') ?? [];
  }
}
