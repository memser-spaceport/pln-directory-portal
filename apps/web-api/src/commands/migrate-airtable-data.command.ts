import fs from 'fs';
import { Command, CommandRunner } from 'nest-commander';
import { z } from 'zod';
import { IndustryCategoriesService } from '../industry-categories/industry-categories.service';
import { IndustryTagsService } from '../industry-tags/industry-tags.service';
import { AirtableService } from '../utils/airtable/airtable.service';
import { AirtableIndustryTagSchema } from '../utils/airtable/schema/airtable-industry-tag.schema';

@Command({
  name: 'migrate-airtable-data',
  description: 'A command to migrate data from Airtable into the PL database.',
})
export class MigrateAirtableDataCommand extends CommandRunner {
  constructor(
    private readonly airtableService: AirtableService,
    private readonly industryTagsService: IndustryTagsService,
    private readonly industryCategoriesService: IndustryCategoriesService
  ) {
    super();
  }

  async run(): Promise<void> {
    this.insertIndustryTagsWithCategories();
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
    console.log(`\n✅ ${message}\n`);
  }

  private async insertIndustryTagsWithCategories() {
    // Fetch and validate data:
    const industryTags = await this.airtableService.getAllIndustryTags();
    this.validateDataOrFail(AirtableIndustryTagSchema.array(), {
      industryTags,
    });

    // Extract categories from tags:
    const industryCategoriesToCreate = industryTags.reduce(
      (categories, entry) =>
        !!entry.fields.Categories
          ? [...categories, ...entry.fields.Categories]
          : categories,
      []
    );

    // Insert data on database:
    await this.industryCategoriesService.insertManyFromList(
      industryCategoriesToCreate
    );
    await this.industryTagsService.insertManyFromAirtable(industryTags);
    this.outputSuccessMessage('Added Industry Tags data');
  }
}
