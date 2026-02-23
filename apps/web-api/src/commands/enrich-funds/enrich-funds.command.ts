import { Command, CommandRunner } from 'nest-commander';
import { DryRunSubcommand } from './dry-run.subcommand';
import { ApplySubcommand } from './apply.subcommand';
import { RollbackSubcommand } from './rollback.subcommand';

@Command({
  name: 'enrich-funds',
  description: 'Enrich investment fund data using AI-powered web search',
  subCommands: [DryRunSubcommand, ApplySubcommand, RollbackSubcommand],
})
export class EnrichFundsCommand extends CommandRunner {
  async run(passedParams: string[]): Promise<void> {
    console.log('[DEBUG] enrich-funds main command called');
    console.log('[DEBUG] passedParams:', passedParams);
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Fund Data Enrichment CLI                           ║
╠══════════════════════════════════════════════════════════════╣
║  Enrich investment fund data using AI-powered web search     ║
╚══════════════════════════════════════════════════════════════╝

Usage: enrich-funds <command> [options]

Commands:
  dry-run     Generate enrichment data (JSON) without modifying DB
  apply       Apply enrichment from JSON file to database
  rollback    Revert changes using rollback SQL file

Examples:
  # Step 1: Generate enrichment JSON (dry-run)
  npm run api:enrich-funds -- dry-run --output ./funds.json --limit 10

  # Step 2: Review the JSON file, then apply changes
  npm run api:enrich-funds -- apply --input ./funds.json

  # Step 3: If needed, rollback using the generated SQL
  npm run api:enrich-funds -- rollback --input ./rollback-xxx.sql

Options:
  dry-run:
    -o, --output <path>     Output JSON file path
    -l, --limit <n>         Limit number of funds to process
    -f, --fund-uid <uid>    Process specific fund by UID
    --format <type>         Output format: "json" (default) or "md"
    -w, --whitelist <path>  JSON file with array of team names to process

  apply:
    -i, --input <path>      Input JSON file (required)
    -r, --rollback-output   Output path for rollback SQL

  rollback:
    -i, --input <path>      Rollback SQL file (required)

For more details, run: enrich-funds <command> --help
`);
  }
}
