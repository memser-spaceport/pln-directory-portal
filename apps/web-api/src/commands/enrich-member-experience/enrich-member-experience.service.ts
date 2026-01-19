import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

import {
  ApplyResult,
  LinkedInExperience,
  LinkedInProfile,
  MappedExperience,
  MemberEnrichmentResult,
  MemberExperienceEnrichmentOutput,
  MemberToEnrich,
  SkippedMember,
} from './enrich-member-experience.types';

@Injectable()
export class EnrichMemberExperienceService implements OnModuleInit, OnModuleDestroy {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async onModuleInit() {
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  private log(message: string) {
    console.log(`[EnrichMemberExperience] ${message}`);
  }

  private logError(message: string, error?: unknown) {
    const errorMessage = error instanceof Error ? error.stack || error.message : String(error || '');
    console.error(`[EnrichMemberExperience] ERROR: ${message}`, errorMessage);
  }

  /**
   * Find members with NO MemberExperience records and a valid linkedinHandler
   */
  async findMembersWithoutExperience(limit?: number, memberUid?: string): Promise<MemberToEnrich[]> {
    const members = await this.prisma.member.findMany({
      where: {
        linkedinHandler: { not: null },
        ...(memberUid ? { uid: memberUid } : {}),
        experiences: { none: {} }, // Key: Only members with NO experiences
      },
      select: {
        uid: true,
        name: true,
        linkedinHandler: true,
      },
      ...(limit ? { take: limit } : {}),
      orderBy: { name: 'asc' },
    });

    return members.filter((m) => m.linkedinHandler !== null) as MemberToEnrich[];
  }

  /**
   * Extract identifier from linkedinHandler (handles various formats)
   */
  extractLinkedInIdentifier(linkedinHandler: string): string {
    if (!linkedinHandler) return '';

    // Remove trailing slashes and clean up
    const cleaned = linkedinHandler.trim().replace(/\/+$/, '');

    // Patterns to match various LinkedIn URL formats
    // Full URL: https://linkedin.com/in/john-doe or https://www.linkedin.com/in/john-doe
    const fullUrlMatch = cleaned.match(/linkedin\.com\/in\/([^\/\?\s]+)/i);
    if (fullUrlMatch) {
      return fullUrlMatch[1].toLowerCase();
    }

    // Partial: in/john-doe
    const partialMatch = cleaned.match(/^in\/([^\/\?\s]+)/i);
    if (partialMatch) {
      return partialMatch[1].toLowerCase();
    }

    // Just identifier: john-doe-123
    // Allow alphanumeric, hyphens, underscores
    if (/^[a-zA-Z0-9_-]+$/.test(cleaned)) {
      return cleaned.toLowerCase();
    }

    // Fallback: return as-is lowercase
    return cleaned.toLowerCase();
  }

  /**
   * Load all profile files and create a lookup map by identifier
   */
  loadLinkedInProfiles(profilesDir: string): Map<string, LinkedInProfile> {
    const profileMap = new Map<string, LinkedInProfile>();

    if (!fs.existsSync(profilesDir)) {
      this.logError(`Profiles directory does not exist: ${profilesDir}`);
      return profileMap;
    }

    const files = fs.readdirSync(profilesDir).filter((f) => f.startsWith('profile-') && f.endsWith('.json'));

    this.log(`Found ${files.length} profile files in ${profilesDir}`);

    for (const file of files) {
      try {
        const filePath = path.join(profilesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);

        // Handle array or single object
        const profileList: LinkedInProfile[] = Array.isArray(parsed) ? parsed : [parsed];

        for (const profile of profileList) {
          if (profile.public_identifier) {
            const identifier = profile.public_identifier.toLowerCase();
            profileMap.set(identifier, profile);
            this.log(`Loaded profile: ${identifier} (${profile.fullName || 'Unknown'})`);
          }
        }
      } catch (error) {
        this.logError(`Failed to load profile file: ${file}`, error);
      }
    }

    this.log(`Total profiles loaded: ${profileMap.size}`);
    return profileMap;
  }

  /**
   * Parse date in "MMM YYYY" format (e.g., "Mar 2025")
   */
  parseLinkedInDate(dateStr: string): Date | null {
    if (!dateStr || dateStr.toLowerCase() === 'present') {
      return null;
    }

    const months: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };

    // Handle "MMM YYYY" format (e.g., "Mar 2025")
    const match = dateStr.trim().match(/^(\w{3})\s+(\d{4})$/);
    if (match) {
      const monthKey = match[1].toLowerCase();
      const month = months[monthKey];
      const year = parseInt(match[2], 10);
      if (month !== undefined && !isNaN(year)) {
        return new Date(year, month, 1);
      }
    }

