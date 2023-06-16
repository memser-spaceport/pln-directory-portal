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
@Module({
  imports: [],
  controllers: [ParticipantsRequestController, UniqueIdentifier],
  providers: [
    ParticipantsRequestService,
    LocationTransferService,
    AwsService,
    RedisService,
    SlackService,
    ForestAdminService,
  ],
})
export class ParticipantsRequestModule {}
