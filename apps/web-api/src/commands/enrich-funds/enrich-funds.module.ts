import { Module } from '@nestjs/common';
import { EnrichFundsCommand } from './enrich-funds.command';
import { EnrichFundsService } from './enrich-funds.service';
import { DryRunSubcommand } from './dry-run.subcommand';
import { ApplySubcommand } from './apply.subcommand';
import { RollbackSubcommand } from './rollback.subcommand';
import { FileUploadService } from '../../utils/file-upload/file-upload.service';
import { AwsService } from '../../utils/aws/aws.service';
import { FileEncryptionService } from '../../utils/file-encryption/file-encryption.service';

@Module({
  providers: [
    EnrichFundsCommand,
    EnrichFundsService,
    DryRunSubcommand,
    ApplySubcommand,
    RollbackSubcommand,
    FileUploadService,
    AwsService,
    FileEncryptionService,
  ],
})
export class EnrichFundsModule {}
