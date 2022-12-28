import { Module } from '@nestjs/common';
import { MigrateAirtableDataCommand } from './commands/migrate-airtable-data.command';
import { IndustryCategoriesService } from './industry-categories/industry-categories.service';
import { IndustryTagsService } from './industry-tags/industry-tags.service';
import { PrismaService } from './prisma.service';
import { AirtableService } from './utils/airtable/airtable.service';

@Module({
  providers: [
    PrismaService,
    AirtableService,
    IndustryTagsService,
    IndustryCategoriesService,
    MigrateAirtableDataCommand,
  ],
})
export class CommandModule {}
