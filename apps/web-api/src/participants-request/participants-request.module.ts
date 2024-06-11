/* eslint-disable prettier/prettier */
import { CacheModule, Module } from '@nestjs/common';
import { AwsService } from '../utils/aws/aws.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { ParticipantsRequestController } from './participants-request.controller';
import { ParticipantsRequestService } from './participants-request.service';
import { UniqueIdentifier } from './unique-identifier/unique-identifier.controller';
import { RedisService } from '../utils/redis/redis.service';
import { SlackService } from '../utils/slack/slack.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { SqsModule } from '@ssut/nestjs-sqs';
@Module({
  imports: [
    SqsModule.register({
      producers: [
        {
          name: process.env.QUEUE || '', // name of the queue
          queueUrl: process.env.QUEUE_URL || '', // the url of the queue
          region: process.env.AWS_REGION,
        }
      ]
    })
  ],
  controllers: [ParticipantsRequestController, UniqueIdentifier],
  providers: [
    ParticipantsRequestService,
    LocationTransferService,
    AwsService,
    RedisService,
    SlackService,
    ForestAdminService,
  ],
  exports: [ParticipantsRequestService]
})
export class ParticipantsRequestModule {}
