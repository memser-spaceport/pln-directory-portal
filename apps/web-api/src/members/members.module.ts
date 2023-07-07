import { Module } from '@nestjs/common';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AwsService } from '../utils/aws/aws.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { MemberController } from './members.controller';
import { RedisService } from '../utils/redis/redis.service';
import { SlackService } from '../utils/slack/slack.service';
import { MembersService } from './members.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { AuthService } from '../auth/auth.service';

@Module({
  providers: [
    MembersService,
    FileMigrationService,
    ImagesController,
    ImagesService,
    FileUploadService,
    FileEncryptionService,
    LocationTransferService,
    ParticipantsRequestService,
    AwsService,
    RedisService,
    SlackService,
    ForestAdminService,AuthService
  ],
  controllers: [MemberController],
})
export class MembersModule {}
