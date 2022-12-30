import { Module } from '@nestjs/common';
import { AcceleratorProgramsService } from './accelerator-programs/accelerator-programs.service';
import { MigrateAirtableDataCommand } from './commands/migrate-airtable-data.command';
import { FundingStagesService } from './funding-stages/funding-stages.service';
import { IndustryCategoriesService } from './industry-categories/industry-categories.service';
import { IndustryTagsService } from './industry-tags/industry-tags.service';
import { MembersService } from './members/members.service';
import { PrismaService } from './prisma.service';
import { RolesService } from './roles/roles.service';
import { SkillsService } from './skills/skills.service';
import { TeamMemberRolesService } from './team-member-roles/team-member-roles.service';
import { TeamsService } from './teams/teams.service';
import { TechnologiesService } from './technologies/technologies.service';
import { AirtableService } from './utils/airtable/airtable.service';

@Module({
  providers: [
    TeamsService,
    RolesService,
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
    MigrateAirtableDataCommand,
  ],
})
export class CommandModule {}
