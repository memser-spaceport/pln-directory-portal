import { Module } from '@nestjs/common';
import { ImagesController } from '../images/images.controller';
import { ImagesService } from '../images/images.service';
import { FileEncryptionService } from '../utils/file-encryption/file-encryption.service';
import { FileMigrationService } from '../utils/file-migration/file-migration.service';
import { FileUploadService } from '../utils/file-upload/file-upload.service';
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
  ],
})
export class TeamsModule {}
