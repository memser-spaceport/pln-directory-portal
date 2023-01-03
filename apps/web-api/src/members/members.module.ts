import { Module } from '@nestjs/common';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { PrismaService } from '../prisma.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  providers: [
    MembersService,
    PrismaService,
    FileMigrationService,
    ImagesController,
    ImagesService,
    FileUploadService,
    FileEncryptionService,
    LocationTransferService,
  ],
  controllers: [MemberController],
})
export class MembersModule {}
