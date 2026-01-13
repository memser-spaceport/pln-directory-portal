import { Module } from '@nestjs/common';
import { EnrichFundsCommand } from './enrich-funds.command';
import { EnrichFundsService } from './enrich-funds.service';
import { DryRunSubcommand } from './dry-run.subcommand';
import { ApplySubcommand } from './apply.subcommand';
import { RollbackSubcommand } from './rollback.subcommand';

@Module({
  providers: [EnrichFundsCommand, EnrichFundsService, DryRunSubcommand, ApplySubcommand, RollbackSubcommand],
})
export class EnrichFundsModule {}
