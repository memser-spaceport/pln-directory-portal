import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { JoinRequestSchemaDto } from 'libs/contracts/src/schema';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { isEmails } from '../utils/helper/helper';
import { AwsService } from '../utils/aws/aws.service';
import { JOIN_NOW_SUBJECT } from '../utils/constants';
import * as path from 'path';

@Injectable()
export class JoinRequestsService {
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
  async createJoinRequest(request: JoinRequestSchemaDto) {
    try {
      const result = await this.prisma.joinRequest.create({
        data: {
          ...request
        }
      });
      if (result) {
        if (this.isEmailEnabled && this.isEmailEnabled === 'true') {
          this.notifyNewJoinRequest(result);
        }
        this.logger.info(`New join request created from ${request.email} with ref id ${result.uid}`);
        return true;
      } else {
        throw new InternalServerErrorException(`Cannot save join request from ${request.email}`);
      }
    } catch (error) {
      throw new InternalServerErrorException(`Cannot save join request from ${request.email}`, error);
    }
  }

  async notifyNewJoinRequest(joinRequest) {
    if (this.isSupportEmailsValid) {
      const from = process.env.SES_SOURCE_EMAIL;
      if (!from) {
        this.logger.error('From email address is not configured.');
        return ;
      }
      const result = await this.awsService.sendEmailWithTemplate(
        path.join(__dirname, '/shared/joinNow.hbs'),
        {
          ...joinRequest
        },
        '',
        JOIN_NOW_SUBJECT,
        from,
        this.supportEmails,
        []
      );
      this.logger.info(`New Join request from ${joinRequest.email} - ${joinRequest.uid} notified to support team ref: ${result.MessageId}`);
    } else {
      this.logger.error(
        `Cannot send new join request content for ${joinRequest.uid} as ${this.supportEmails} does not contain valid email addresses`
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
