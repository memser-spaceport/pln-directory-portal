import { CommandRunner, Option, SubCommand } from 'nest-commander';
import { EnrichMemberExperienceService } from './enrich-member-experience.service';

interface RollbackCommandOptions {
  input: string;
}

@SubCommand({
  name: 'rollback',
  description: 'Revert changes using rollback SQL file',
})
export class RollbackSubcommand extends CommandRunner {
  constructor(private readonly enrichService: EnrichMemberExperienceService) {
    super();
  }

  async run(passedParams: string[], options?: RollbackCommandOptions): Promise<void> {
    try {
      if (!options?.input) {
        console.error('[ERROR] Input file is required. Use --input <path>');
        process.exit(1);
      }

      const inputPath = options.input;

      console.log('\n--- Member Experience Enrichment - Rollback ---\n');
      console.log('Configuration:');
      console.log(`  Rollback SQL file: ${inputPath}`);
      console.log('');

      console.log('Executing rollback...\n');
      const result = await this.enrichService.executeRollback(inputPath);

      if (result.success) {
        console.log(`[OK] ${result.message}`);
        console.log('\nRollback completed successfully.\n');
      } else {
        console.error(`[ERROR] ${result.message}`);
        process.exit(1);
      }
    } catch (error) {
      console.error('[ERROR] rollback failed:', error);
      throw error;
    }
  }

  @Option({
    flags: '-i, --input <path>',
    description: 'Rollback SQL file (required)',
    required: true,
  })
  parseInput(val: string): string {
    return val;
  }
}
