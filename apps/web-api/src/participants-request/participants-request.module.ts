/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../prisma.service';
import { TeamsService } from '../teams/teams.service';
import { AwsService } from '../utils/aws/aws.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { ParticipantsRequestController } from './participants-request.controller';
import { ParticipantsRequestService } from './participants-request.service';

@Module({
  controllers: [ParticipantsRequestController],
  providers: [
    ParticipantsRequestService,
    PrismaService,
    LocationTransferService,
    AwsService,
  ],
})
export class ParticipantsRequestModule {}
