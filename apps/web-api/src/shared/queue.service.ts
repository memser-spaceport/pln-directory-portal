import { Injectable, Logger } from '@nestjs/common';
import { AwsService } from '../utils/aws/aws.service';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private awsService: AwsService) {}

  async sendMessage(queueUrl: string, payload: any) {
    if (!queueUrl) {
      this.logger.error('Queue URL is empty - cannot send message');
      return;
    }
    return await this.awsService.sendSqsMessage(queueUrl, payload);
  }
}