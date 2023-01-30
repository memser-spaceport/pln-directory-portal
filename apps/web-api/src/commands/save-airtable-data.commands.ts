import {
  IAirtableIndustryTag,
  IAirtableMember,
  IAirtableTeam,
} from '@protocol-labs-network/airtable';
import * as fs from 'fs';
import { Command, CommandRunner } from 'nest-commander';
import { AirtableService } from '../utils/airtable/airtable.service';

@Command({
  name: 'save-airtable-data',
  description: 'A command to save data from Airtable into a json file',
})
export class SaveAirtableDataCommand extends CommandRunner {
  private industryTags: IAirtableIndustryTag[];
  private teams: IAirtableTeam[];
  private members: IAirtableMember[];

  constructor(private readonly airtableService: AirtableService) {
    super();
  }

  async run(): Promise<void> {
    await this.insertIndustryTagsWithCategories();
    await this.insertTeams();
    await this.insertMembers();
  }

  private async insertIndustryTagsWithCategories() {
    this.industryTags = await this.airtableService.getAllIndustryTags();

    // Write JSON string to a file
    await this.generateFile(this.industryTags, 'industry-tags');
  }

  private async insertTeams() {
    this.teams = await this.airtableService.getAllTeams();

    // Write JSON string to a file
    await this.generateFile(this.teams, 'teams');
  }

  private async insertMembers() {
    this.members = await this.airtableService.getAllMembers();

    // Write JSON string to a file
    await this.generateFile(this.members, 'members');
  }

  private async generateFile(data, filename) {
    fs.writeFile(
      `apps/web-api/src/commands/data/${filename}.json`,
      JSON.stringify(data),
      (err) => {
        if (err) {
          console.log('Error writing file', err);
        } else {
          console.log('Successfully wrote file');
        }
      }
    );
  }
}
