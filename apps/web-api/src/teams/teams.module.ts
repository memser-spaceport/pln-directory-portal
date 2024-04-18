import { Module } from '@nestjs/common';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AwsService } from '../utils/aws/aws.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { RedisService } from '../utils/redis/redis.service';
import { SlackService } from '../utils/slack/slack.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  controllers: [TeamsController],
  providers: [
    TeamsService,
    FileMigrationService,
    ImagesController,
    ImagesService,
    FileUploadService,
    FileEncryptionService,
    ParticipantsRequestService,
    LocationTransferService,
    AwsService,
    RedisService,
    SlackService,
    ForestAdminService
  ],
  exports:[TeamsService]
})
export class TeamsModule {}
