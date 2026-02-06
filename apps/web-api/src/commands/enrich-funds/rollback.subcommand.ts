import { SubCommand, CommandRunner, Option } from 'nest-commander';
import * as fs from 'fs';
import { EnrichFundsService } from './enrich-funds.service';

interface RollbackCommandOptions {
  input: string;
}

@SubCommand({
  name: 'rollback',
  description: 'Rollback enrichment changes using SQL file',
})
export class RollbackSubcommand extends CommandRunner {
  constructor(private readonly enrichFundsService: EnrichFundsService) {
    super();
  }

  async run(
    passedParams: string[],
    options?: RollbackCommandOptions
  ): Promise<void> {
    if (!options?.input) {
      console.error(
        '\n❌ Error: Rollback SQL file is required. Use --input <path>\n'
      );
      process.exit(1);
    }

    const inputPath = options.input;

    console.log('\n⏪ Fund Data Enrichment - Rollback\n');
    console.log('Configuration:');
    console.log(`  Rollback file: ${inputPath}`);
    console.log('');

    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      console.error(`\n❌ Error: Rollback file not found: ${inputPath}\n`);
      process.exit(1);
    }

    // Read and display rollback file content
    const sqlContent = fs.readFileSync(inputPath, 'utf-8');
    const statementCount = (sqlContent.match(/UPDATE/gi) || []).length;

    console.log(`📊 Rollback Summary:`);
    console.log(`  SQL statements: ${statementCount} UPDATE(s)`);
    console.log('');

    // Preview first few lines
    const previewLines = sqlContent.split('\n').slice(0, 10);
    console.log('Preview:');
    previewLines.forEach((line) => {
      console.log(`  ${line}`);
    });
    if (sqlContent.split('\n').length > 10) {
      console.log('  ...');
    }
    console.log('');

    // Execute rollback
    console.log('⏳ Executing rollback...\n');

    const result = await this.enrichFundsService.executeRollback(inputPath);

    if (result.success) {
      console.log('='.repeat(50));
      console.log('✅ Rollback completed successfully!');
      console.log('='.repeat(50));
      console.log(`\n${result.message}\n`);
    } else {
      console.log('='.repeat(50));
      console.log('❌ Rollback failed!');
      console.log('='.repeat(50));
      console.log(`\n${result.message}\n`);
      process.exit(1);
    }
  }

  @Option({
    flags: '-i, --input <path>',
    description: 'Rollback SQL file path (required)',
    required: true,
  })
  parseInput(val: string): string {
    return val;
  }
}
