import { CommandRunner, Option, SubCommand } from 'nest-commander';
import * as fs from 'fs';
import * as path from 'path';
import { EnrichFundsService } from './enrich-funds.service';
import { EnrichmentOutput } from './enrich-funds.types';

interface ApplyCommandOptions {
  input: string;
  rollbackOutput?: string;
}

@SubCommand({
  name: 'apply',
  description: 'Apply enrichment data from JSON file to the database',
})
export class ApplySubcommand extends CommandRunner {
  constructor(private readonly enrichFundsService: EnrichFundsService) {
    super();
  }

  async run(passedParams: string[], options?: ApplyCommandOptions): Promise<void> {
    if (!options?.input) {
      console.error('\n❌ Error: Input file is required. Use --input <path>\n');
      process.exit(1);
    }

    const inputPath = options.input;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = './enriched-funds';
    fs.mkdirSync(outputDir, { recursive: true });
    const rollbackPath = options?.rollbackOutput || path.join(outputDir, `rollback-${timestamp}.sql`);

    console.log('\n🚀 Fund Data Enrichment - Apply\n');
    console.log('Configuration:');
    console.log(`  Input file: ${inputPath}`);
    console.log(`  Rollback file: ${rollbackPath}`);
    console.log('');

    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      console.error(`\n❌ Error: Input file not found: ${inputPath}\n`);
      process.exit(1);
    }

    // Read and parse input file
    let input: EnrichmentOutput;
    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      input = JSON.parse(content) as EnrichmentOutput;
    } catch (error) {
      console.error(`\n❌ Error: Failed to parse input file: ${error.message}\n`);
      process.exit(1);
    }

    // Validate input structure
    if (!input.metadata || !input.funds) {
      console.error('\n❌ Error: Invalid input file structure\n');
      process.exit(1);
    }

    // Display what will be applied
    const fundsToApply = input.funds.filter((f) => f.status === 'enriched' && f.fieldsUpdated.length > 0);

    if (fundsToApply.length === 0) {
      console.log('\n✅ No enrichment data to apply.\n');
      return;
    }

    console.log('📊 Enrichment Summary:');
    console.log(`  Total funds in file: ${input.metadata.totalFunds}`);
    console.log(`  Funds to update: ${fundsToApply.length}`);
    console.log('');
    console.log('Funds to be updated:');
    fundsToApply.forEach((fund, index) => {
      console.log(`  ${index + 1}. ${fund.name} - Fields: ${fund.fieldsUpdated.join(', ')}`);
    });
    console.log('');

    // Apply changes
    console.log('⏳ Applying changes...\n');

    const result = await this.enrichFundsService.applyEnrichment(input, rollbackPath);

    // Display results
    console.log('='.repeat(50));
    console.log('📋 Apply Results');
    console.log('='.repeat(50));
    console.log(`Teams updated: ${result.teamsUpdated}`);
    console.log(`Investor profiles updated: ${result.investorProfilesUpdated}`);
    console.log(`Errors: ${result.errors.length}`);

    if (result.errors.length > 0) {
      console.log('\n⚠️  Errors:');
      result.errors.forEach((err) => {
        console.log(`  - ${err.uid}: ${err.error}`);
      });
    }

    console.log(`\n📁 Rollback SQL saved to: ${result.rollbackFilePath}`);
    console.log('\n💡 To revert changes, run: enrich-funds rollback --input ' + result.rollbackFilePath);

    if (result.success) {
      console.log('\n✅ Enrichment applied successfully!\n');
    } else {
      console.log('\n⚠️  Enrichment completed with some errors.\n');
      process.exit(1);
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
