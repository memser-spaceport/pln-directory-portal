import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CustomQuestionSchemaDto } from 'libs/contracts/src/schema';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { isEmails } from '../utils/helper/helper';
import { AwsService } from '../utils/aws/aws.service';
import { FAQ_NOTIFICATION_TEMPLATE } from '../utils/constants';

@Injectable()
export class FaqService {
  private supportEmails: string[];
  private isSupportEmailsValid: boolean;
  private isEmailEnabled: string | undefined;
  constructor(  
    private prisma: PrismaService,
    private logger: LogService,
    private awsService: AwsService,
  ){
    this.supportEmails = this.getSupportEmails();
    this.isSupportEmailsValid = this.validateSupportEmails();
    this.isEmailEnabled = process.env.IS_EMAIL_ENABLED;
  }
  async addQuestion(question: CustomQuestionSchemaDto, requestIP: string) {
    try {
      const result = await this.prisma.faq.create({
        data: {
          email: question.email,
          question: question.question,
          type: question.type,
          requestIp: requestIP
        }
      });
      if (result) {
        if (this.isEmailEnabled && this.isEmailEnabled === 'true') {
          this.notifyNewCustomQuestion(result);
        }
        this.logger.info(`New faq question request created from ${question.email} with ref id ${result.uid}`);
        return true;
      } else {
        throw new InternalServerErrorException(`Cannot save faq request from ${question.email}`);
      }
    } catch (error) {
      throw new InternalServerErrorException(`Cannot save faq request from ${question.email}`, error);
    }
  }

  async notifyNewCustomQuestion(faq) {
    if (this.isSupportEmailsValid) {
      await this.awsService.sendEmail(
        FAQ_NOTIFICATION_TEMPLATE,
        true,
        this.supportEmails,
        {
          email: faq.email,
          content: faq.question
        }
      );
      this.logger.info(`New faq request from ${faq.email} - ${faq.uid} notified to support team`);
    } else {
      this.logger.error(
        `Cannot send custom question content for ${faq.uid} as ${this.supportEmails} does not contain valid email addresses`
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
