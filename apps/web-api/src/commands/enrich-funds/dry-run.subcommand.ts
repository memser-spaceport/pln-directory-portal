import { CommandRunner, Option, SubCommand } from 'nest-commander';
import * as fs from 'fs';
import { EnrichFundsService } from './enrich-funds.service';
import { EnrichedFundData, SkippedFund } from './enrich-funds.types';

interface DryRunCommandOptions {
  output?: string;
  limit?: string;
  fundUid?: string;
}

@SubCommand({
  name: 'dry-run',
  description: 'Generate enrichment data without modifying the database',
})
export class DryRunSubcommand extends CommandRunner {
  constructor(private readonly enrichFundsService: EnrichFundsService) {
    super();
  }

  async run(passedParams: string[], options?: DryRunCommandOptions): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options?.output || `./enriched-funds-${timestamp}.json`;
      const limit = options?.limit ? parseInt(options.limit, 10) : undefined;
      const fundUid = options?.fundUid;

      console.log('\n🔍 Fund Data Enrichment - Dry Run\n');
      console.log('Configuration:');
      console.log(`  Output file: ${outputPath}`);
      console.log(`  Limit: ${limit || 'No limit'}`);
      console.log(`  Specific fund: ${fundUid || 'All incomplete funds'}`);
      console.log('');

      // Find funds with incomplete data
      console.log('📊 Finding funds with incomplete data...');
      const funds = await this.enrichFundsService.findFundsWithIncompleteData(limit, fundUid);

      if (funds.length === 0) {
        console.log('\n✅ No funds with incomplete data found.');
        return;
      }

      console.log(`   Found ${funds.length} fund(s) with incomplete data.\n`);

      // Process each fund
      const enrichedFunds: EnrichedFundData[] = [];
      const skipped: SkippedFund[] = [];

      for (let i = 0; i < funds.length; i++) {
        const fund = funds[i];
        console.log(`[${i + 1}/${funds.length}] Processing: ${fund.name}...`);

        try {
          const result = await this.enrichFundsService.enrichFundWithRetry(fund);

          if (result.status === 'enriched') {
            console.log(`   ✅ Enriched - Fields updated: ${result.fieldsUpdated.join(', ')}`);
            enrichedFunds.push(result);
          } else if (result.status === 'error') {
            console.log(`   ❌ Error: ${result.error}`);
            enrichedFunds.push(result);
          } else {
            console.log('   ⏭️  Skipped - No new data found');
            skipped.push({
              uid: fund.uid,
              name: fund.name,
              reason: 'No new data found from web search',
            });
          }
        } catch (error) {
          console.log(`   ❌ Error: ${error.message}`);
          skipped.push({
            uid: fund.uid,
            name: fund.name,
            reason: error.message,
          });
        }

        // Small delay between requests to avoid rate limiting
        if (i < funds.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Generate output
      const output = this.enrichFundsService.generateDryRunOutput(enrichedFunds, skipped);

      // Write to file
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

      // Summary
      console.log('\n' + '='.repeat(50));
      console.log('📋 Summary');
      console.log('='.repeat(50));
      console.log(`Total funds processed: ${output.metadata.totalFunds}`);
      console.log(`Successfully enriched: ${output.metadata.enrichedFunds}`);
      console.log(`Skipped/Errors: ${output.metadata.skippedFunds}`);
      console.log(`Model used: ${output.metadata.modelUsed}`);
      console.log(`\n📁 Output saved to: ${outputPath}`);
      console.log('\n💡 Review the JSON file and run "enrich-funds apply" to apply changes.\n');
    } catch (error) {
      console.error('[ERROR] dry-run failed:', error);
      throw error;
    }
  }

  @Option({
    flags: '-o, --output <path>',
    description: 'Output file path for enrichment JSON',
  })
  parseOutput(val: string): string {
    return val;
  }

  @Option({
    flags: '-l, --limit <number>',
    description: 'Limit number of funds to process',
  })
  parseLimit(val: string): string {
    return val;
  }

  @Option({
    flags: '-f, --fund-uid <uid>',
    description: 'Process specific fund by UID',
  })
  parseFundUid(val: string): string {
    return val;
  }
}
