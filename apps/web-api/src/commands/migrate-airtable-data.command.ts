import {
  IAirtableIndustryTag,
  IAirtableMember,
  IAirtableTeam,
} from '@protocol-labs-network/airtable';
import fs from 'fs';
import map from 'lodash/map';
import uniq from 'lodash/uniq';
import { Command, CommandRunner } from 'nest-commander';
import { z } from 'zod';
import { AcceleratorProgramsService } from '../accelerator-programs/accelerator-programs.service';
import { FundingStagesService } from '../funding-stages/funding-stages.service';
import { IndustryCategoriesService } from '../industry-categories/industry-categories.service';
import { IndustryTagsService } from '../industry-tags/industry-tags.service';
import { MembersService } from '../members/members.service';
import { SkillsService } from '../skills/skills.service';
import { TeamMemberRolesService } from '../team-member-roles/team-member-roles.service';
import { TeamsService } from '../teams/teams.service';
import { TechnologiesService } from '../technologies/technologies.service';
import { AirtableService } from '../utils/airtable/airtable.service';
import { AirtableIndustryTagSchema } from '../utils/airtable/schema/airtable-industry-tag.schema';
import { AirtableMemberSchema } from '../utils/airtable/schema/airtable-member.schema';
import { AirtableTeamSchema } from '../utils/airtable/schema/airtable-team.schema';

@Command({
  name: 'migrate-airtable-data',
  description: 'A command to migrate data from Airtable into the PL database.',
})
export class MigrateAirtableDataCommand extends CommandRunner {
  private industryTags: IAirtableIndustryTag[];
  private teams: IAirtableTeam[];
  private members: IAirtableMember[];

  constructor(
    private readonly teamsService: TeamsService,
    private readonly skillsService: SkillsService,
    private readonly membersService: MembersService,
    private readonly airtableService: AirtableService,
    private readonly technologiesService: TechnologiesService,
    private readonly industryTagsService: IndustryTagsService,
    private readonly fundingStagesService: FundingStagesService,
    private readonly teamMemberRolesService: TeamMemberRolesService,
    private readonly industryCategoriesService: IndustryCategoriesService,
    private readonly acceleratorProgramsService: AcceleratorProgramsService
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.insertTechnologies();
    await this.insertIndustryTagsWithCategories();
    await this.insertTeamsWithRelationalData();
    await this.insertMembersWithRelationalData();
    await this.insertTeamMemberRoles();
  }

  private validateDataOrFail(
    schema: z.ZodArray<any>,
    data: { [key: string]: any }
  ) {
    const [entity, entries] = Object.entries(data)[0];
    try {
      schema.parse(entries);
    } catch (error) {
      fs.writeFileSync(
        `${entity}.errors.json`,
        JSON.stringify([error, entries])
      );
      console.log(
        '\n',
        `⚠️  There was an issue when validating data at: ${entity}\n`,
        `Please check: ~/protocol-labs-network/${entity}.errors.json`,
        '\n'
      );
      throw Error(error);
    }
  }

  private outputSuccessMessage(message: string) {
    console.log(`\n✅ ${message}\r`);
  }

  private async insertTechnologies() {
    // Technologies need to be created independently
    // and later on will be mapped from Airtable boolean fields:
    await this.technologiesService.insertManyFromList(['Filecoin', 'IPFS']);
    this.outputSuccessMessage('Added Technologies');
  }

  private async insertIndustryTagsWithCategories() {
    // Fetch and validate data:
    this.industryTags = await this.airtableService.getAllIndustryTags();
    this.validateDataOrFail(AirtableIndustryTagSchema.array(), {
      industryTags: this.industryTags,
    });

    // Extract categories from tags:
    const industryCategoriesToCreate = uniq([
      ...map(this.industryTags, 'fields.Categories')
        .filter((val) => !!val)
        .reduce((values, value) => [...values, ...value], []),
    ]);

    // Insert data on database:
    await this.industryCategoriesService.insertManyFromList(
      industryCategoriesToCreate
    );
    await this.industryTagsService.insertManyFromAirtable(this.industryTags);
    this.outputSuccessMessage('Added Industry Tags & Categories');
  }

  private async insertTeamsWithRelationalData() {
    // Fetch and validate data:
    this.teams = await this.airtableService.getAllTeams();
    this.validateDataOrFail(AirtableTeamSchema.array(), {
      teams: this.teams,
    });

    // Extract funding stages from teams:
    const fundingStagesToCreate = uniq<string>(
      map(this.teams, 'fields.Funding Stage').filter((val) => !!val)
    );

    // Extract accelerator programs from teams:
    const acceleratorProgramsToCreate = uniq<string>(
      map(this.teams, 'fields.Accelerator Programs')
        .filter((val) => !!val)
        .reduce((values, value) => [...values, ...value], [])
    );

    // Extract images from teams:
    // const imagesToCreate = map(teams, 'fields.Logo')
    //   .filter((val) => !!val)
    //   .reduce((values, value) => [...values, ...value]);

    // Insert data on database:
    await this.fundingStagesService.insertManyFromList(fundingStagesToCreate);
    await this.acceleratorProgramsService.insertManyFromList(
      acceleratorProgramsToCreate
    );
    await this.teamsService.insertManyFromAirtable(this.teams);

    this.outputSuccessMessage('Added Teams and their relational data');
  }

  private async insertMembersWithRelationalData() {
    // Fetch and validate data:
    this.members = await this.airtableService.getAllMembers();
    this.validateDataOrFail(AirtableMemberSchema.array(), {
      members: this.members,
    });

    // Extract skills from members:
    const skillsToCreate = uniq<string>(
      map(this.members, 'fields.Skills')
        .filter((val) => !!val)
        .reduce((values, value) => [...values, ...value], [])
    );

    // Extract images from members:
    // const imagesToCreate = map(members, 'fields.Profile picture')
    //   .filter((val) => !!val)
    //   .reduce((values, value) => [...values, ...value]);

    // Insert data on database:
    await this.skillsService.insertManyFromList(skillsToCreate);
    await this.membersService.insertManyWithLocationsFromAirtable(this.members);

    this.outputSuccessMessage('Added Members and their relational data');
  }

  private async insertTeamMemberRoles() {
    await this.teamMemberRolesService.insertManyFromAirtable(
      this.members,
      this.teams
    );

    this.outputSuccessMessage('Added Team Member Roles');
  }
}
