import { Module } from '@nestjs/common';
import { EnrichMemberExperienceCommand } from './enrich-member-experience.command';
import { EnrichMemberExperienceService } from './enrich-member-experience.service';
import { DryRunSubcommand } from './dry-run.subcommand';
import { ApplySubcommand } from './apply.subcommand';
import { RollbackSubcommand } from './rollback.subcommand';

@Module({
  providers: [
    EnrichMemberExperienceCommand,
    EnrichMemberExperienceService,
    DryRunSubcommand,
    ApplySubcommand,
    RollbackSubcommand,
  ],
})
export class EnrichMemberExperienceModule {}
