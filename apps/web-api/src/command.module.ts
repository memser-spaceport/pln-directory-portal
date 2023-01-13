import { Module } from '@nestjs/common';
import { AcceleratorProgramsService } from './accelerator-programs/accelerator-programs.service';
import { MigrateAirtableDataCommand } from './commands/migrate-airtable-data.command';
import { FundingStagesService } from './funding-stages/funding-stages.service';
import { ImagesController } from './images/images.controller';
import { ImagesService } from './images/images.service';
import { IndustryCategoriesService } from './industry-categories/industry-categories.service';
import { IndustryTagsService } from './industry-tags/industry-tags.service';
import { MembersService } from './members/members.service';
import { PrismaService } from './prisma.service';
import { SkillsService } from './skills/skills.service';
import { TeamMemberRolesService } from './team-member-roles/team-member-roles.service';
import { TeamsService } from './teams/teams.service';
import { TechnologiesService } from './technologies/technologies.service';
import { AirtableService } from './utils/airtable/airtable.service';
import { FileEncryptionService } from './utils/file-encryption/file-encryption.service';
import { FileMigrationService } from './utils/file-migration/file-migration.service';
import { FileUploadService } from './utils/file-upload/file-upload.service';
import { LocationTransferService } from './utils/location-transfer/location-transfer.service';

@Module({
  providers: [
    TeamsService,
    PrismaService,
    SkillsService,
    MembersService,
    AirtableService,
    TechnologiesService,
    IndustryTagsService,
    FundingStagesService,
    TeamMemberRolesService,
    IndustryCategoriesService,
    AcceleratorProgramsService,
    LocationTransferService,
    MigrateAirtableDataCommand,
    FileMigrationService,
    FileUploadService,
    FileEncryptionService,
    ImagesService,
    ImagesController,
  ],
})
export class CommandModule {}
