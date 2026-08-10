import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { MemberScrapingDogService, ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';
import { generateMemberBioText, resolveMemberPronouns } from '../husky/member-bio.util';
import { formatPersonContext, formatTwitterContext } from '../husky/member-bio-refresh.util';
import { HuskyGenerationService } from '../husky/husky-generation.service';
import { HUSKY_BIO_DISCLAIMER } from '../utils/ai-prompts';
import { buildMemberEnrichmentEligibilityFilter } from './member-enrichment-eligibility-filter';
import { matchTeamFromCompanyName } from './member-enrichment-team-match.util';
import {
  EnrichmentStatus,
  FieldEnrichmentStatus,
  EnrichmentSource,
  MemberDataEnrichment,
  MemberFieldEnrichmentMeta,
  MemberEnrichableField,
} from './member-enrichment.types';

/** Fields needed by generateMemberBioText / resolveMemberPronouns / generateMemberSkills's prompt, plus our own gap checks. */
const MEMBER_ENRICHMENT_SELECT: Prisma.MemberSelect = {
  uid: true,
  name: true,
  email: true,
  bio: true,
  moreDetails: true,
  linkedInDetails: true,
  linkedinHandler: true,
  twitterHandler: true,
  githubHandler: true,
  discordHandler: true,
  telegramHandler: true,
  isInvestor: true,
  skills: { select: { uid: true, title: true } },
  teamMemberRoles: {
    select: { teamUid: true, mainTeam: true, role: true, teamLead: true, team: { select: { uid: true, name: true } } },
  },
  projectContributions: { include: { project: true } },
  experiences: true,
  location: true,
};

type MemberForEnrichment = Prisma.MemberGetPayload<{
  select: {
    uid: true;
    name: true;
    email: true;
    bio: true;
    moreDetails: true;
    linkedInDetails: true;
    linkedinHandler: true;
    twitterHandler: true;
    githubHandler: true;
    discordHandler: true;
    telegramHandler: true;
    isInvestor: true;
    skills: { select: { uid: true; title: true } };
    teamMemberRoles: {
      select: {
        teamUid: true;
        mainTeam: true;
        role: true;
        teamLead: true;
        team: { select: { uid: true; name: true } };
      };
    };
    projectContributions: { include: { project: true } };
    experiences: true;
    location: true;
  };
}>;

const FOUNDER_OR_LEAD_FILTER: Prisma.MemberWhereInput = {
  teamMemberRoles: {
    some: { OR: [{ teamLead: true }, { role: { contains: 'founder', mode: 'insensitive' } }] },
  },
};

/** Mirrors Team's 18-field OR-check: at least one of the four gap-fillable fields is empty. */
const HAS_GAP_FILTER: Prisma.MemberWhereInput = {
  OR: [
    { bio: null },
    { bio: '' },
    { email: null },
    { email: '' },
    { skills: { none: {} } },
    { teamMemberRoles: { none: { mainTeam: true } } },
  ],
};

@Injectable()
export class MemberEnrichmentService {
  private readonly logger = new Logger(MemberEnrichmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scrapingDog: MemberScrapingDogService,
    private readonly huskyGeneration: HuskyGenerationService
  ) {}

  async markMemberForEnrichment(memberUid: string): Promise<void> {
    const existing = await this.readEnrichmentMeta(memberUid);

    const enrichment: MemberDataEnrichment = {
      ...(existing ?? {}),
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };

    await this.upsertEnrichmentRow(memberUid, enrichment);
    this.logger.log(`Marked member ${memberUid} for enrichment`);
  }

  /**
   * Eligibility: matches buildMemberEnrichmentEligibilityFilter, has no MemberEnrichment
   * row yet, and has at least one gap-fillable field empty. Returns founders/team-leads
   * first, then everyone else — marked (and thus inserted) in that order so the FIFO
   * enrichment cron processes them first without needing relation-aggregate ordering.
   */
  async markEligibleMembersForEnrichment(): Promise<number> {
    const baseFilter: Prisma.MemberWhereInput = {
      AND: [buildMemberEnrichmentEligibilityFilter(), { memberEnrichment: { is: null } }, HAS_GAP_FILTER],
    };

    const founderOrLeadMembers = await this.prisma.member.findMany({
      where: { AND: [baseFilter, FOUNDER_OR_LEAD_FILTER] },
      select: { uid: true },
    });
    const founderOrLeadUids = founderOrLeadMembers.map((m) => m.uid);

    const otherMembers = await this.prisma.member.findMany({
      where: { AND: [baseFilter, { uid: { notIn: founderOrLeadUids } }] },
      select: { uid: true },
    });

    const ordered = [...founderOrLeadMembers, ...otherMembers];
    this.logger.log(
      `Found ${ordered.length} members eligible for enrichment marking (${founderOrLeadMembers.length} founders/leads first)`
    );
    for (const member of ordered) {
      await this.markMemberForEnrichment(member.uid);
    }
    return ordered.length;
  }

  /**
   * Members whose MemberEnrichment.dataEnrichment is PendingEnrichment + shouldEnrich=true,
   * oldest-marked-first. Also self-heals rows stuck InProgress beyond the stuck-TTL.
   */
  async findMembersPendingEnrichment(limit?: number): Promise<Array<{ uid: string }>> {
    await this.resetStaleInProgressEnrichment();
    return this.prisma.member.findMany({
      where: {
        memberEnrichment: {
          AND: [
            { dataEnrichment: { path: ['shouldEnrich'], equals: true } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.PendingEnrichment } },
          ],
        },
      },
      orderBy: { memberEnrichment: { createdAt: 'asc' } },
      select: { uid: true },
      ...(limit ? { take: limit } : {}),
    });
  }

  async enrichMember(memberUid: string, enrichedBy = 'system-cron'): Promise<{ status: 'started' | 'in_progress' }> {
    const meta = await this.readEnrichmentMeta(memberUid);
    if (meta?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Enrichment already in progress for member ${memberUid}, skipping`);
      return { status: 'in_progress' };
    }

    await this.markMemberForEnrichment(memberUid);

    this.doEnrichMember(memberUid, enrichedBy).catch((err) => {
      this.logger.error(`Background enrichment failed for member ${memberUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  /**
   * Force re-run. Because there is no candidate-column staging in this pipeline (see
   * docs/MEMBER_ENRICHMENT.md), "force" always means the same thing: re-check each
   * field's current DB emptiness and fill whatever is still a gap. There is no separate
   * "cannotEnrich-only" mode to offer — an unfilled field IS empty in the DB by
   * definition, so it is always retried; a filled field is never overwritten, force or not.
   */
  async forceEnrichMember(
    memberUid: string,
    enrichedBy = 'manually'
  ): Promise<{ status: 'started' | 'in_progress' | 'not_found' }> {
    const member = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { uid: true } });
    if (!member) return { status: 'not_found' };

    const existing = await this.readEnrichmentMeta(memberUid);
    if (existing?.status === EnrichmentStatus.InProgress) {
      this.logger.warn(`Force-enrichment: already in progress for member ${memberUid}, skipping`);
      return { status: 'in_progress' };
    }

    const enrichment: MemberDataEnrichment = {
      ...(existing ?? {}),
      shouldEnrich: true,
      status: EnrichmentStatus.PendingEnrichment,
      fieldsMeta: existing?.fieldsMeta ?? {},
    };
    await this.upsertEnrichmentRow(memberUid, enrichment);
    this.logger.log(`Force-enrichment queued for member ${memberUid}`);

    this.doEnrichMember(memberUid, enrichedBy).catch((err) => {
      this.logger.error(`Background force-enrichment failed for member ${memberUid}: ${err.message}`, err.stack);
    });

    return { status: 'started' };
  }

  async triggerEnrichmentForAllPending(
    enrichedBy = 'system-cron'
  ): Promise<{ total: number; started: number; skipped: number }> {
    const members = await this.findMembersPendingEnrichment();
    this.logger.log(`Trigger all: found ${members.length} members pending enrichment`);

    let started = 0;
    let skipped = 0;
    for (const member of members) {
      const { status } = await this.enrichMember(member.uid, enrichedBy);
      if (status === 'started') started++;
      else skipped++;
    }
    return { total: members.length, started, skipped };
  }

  async getEnrichmentCounts(): Promise<{ pending: number; inProgress: number; enriched: number }> {
    const [pending, inProgress, enriched] = await Promise.all([
      this.prisma.memberEnrichment.count({
        where: {
          AND: [
            { dataEnrichment: { path: ['shouldEnrich'], equals: true } },
            { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.PendingEnrichment } },
          ],
        },
      }),
      this.prisma.memberEnrichment.count({
        where: { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.InProgress } },
      }),
      this.prisma.memberEnrichment.count({
        where: { dataEnrichment: { path: ['status'], equals: EnrichmentStatus.Enriched } },
      }),
    ]);
    return { pending, inProgress, enriched };
  }

  private async doEnrichMember(memberUid: string, enrichedBy: string): Promise<void> {
    const member = (await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: MEMBER_ENRICHMENT_SELECT,
    })) as MemberForEnrichment | null;

    if (!member) {
      this.logger.warn(`Member ${memberUid} not found`);
      return;
    }

    const existingMeta = await this.readEnrichmentMeta(memberUid);
    await this.updateEnrichmentStatus(memberUid, existingMeta, EnrichmentStatus.InProgress);

    const fieldsMeta: Partial<Record<MemberEnrichableField, MemberFieldEnrichmentMeta>> = {
      ...(existingMeta?.fieldsMeta ?? {}),
    };
    const nowIso = () => new Date().toISOString();
    const stamp = (
      field: MemberEnrichableField,
      status: FieldEnrichmentStatus,
      source?: EnrichmentSource,
      note?: string
    ) => {
      fieldsMeta[field] = { status, source, note, lastModifiedAt: nowIso() };
    };
    const stampPreexisting = (field: MemberEnrichableField) => {
      if (!fieldsMeta[field])
        fieldsMeta[field] = { status: FieldEnrichmentStatus.ChangedByUser, lastModifiedAt: nowIso() };
    };

    let scrapingDogSource: 'linkedin' | 'x' | null = null;

    try {
      // 1. Fetch ScrapingDog once — LinkedIn preferred, X fallback — reused across the
      // primaryTeamRole match and the bio context below.
      let personProfile: ScrapingDogPersonProfile | null = null;
      let scrapedContext: string | null = null;

      if (this.scrapingDog.isConfigured()) {
        if (member.linkedinHandler) {
          const result = await this.scrapingDog.fetchPersonProfile(member.linkedinHandler);
          if (result.kind === 'ok') {
            personProfile = result.profile;
            scrapingDogSource = 'linkedin';
            scrapedContext = formatPersonContext(result.profile);
          }
        }
        if (!personProfile && member.twitterHandler) {
          const result = await this.scrapingDog.fetchXProfile(member.twitterHandler);
          if (result.kind === 'ok') {
            scrapingDogSource = 'x';
            scrapedContext = formatTwitterContext(result.profile);
          }
        }
      }

      // 2. email (resolved before skills, which needs it)
      let emailForSkills = member.email;
      if (!member.email) {
        const outcome = await this.tryFillEmail(member.uid);
        if (outcome.filled) {
          emailForSkills = outcome.email ?? null;
          stamp('email', FieldEnrichmentStatus.Enriched, EnrichmentSource.AffinityCrm);
        } else {
          stamp('email', FieldEnrichmentStatus.CannotEnrich, undefined, outcome.reason);
        }
      } else {
        stampPreexisting('email');
      }

      // 3. primaryTeamRole — LinkedIn experience[0] matched to an existing Team. Never
      // creates a team; a miss (or no LinkedIn data at all) leaves the field CannotEnrich.
      const hasMainTeam = member.teamMemberRoles.some((r) => r.mainTeam);
      if (!hasMainTeam) {
        const experience = personProfile?.experiences?.[0];
        if (experience?.company) {
          const matchedTeam = await matchTeamFromCompanyName(this.prisma, experience.company);
          if (matchedTeam) {
            await this.applyPrimaryTeamRole(member, matchedTeam.uid, experience.title);
            stamp('primaryTeamRole', FieldEnrichmentStatus.Enriched, EnrichmentSource.LinkedinExperience);
          } else {
            stamp('primaryTeamRole', FieldEnrichmentStatus.CannotEnrich, undefined, 'no matching team in directory');
          }
        } else {
          stamp('primaryTeamRole', FieldEnrichmentStatus.CannotEnrich, undefined, 'no LinkedIn experience available');
        }
      } else {
        stampPreexisting('primaryTeamRole');
      }

      // 4. bio — reuses generateMemberBioText unchanged, feeding it the ScrapingDog
      // payload from step 1 as scrapedContext (no second scrape).
      if (!member.bio) {
        const pronouns = await resolveMemberPronouns(this.prisma as any, member);
        const bioText = await generateMemberBioText(member, { pronouns, scrapedContext });
        if (bioText && bioText.trim().length > 0) {
          await this.prisma.member.update({
            where: { uid: memberUid },
            data: { bio: `${bioText}${HUSKY_BIO_DISCLAIMER}` },
          });
          stamp('bio', FieldEnrichmentStatus.Enriched, EnrichmentSource.AI);
        } else {
          stamp('bio', FieldEnrichmentStatus.CannotEnrich, undefined, 'model returned an empty bio');
        }
      } else {
        stampPreexisting('bio');
      }

      // 5. skills — reuses HuskyGenerationService.generateMemberSkills unchanged; needs
      // an email (original or just-filled in step 2).
      if (member.skills.length === 0) {
        if (emailForSkills) {
          const { skills } = await this.huskyGeneration.generateMemberSkills(emailForSkills);
          if (skills.length > 0) {
            await this.prisma.member.update({
              where: { uid: memberUid },
              data: { skills: { connect: skills.map((s) => ({ uid: s.uid })) } },
            });
            stamp('skills', FieldEnrichmentStatus.Enriched, EnrichmentSource.AI);
          } else {
            stamp('skills', FieldEnrichmentStatus.CannotEnrich, undefined, 'no matching skills found');
          }
        } else {
          stamp('skills', FieldEnrichmentStatus.CannotEnrich, undefined, 'no email available');
        }
      } else {
        stampPreexisting('skills');
      }

      const finalMeta: MemberDataEnrichment = {
        shouldEnrich: false,
        status: EnrichmentStatus.Enriched,
        isAIGenerated: true,
        enrichedAt: nowIso(),
        enrichedBy,
        fieldsMeta,
        scrapingDog: {
          used: scrapingDogSource !== null,
          fetchedAt: scrapingDogSource ? nowIso() : undefined,
          source: scrapingDogSource ?? undefined,
        },
      };
      await this.upsertEnrichmentRow(memberUid, finalMeta);
      this.logger.log(`Member ${memberUid} enrichment completed`);
    } catch (error) {
      this.logger.error(`Enrichment failed for member ${memberUid}: ${error.message}`, error.stack);
      await this.updateEnrichmentStatus(memberUid, existingMeta, EnrichmentStatus.FailedToEnrich, error.message);
    }
  }

  private async tryFillEmail(memberUid: string): Promise<{ filled: boolean; email?: string; reason?: string }> {
    const masterProfile = await this.prisma.masterProfile.findFirst({
      where: { memberUid, affinityPersonId: { not: null } },
      select: { affinityPersonId: true },
    });

    let candidateEmail: string | null = null;
    if (masterProfile?.affinityPersonId) {
      const person = await this.prisma.affinityPerson.findUnique({
        where: { affinityPersonId: masterProfile.affinityPersonId },
        select: { primaryEmail: true },
      });
      candidateEmail = person?.primaryEmail ?? null;
    }

    if (!candidateEmail) return { filled: false, reason: 'no CRM email on file' };

    const conflict = await this.prisma.member.findUnique({ where: { email: candidateEmail }, select: { uid: true } });
    if (conflict && conflict.uid !== memberUid) {
      return { filled: false, reason: 'CRM email already used by another member' };
    }

    await this.prisma.member.update({ where: { uid: memberUid }, data: { email: candidateEmail } });
    return { filled: true, email: candidateEmail };
  }

  private async applyPrimaryTeamRole(member: MemberForEnrichment, teamUid: string, role: string | null): Promise<void> {
    const existingRole = member.teamMemberRoles.find((r) => r.teamUid === teamUid);
    if (existingRole) {
      await this.prisma.teamMemberRole.update({
        where: { memberUid_teamUid: { memberUid: member.uid, teamUid } },
        data: { mainTeam: true, ...(!existingRole.role && role ? { role } : {}) },
      });
    } else {
      await this.prisma.teamMemberRole.create({
        data: { memberUid: member.uid, teamUid, mainTeam: true, role: role ?? undefined },
      });
    }
  }

  /**
   * Flips rows stuck InProgress past the stuck-TTL back to PendingEnrichment. The only
   * way a row stays InProgress past the TTL is a pod that died mid-run — mirrors
   * team-enrichment.service.ts's resetStaleInProgressEnrichment exactly, member-scoped.
   */
  private async resetStaleInProgressEnrichment(): Promise<void> {
    const ttlMinutes = this.getStuckTtlMinutes();
    const updated = await this.prisma.$executeRaw`
      UPDATE "MemberEnrichment"
      SET "dataEnrichment" =
            jsonb_set(
              jsonb_set("dataEnrichment", '{status}',       '"PendingEnrichment"'),
                                          '{shouldEnrich}', 'true'
            ),
          "updatedAt" = NOW()
      WHERE "dataEnrichment"->>'status' = 'InProgress'
        AND "updatedAt" < NOW() - make_interval(mins => ${ttlMinutes}::int)
    `;
    if (updated > 0) {
      this.logger.warn(
        `Stale member enrichment recovery: reset ${updated} row(s) from InProgress → PendingEnrichment (ttl=${ttlMinutes}m)`
      );
    }
  }

  private getStuckTtlMinutes(): number {
    const raw = process.env.MEMBER_ENRICHMENT_STUCK_TTL_MINUTES?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 180;
  }

  private parseEnrichmentMeta(raw: unknown): MemberDataEnrichment | null {
    if (!raw) return null;
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return data as MemberDataEnrichment;
    } catch {
      return null;
    }
  }

  private async readEnrichmentMeta(memberUid: string): Promise<MemberDataEnrichment | null> {
    const row = await this.prisma.memberEnrichment.findUnique({
      where: { memberUid },
      select: { dataEnrichment: true },
    });
    return this.parseEnrichmentMeta(row?.dataEnrichment);
  }

  private async upsertEnrichmentRow(memberUid: string, enrichment: MemberDataEnrichment): Promise<void> {
    await this.prisma.memberEnrichment.upsert({
      where: { memberUid },
      create: { member: { connect: { uid: memberUid } }, dataEnrichment: enrichment as any },
      update: { dataEnrichment: enrichment as any },
    });
  }

  private async updateEnrichmentStatus(
    memberUid: string,
    currentMeta: MemberDataEnrichment | null,
    status: EnrichmentStatus,
    errorMessage?: string
  ): Promise<void> {
    const meta: MemberDataEnrichment = currentMeta || { shouldEnrich: false, status, fieldsMeta: {} };
    meta.status = status;
    if (status === EnrichmentStatus.FailedToEnrich) meta.shouldEnrich = false;
    if (errorMessage) meta.errorMessage = errorMessage;
    await this.upsertEnrichmentRow(memberUid, meta);
  }
}
