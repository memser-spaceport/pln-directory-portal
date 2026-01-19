import { CommandRunner, Option, SubCommand } from 'nest-commander';
import * as fs from 'fs';
import { EnrichMemberExperienceService } from './enrich-member-experience.service';
import { MemberExperienceEnrichmentOutput } from './enrich-member-experience.types';

interface ApplyCommandOptions {
  input: string;
  rollbackOutput?: string;
}

@SubCommand({
  name: 'apply',
  description: 'Apply enrichment from JSON file to database',
})
export class ApplySubcommand extends CommandRunner {
  constructor(private readonly enrichService: EnrichMemberExperienceService) {
    super();
  }

  async run(passedParams: string[], options?: ApplyCommandOptions): Promise<void> {
    try {
      if (!options?.input) {
        console.error('[ERROR] Input file is required. Use --input <path>');
        process.exit(1);
      }

      const inputPath = options.input;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rollbackPath = options?.rollbackOutput || `./rollback-member-exp-${timestamp}.sql`;

      console.log('\n--- Member Experience Enrichment - Apply ---\n');
      console.log('Configuration:');
      console.log(`  Input file: ${inputPath}`);
      console.log(`  Rollback file: ${rollbackPath}`);
      console.log('');

      // Read input file
      if (!fs.existsSync(inputPath)) {
        console.error(`[ERROR] Input file not found: ${inputPath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(inputPath, 'utf-8');
      const input: MemberExperienceEnrichmentOutput = JSON.parse(content);

      console.log('Enrichment file loaded:');
      console.log(`  Generated: ${input.metadata.generatedAt}`);
      console.log(`  Total members: ${input.metadata.totalMembers}`);
      console.log(`  To be enriched: ${input.metadata.enrichedMembers}`);
      console.log(`  Experiences to add: ${input.metadata.totalExperiencesAdded}`);
      console.log('');

      if (input.metadata.enrichedMembers === 0) {
        console.log('No members to enrich. Exiting.');
        return;
      }

      // Apply enrichment
      console.log('Applying enrichment to database...\n');
      const result = await this.enrichService.applyEnrichment(input, rollbackPath);

      // Summary
      console.log('\n' + '='.repeat(50));
      console.log('Summary');
      console.log('='.repeat(50));
      console.log(`Members updated: ${result.membersUpdated}`);
      console.log(`Experiences created: ${result.experiencesCreated}`);
      console.log(`Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const err of result.errors) {
          console.log(`  - ${err.memberUid}: ${err.error}`);
        }
      }

      console.log(`\nRollback SQL saved to: ${result.rollbackFilePath}`);
      console.log('\nTo rollback changes, run:');
      console.log(`  npm run api:enrich-member-experience -- rollback --input ${result.rollbackFilePath}\n`);

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error('[ERROR] apply failed:', error);
      throw error;
    }
  }

  @Option({
    flags: '-i, --input <path>',
    description: 'Input JSON file from dry-run (required)',
    required: true,
  })
  parseInput(val: string): string {
    return val;
  }

  @Option({
    flags: '-r, --rollback-output <path>',
    description: 'Output path for rollback SQL file',
  })
  parseRollbackOutput(val: string): string {
    return val;
  }
}