    // Try "YYYY" format (just year)
    const yearOnlyMatch = dateStr.trim().match(/^(\d{4})$/);
    if (yearOnlyMatch) {
      const year = parseInt(yearOnlyMatch[1], 10);
      if (!isNaN(year)) {
        return new Date(year, 0, 1); // January 1st
      }
    }

    // Fallback: try native Date parsing
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    this.log(`Could not parse date: "${dateStr}"`);
    return null;
  }

  /**
   * Map LinkedIn experience to MemberExperience fields
   */
  mapExperience(exp: LinkedInExperience, memberUid: string): MappedExperience | null {
    const startDate = this.parseLinkedInDate(exp.starts_at);
    if (!startDate) {
      this.log(`Skipping experience: invalid start date "${exp.starts_at}" for position "${exp.position}"`);
      return null;
    }

    const isPresent = exp.ends_at?.toLowerCase() === 'present';
    const endDate = isPresent ? null : this.parseLinkedInDate(exp.ends_at);

    return {
      title: exp.position || 'Unknown Position',
      company: exp.company_name || 'Unknown Company',
      location: exp.location || null,
      description: exp.summary || null,
      startDate,
      endDate,
      isCurrent: isPresent,
      memberUid,
    };
  }

  /**
   * Process a single member
   */
  processMember(member: MemberToEnrich, profileMap: Map<string, LinkedInProfile>): MemberEnrichmentResult {
    const identifier = this.extractLinkedInIdentifier(member.linkedinHandler);

    if (!identifier) {
      return {
        memberUid: member.uid,
        memberName: member.name,
        linkedinHandler: member.linkedinHandler,
        profileIdentifier: '',
        status: 'skipped',
        experiencesAdded: [],
        error: 'Could not extract LinkedIn identifier from handler',
      };
    }

    const profile = profileMap.get(identifier);

    if (!profile) {
      return {
        memberUid: member.uid,
        memberName: member.name,
        linkedinHandler: member.linkedinHandler,
        profileIdentifier: identifier,
        status: 'skipped',
        experiencesAdded: [],
        error: `No LinkedIn profile found for identifier: ${identifier}`,
      };
    }

    if (!profile.experience || profile.experience.length === 0) {
      return {
        memberUid: member.uid,
        memberName: member.name,
        linkedinHandler: member.linkedinHandler,
        profileIdentifier: identifier,
        status: 'skipped',
        experiencesAdded: [],
        error: 'LinkedIn profile has no experience data',
      };
    }

    const mappedExperiences: MappedExperience[] = [];
    for (const exp of profile.experience) {
      const mapped = this.mapExperience(exp, member.uid);
      if (mapped) {
        mappedExperiences.push(mapped);
      }
    }

    if (mappedExperiences.length === 0) {
      return {
        memberUid: member.uid,
        memberName: member.name,
        linkedinHandler: member.linkedinHandler,
        profileIdentifier: identifier,
        status: 'skipped',
        experiencesAdded: [],
        error: 'No valid experiences could be mapped (all had invalid dates)',
      };
    }

    return {
      memberUid: member.uid,
      memberName: member.name,
      linkedinHandler: member.linkedinHandler,
      profileIdentifier: identifier,
      status: 'enriched',
      experiencesAdded: mappedExperiences,
    };
  }

