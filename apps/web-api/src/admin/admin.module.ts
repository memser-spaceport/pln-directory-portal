/* eslint-disable prettier/prettier */
import { CacheModule, Module } from '@nestjs/common';

import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { AwsService } from '../utils/aws/aws.service';
import { RedisService } from '../utils/redis/redis.service';
import { SlackService } from '../utils/slack/slack.service';
import { AdminService } from './admin.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminController } from './admin.controller';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';

@Module({
  imports: [CacheModule.register()],
  controllers: [AdminController],
  providers: [
    ParticipantsRequestService,
    LocationTransferService,
    AwsService,
    RedisService,
    SlackService,
    AdminService,
    JwtService,
    ForestAdminService,
  ],
})
export class AdminModule {}
