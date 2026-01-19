import { Command, CommandRunner } from 'nest-commander';
import { DryRunSubcommand } from './dry-run.subcommand';
import { ApplySubcommand } from './apply.subcommand';
import { RollbackSubcommand } from './rollback.subcommand';

@Command({
  name: 'enrich-member-experience',
  description: 'Enrich member experience data from LinkedIn profile JSON files',
  subCommands: [DryRunSubcommand, ApplySubcommand, RollbackSubcommand],
})
export class EnrichMemberExperienceCommand extends CommandRunner {
  async run(passedParams: string[]): Promise<void> {
    console.log(`
======================================================================
           Member Experience Enrichment CLI
======================================================================
  Populate MemberExperience table from LinkedIn profile JSON files.

Usage: enrich-member-experience <command> [options]

Commands:
  dry-run     Generate enrichment data (JSON) without modifying DB
  apply       Apply enrichment from JSON file to database
  rollback    Revert changes using rollback SQL file

Examples:
  # Step 1: Generate enrichment JSON (dry-run)
  npm run api:enrich-member-experience -- dry-run --output ./member-exp.json --limit 10

  # Step 2: Review the JSON file, then apply changes
  npm run api:enrich-member-experience -- apply --input ./member-exp.json

  # Step 3: If needed, rollback using the generated SQL
  npm run api:enrich-member-experience -- rollback --input ./rollback-xxx.sql

Options:
  dry-run:
    -o, --output <path>        Output JSON file path
    -l, --limit <n>            Limit number of members to process
    -m, --member-uid <uid>     Process specific member by UID
    -p, --profiles-dir <path>  LinkedIn profiles directory (default: ./linkedin-profiles)

  apply:
    -i, --input <path>         Input JSON file (required)
    -r, --rollback-output      Output path for rollback SQL

  rollback:
    -i, --input <path>         Rollback SQL file (required)

For more details, run: enrich-member-experience <command> --help
`);
  }
}