  /**
   * Generate dry-run output
   */
  generateDryRunOutput(
    members: MemberEnrichmentResult[],
    skipped: SkippedMember[],
    profilesDir: string
  ): MemberExperienceEnrichmentOutput {
    const enrichedMembers = members.filter((m) => m.status === 'enriched');
    const totalExperiences = enrichedMembers.reduce((sum, m) => sum + m.experiencesAdded.length, 0);

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalMembers: members.length + skipped.length,
        enrichedMembers: enrichedMembers.length,
        skippedMembers: skipped.length + members.filter((m) => m.status !== 'enriched').length,
        totalExperiencesAdded: totalExperiences,
        profilesDir,
        version: '1.0.0',
      },
      members,
      skipped,
    };
  }

  /**
   * Apply enrichment from JSON file to database
   */
  async applyEnrichment(input: MemberExperienceEnrichmentOutput, rollbackPath: string): Promise<ApplyResult> {
    const errors: Array<{ memberUid: string; error: string }> = [];
    let membersUpdated = 0;
    let experiencesCreated = 0;

    // Generate rollback SQL before making any changes
    const rollbackStatements: string[] = [
      '-- Member Experience Enrichment Rollback Script',
      `-- Generated: ${new Date().toISOString()}`,
      `-- Applied From: ${input.metadata.generatedAt} enrichment`,
      `-- Profiles Directory: ${input.metadata.profilesDir}`,
      '',
      'BEGIN;',
      '',
    ];

    const enrichedMembers = input.members.filter((m) => m.status === 'enriched' && m.experiencesAdded.length > 0);

    this.log(`Processing ${enrichedMembers.length} members with experiences to add...`);

    for (let i = 0; i < enrichedMembers.length; i++) {
      const member = enrichedMembers[i];

      this.log(`[${i + 1}/${enrichedMembers.length}] Processing: ${member.memberName} (${member.memberUid})`);

      try {
        // Verify member still has no experiences before inserting
        const existingExperiences = await this.prisma.memberExperience.count({
          where: { memberUid: member.memberUid },
        });

        if (existingExperiences > 0) {
          this.log(`  Skipping: Member already has ${existingExperiences} experiences`);
          continue;
        }

        // Use individual transaction per member for durability
        await this.prisma.$transaction(async (tx) => {
          const result = await tx.memberExperience.createMany({
            data: member.experiencesAdded.map((exp) => ({
              title: exp.title,
              company: exp.company,
              location: exp.location,
              description: exp.description,
              startDate: new Date(exp.startDate),
              endDate: exp.endDate ? new Date(exp.endDate) : null,
              isCurrent: exp.isCurrent,
              memberUid: exp.memberUid,
            })),
          });

          experiencesCreated += result.count;
        });

        membersUpdated++;

        // Add rollback SQL for this member
        rollbackStatements.push(`-- Member: ${member.memberName} (${member.memberUid})`);
        rollbackStatements.push(`DELETE FROM "MemberExperience" WHERE "memberUid" = '${member.memberUid}';`);
        rollbackStatements.push('');

        this.log(`  Added ${member.experiencesAdded.length} experiences`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ memberUid: member.memberUid, error: errorMessage });
        this.logError(`  Failed to process member ${member.memberUid}`, error);
      }
    }

    rollbackStatements.push('COMMIT;');
    rollbackStatements.push('');
    rollbackStatements.push('-- Verification Query:');
    rollbackStatements.push('-- SELECT m.name, COUNT(e.id) as exp_count');
    rollbackStatements.push('-- FROM "Member" m');
    rollbackStatements.push('-- JOIN "MemberExperience" e ON m.uid = e."memberUid"');

    if (enrichedMembers.length > 0) {
      const sampleUids = enrichedMembers.slice(0, 10).map((m) => `'${m.memberUid}'`);
      rollbackStatements.push(`-- WHERE m.uid IN (${sampleUids.join(', ')})`);
    }

    rollbackStatements.push('-- GROUP BY m.name;');

    // Write rollback file
    fs.writeFileSync(rollbackPath, rollbackStatements.join('\n'));
    this.log(`Rollback SQL written to: ${rollbackPath}`);

    return {
      success: errors.length === 0,
      membersUpdated,
      experiencesCreated,
      rollbackFilePath: rollbackPath,
      errors,
    };
  }

  /**
   * Execute rollback SQL file
   */
  async executeRollback(sqlPath: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!fs.existsSync(sqlPath)) {
        return { success: false, message: `Rollback file not found: ${sqlPath}` };
      }

      const sql = fs.readFileSync(sqlPath, 'utf-8');

      // Remove all comment lines first
      const sqlWithoutComments = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');

      // Parse SQL into individual statements
      const statements = sqlWithoutComments
        .split(';')
        .map((s) => s.trim())
        .filter((s) => {
          // Filter out empty statements and transaction control
          // (we'll use Prisma's $transaction instead)
          if (!s) return false;
          if (s.toUpperCase() === 'BEGIN') return false;
          if (s.toUpperCase() === 'COMMIT') return false;
          return true;
        });

      if (statements.length === 0) {
        return { success: false, message: 'No valid SQL statements found in rollback file' };
      }

      this.log(`Executing ${statements.length} rollback statements...`);

      // Execute all statements in a transaction
      await this.prisma.$transaction(async (tx) => {
        for (const statement of statements) {
          this.log(`Executing: ${statement.substring(0, 80)}...`);
          await tx.$executeRawUnsafe(statement);
        }
      });

      return {
        success: true,
        message: `Rollback executed successfully. ${statements.length} statement(s) applied.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: `Rollback failed: ${errorMessage}` };
    }
  }
}
