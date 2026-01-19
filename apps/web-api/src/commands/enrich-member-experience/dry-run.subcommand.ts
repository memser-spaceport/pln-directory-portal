import { CommandRunner, Option, SubCommand } from 'nest-commander';
import * as fs from 'fs';
import * as path from 'path';
import { EnrichMemberExperienceService } from './enrich-member-experience.service';
import { MemberEnrichmentResult, SkippedMember } from './enrich-member-experience.types';

interface DryRunCommandOptions {
  output?: string;
  limit?: string;
  memberUid?: string;
  profilesDir?: string;
}

@SubCommand({
  name: 'dry-run',
  description: 'Generate enrichment data without modifying the database',
})
export class DryRunSubcommand extends CommandRunner {
  constructor(private readonly enrichService: EnrichMemberExperienceService) {
    super();
  }

  async run(passedParams: string[], options?: DryRunCommandOptions): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = options?.output || `./member-experiences-${timestamp}.json`;
      const limit = options?.limit ? parseInt(options.limit, 10) : undefined;
      const memberUid = options?.memberUid;
      const profilesDir = options?.profilesDir || './linkedin-profiles';

      console.log('\n--- Member Experience Enrichment - Dry Run ---\n');
      console.log('Configuration:');
      console.log(`  Profiles directory: ${profilesDir}`);
      console.log(`  Output file: ${outputPath}`);
      console.log(`  Limit: ${limit || 'No limit'}`);
      console.log(`  Specific member: ${memberUid || 'All members without experiences'}`);
      console.log('');

      // Resolve profiles directory to absolute path
      const absoluteProfilesDir = path.resolve(profilesDir);

      // Load LinkedIn profiles
      console.log('Loading LinkedIn profiles...');
      const profileMap = this.enrichService.loadLinkedInProfiles(absoluteProfilesDir);

      if (profileMap.size === 0) {
        console.log('\nNo LinkedIn profiles found in the specified directory.');
        console.log(`Make sure profile-{identifier}.json files exist in: ${absoluteProfilesDir}`);
        return;
      }

      console.log(`  Loaded ${profileMap.size} profile(s)\n`);

      // Find members without experiences
      console.log('Finding members without experiences...');
      const members = await this.enrichService.findMembersWithoutExperience(limit, memberUid);

      if (members.length === 0) {
        console.log('\nNo members found without experiences (or with specified criteria).');
        return;
      }

      console.log(`  Found ${members.length} member(s) without experiences.\n`);

      // Process each member
      const results: MemberEnrichmentResult[] = [];
      const skipped: SkippedMember[] = [];

      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        console.log(`[${i + 1}/${members.length}] Processing: ${member.name}...`);

        const result = this.enrichService.processMember(member, profileMap);
        results.push(result);

        if (result.status === 'enriched') {
          console.log(`   [OK] Enriched - ${result.experiencesAdded.length} experience(s) mapped`);
        } else {
          console.log(`   [SKIP] ${result.error}`);
        }
      }

      // Find members with linkedinHandler but no matching profile
      const membersWithoutProfile = results.filter((r) => r.status === 'skipped');
      for (const m of membersWithoutProfile) {
        skipped.push({
          uid: m.memberUid,
          name: m.memberName,
          linkedinHandler: m.linkedinHandler,
          reason: m.error || 'Unknown reason',
        });
      }

      // Generate output
      const output = this.enrichService.generateDryRunOutput(results, skipped, absoluteProfilesDir);

      // Write to file
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

      // Summary
      console.log('\n' + '='.repeat(50));
      console.log('Summary');
      console.log('='.repeat(50));
      console.log(`Total members processed: ${output.metadata.totalMembers}`);
      console.log(`Successfully enriched: ${output.metadata.enrichedMembers}`);
      console.log(`Skipped: ${output.metadata.skippedMembers}`);
      console.log(`Total experiences to add: ${output.metadata.totalExperiencesAdded}`);
      console.log(`\nOutput saved to: ${outputPath}`);
      console.log('\nReview the JSON file and run "enrich-member-experience apply" to apply changes.\n');
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
    description: 'Limit number of members to process',
  })
  parseLimit(val: string): string {
    return val;
  }

  @Option({
    flags: '-m, --member-uid <uid>',
    description: 'Process specific member by UID',
  })
  parseMemberUid(val: string): string {
    return val;
  }

  @Option({
    flags: '-p, --profiles-dir <path>',
    description: 'Directory containing LinkedIn profile JSON files (default: ./linkedin-profiles)',
  })
  parseProfilesDir(val: string): string {
    return val;
  }
}
