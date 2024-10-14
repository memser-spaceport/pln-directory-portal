import { Global, Logger, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { LogService } from './log.service';
import { ForestAdminService } from '../utils/forest-admin/forest-admin.service';
import { AwsService } from '../utils/aws/aws.service';
import { SlackService } from '../utils/slack/slack.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';

@Global()
@Module({
  providers: [
    PrismaService,
    LogService,
    Logger,
    ForestAdminService,
    AwsService,
    SlackService,
    LocationTransferService,
    FileMigrationService,
    ImagesController,
    ImagesService,
    FileUploadService,
    FileEncryptionService,
  ],
  exports: [
    PrismaService,
    LogService,
    ForestAdminService,
    AwsService,
    SlackService,
    LocationTransferService,
    FileMigrationService,
    ImagesController,
    ImagesService,
    FileUploadService,
    FileEncryptionService,
  ],
})
export class SharedModule {}