import { CommandRunner, Option, SubCommand } from 'nest-commander';
import * as fs from 'fs';
import * as path from 'path';
import { EnrichFundsService } from './enrich-funds.service';
import { EnrichedFundData, SkippedFund } from './enrich-funds.types';

interface DryRunCommandOptions {
  output?: string;
  limit?: string;
  fundUid?: string;
  format?: string;
  whitelist?: string;
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
      const outputDir = './enriched-funds';
      fs.mkdirSync(outputDir, { recursive: true });
      const outputPath = options?.output || path.join(outputDir, `enriched-funds-${timestamp}.json`);
      const limit = options?.limit ? parseInt(options.limit, 10) : undefined;
      const fundUid = options?.fundUid;
      const format = options?.format || 'json';
      const whitelistPath = options?.whitelist;

      // Validate format option
      if (format !== 'json' && format !== 'md') {
        console.error(`\n❌ Invalid format "${format}". Must be "json" or "md".\n`);
        return;
      }

      // Load whitelist if provided
      let teamNames: string[] | undefined;
      if (whitelistPath) {
        try {
          const raw = fs.readFileSync(whitelistPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
            console.error('\n❌ Whitelist file must contain a JSON array of strings.\n');
            return;
          }
          teamNames = parsed;
        } catch (err) {
          console.error(`\n❌ Failed to read whitelist file: ${err.message}\n`);
          return;
        }
      }

      console.log('\n🔍 Fund Data Enrichment - Dry Run\n');
      console.log('Configuration:');
      console.log(`  Output file: ${outputPath}`);
      console.log(`  Format: ${format}`);
      console.log(`  Limit: ${limit || 'No limit'}`);
      console.log(`  Specific fund: ${fundUid || 'All incomplete funds'}`);
      if (teamNames) {
        console.log(`  Whitelist: ${teamNames.length} team(s) from ${whitelistPath}`);
      }
      console.log('');

      // Find funds with incomplete data
      console.log('📊 Finding funds with incomplete data...');
      const funds = await this.enrichFundsService.findFundsWithIncompleteData(limit, fundUid, teamNames);

      if (funds.length === 0) {
        console.log('\n✅ No funds with incomplete data found.');
        return;
      }

      console.log(`   Found ${funds.length} fund(s) with incomplete data.\n`);

      // Process each fund
      const enrichedFunds: EnrichedFundData[] = [];
      const skipped: SkippedFund[] = [];

      let totalProcessingMs = 0;

      for (let i = 0; i < funds.length; i++) {
        const fund = funds[i];
        console.log(`[${i + 1}/${funds.length}] Processing: ${fund.name}...`);
        const startTime = Date.now();

        try {
          const result = await this.enrichFundsService.enrichFundWithRetry(fund);
          const elapsedMs = Date.now() - startTime;
          totalProcessingMs += elapsedMs;
          const elapsedSec = (elapsedMs / 1000).toFixed(1);

          if (result.status === 'enriched') {
            console.log(`   ✅ Enriched - Fields updated: ${result.fieldsUpdated.join(', ')} (${elapsedSec}s)`);
            enrichedFunds.push(result);
          } else if (result.status === 'error') {
            console.log(`   ❌ Error: ${result.error} (${elapsedSec}s)`);
            enrichedFunds.push(result);
          } else {
            console.log(`   ⏭️  Skipped - No new data found (${elapsedSec}s)`);
            skipped.push({
              uid: fund.uid,
              name: fund.name,
              reason: 'No new data found from web search',
            });
          }
        } catch (error) {
          const elapsedMs = Date.now() - startTime;
          totalProcessingMs += elapsedMs;
          const elapsedSec = (elapsedMs / 1000).toFixed(1);
          console.log(`   ❌ Error: ${error.message} (${elapsedSec}s)`);
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

      // Write JSON file (always needed for apply)
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

      // Write markdown file if format=md
      let mdPath: string | undefined;
      if (format === 'md') {
        mdPath = outputPath.replace(/\.json$/, '.md');
        const markdown = this.enrichFundsService.generateMarkdownReport(output);
        fs.writeFileSync(mdPath, markdown);
      }

      // Summary
      console.log('\n' + '='.repeat(50));
      console.log('📋 Summary');
      console.log('='.repeat(50));
      console.log(`Total funds processed: ${output.metadata.totalFunds}`);
      console.log(`Successfully enriched: ${output.metadata.enrichedFunds}`);
      console.log(`Skipped/Errors: ${output.metadata.skippedFunds}`);
      console.log(`Model used: ${output.metadata.modelUsed}`);
      const avgTimeSec = (totalProcessingMs / funds.length / 1000).toFixed(1);
      console.log(`Avg time per fund: ${avgTimeSec}s`);
      console.log(`\n📁 JSON output saved to: ${outputPath}`);
      if (mdPath) {
        console.log(`📄 Markdown report saved to: ${mdPath}`);
      }
      console.log('\n💡 Review the output and run "enrich-funds apply" to apply changes.\n');
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

  @Option({
    flags: '--format <type>',
    description: 'Output format: "json" (default) or "md" (generates both JSON + markdown)',
  })
  parseFormat(val: string): string {
    return val;
  }

  @Option({
    flags: '-w, --whitelist <path>',
    description: 'Path to JSON file containing array of team names to process',
  })
  parseWhitelist(val: string): string {
    return val;
  }
}
