import { Injectable, Logger } from '@nestjs/common';
import { MemberApprovalState, Prisma } from '@prisma/client';
import { embed, embedMany, generateObject } from 'ai';
import { z } from 'zod';
import { JOB_ASPIRANT_POLICY_CODE } from '../access-control-v2/access-control-v2.constants';
import { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';
import {
  buildMemberMatchText,
  buildRoleMatchText,
  CheckedCandidate,
  cosineSimilarity,
  hashMatchText,
  hasMatchableProfile,
  hasWorkedAtTeam,
  rankSuggestions,
  SUGGESTED_CANDIDATES_MAX_AGE_MS,
  SUGGESTED_CANDIDATES_SHORTLIST_SIZE,
} from './job-openings-suggested-candidates-match';

/** Profiles per embedding request. */
const EMBEDDING_BATCH_SIZE = 100;

const CriteriaSchema = z.object({
  criteria: z.array(z.string().min(1).max(200)).min(4).max(6),
});

const CriteriaCheckSchema = z.object({
  candidates: z.array(
    z.object({
      memberUid: z.string(),
      matched: z.array(z.boolean()),
    })
  ),
});

const CRITERIA_SYSTEM_PROMPT = `You write hiring criteria for a job opening.
Return 4 to 6 short, checkable statements about the candidate (skills, seniority, domain experience or location)
that a reviewer could confirm from a member profile. One fact per statement, no more than 20 words each.
Only use requirements stated or clearly implied by the role text.`;

const CRITERIA_CHECK_SYSTEM_PROMPT = `You check member profiles against a job's criteria.
For each member, answer each criterion in order with true only when the profile clearly supports it, otherwise false.
Return one entry per member, with exactly one boolean per criterion, using the memberUid given.`;

const memberPoolSelect = {
  uid: true,
  name: true,
  role: true,
  bio: true,
  customSkills: true,
  location: { select: { city: true, country: true } },
  skills: { select: { title: true } },
  experiences: { select: { title: true, company: true, description: true } },
  teamMemberRoles: { select: { teamUid: true } },
  matchEmbedding: { select: { model: true, contentHash: true, vector: true } },
} as const;

type PoolMember = Prisma.MemberGetPayload<{ select: typeof memberPoolSelect }>;

type PoolEntry = { member: PoolMember; text: string; vector: number[] };

const roleSelect = {
  uid: true,
  status: true,
  teamUid: true,
  roleTitle: true,
  roleCategory: true,
  department: true,
  seniority: true,
  location: true,
  workMode: true,
  summary: true,
  descriptionHtml: true,
  team: { select: { uid: true, name: true } },
  candidateSuggestionSet: { select: { criteria: true, sourceHash: true, computedAt: true } },
} as const;

type LiveRole = Prisma.JobOpeningGetPayload<{ select: typeof roleSelect }>;

export type SuggestedCandidatesRefreshSummary = {
  roles: number;
  computed: number;
  skipped: number;
  failed: number;
  embedded: number;
  cleared: number;
};

/**
 * Computes and stores suggested candidates for live roles (LAB-2770).
 *
 * Embeds every eligible member once (re-embedding only changed profiles),
 * ranks the pool against each role by similarity, checks the role's criteria
 * on the shortlist only, and stores the top matches. Reads never come here:
 * the endpoint serves the stored rows, so no AI call happens on a request.
 */
@Injectable()
export class JobOpeningsSuggestedCandidatesComputeService {
  private readonly logger = new Logger(JobOpeningsSuggestedCandidatesComputeService.name);

  constructor(private readonly prisma: PrismaService, private readonly aiProvider: AiProviderService) {}

  /**
   * Recomputes every live role that has no suggestions yet, whose text changed,
   * or whose suggestions are older than a day; clears stored suggestions of
   * roles that are no longer live. One failing role never stops the others.
   */
  async refreshDue(now: Date = new Date()): Promise<SuggestedCandidatesRefreshSummary> {
    const cleared = await this.clearNonLiveRoles();
    const roles = await this.prisma.jobOpening.findMany({
      where: { status: { notIn: HIDDEN_JOB_OPENING_STATUSES }, teamUid: { not: null } },
      select: roleSelect,
    });

    const due = roles.filter((role) => isDue(role, now));
    const summary: SuggestedCandidatesRefreshSummary = {
      roles: roles.length,
      computed: 0,
      skipped: roles.length - due.length,
      failed: 0,
      embedded: 0,
      cleared,
    };
    if (due.length === 0) return summary;

    const { pool, embedded } = await this.loadEmbeddedPool();
    summary.embedded = embedded;

    for (const role of due) {
      try {
        await this.computeForRole(role, pool, now);
        summary.computed += 1;
      } catch (error) {
        summary.failed += 1;
        this.logger.error(`Suggested candidates failed for job opening ${role.uid}: ${(error as Error)?.message}`);
      }
    }
    return summary;
  }

  /** One role: criteria, similarity shortlist, criteria check, stored top matches. */
  async computeForRole(role: LiveRole, pool: PoolEntry[], now: Date = new Date()): Promise<void> {
    if (!role.team) return;
    const team = role.team;
    const roleText = buildRoleMatchText(role);
    const sourceHash = hashMatchText(roleText);

    const criteria =
      role.candidateSuggestionSet?.sourceHash === sourceHash && role.candidateSuggestionSet.criteria.length > 0
        ? role.candidateSuggestionSet.criteria
        : await this.generateCriteria(roleText);

    const eligible = pool.filter((entry) => !hasWorkedAtTeam(entry.member, team));
    let checked: CheckedCandidate[] = [];
    if (eligible.length > 0) {
      const { model } = this.aiProvider.getEmbeddingModel();
      const { embedding: roleVector } = await embed({ model, value: roleText });
      const shortlist = eligible
        .map((entry) => ({ entry, similarity: cosineSimilarity(roleVector, entry.vector) }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, SUGGESTED_CANDIDATES_SHORTLIST_SIZE);
      checked = await this.checkCriteria(roleText, criteria, shortlist);
    }

    const ranked = rankSuggestions(checked);
    await this.prisma.$transaction([
      this.prisma.jobOpeningCandidateSuggestionSet.upsert({
        where: { jobOpeningUid: role.uid },
        create: { jobOpeningUid: role.uid, criteria, sourceHash, computedAt: now },
        update: { criteria, sourceHash, computedAt: now },
      }),
      this.prisma.jobOpeningSuggestedCandidate.deleteMany({ where: { jobOpeningUid: role.uid } }),
      this.prisma.jobOpeningSuggestedCandidate.createMany({
        data: ranked.map((suggestion) => ({
          jobOpeningUid: role.uid,
          memberUid: suggestion.memberUid,
          rank: suggestion.rank,
          score: suggestion.score,
          label: suggestion.label,
          criteriaResults: suggestion.criteria as unknown as Prisma.InputJsonValue,
        })),
      }),
    ]);
  }

  /**
   * Eligible members with a current embedding: approved or verified, or on the
   * job-aspirant policy; not deleted; with something matchable on the profile.
   * Members whose profile text or the embedding model changed are re-embedded.
   */
  async loadEmbeddedPool(): Promise<{ pool: PoolEntry[]; embedded: number }> {
    const members = await this.prisma.member.findMany({
      where: {
        deletedAt: null,
        OR: [
          { isVerified: true },
          { memberApproval: { state: { in: [MemberApprovalState.APPROVED, MemberApprovalState.VERIFIED] } } },
          { policyAssignmentsV2: { some: { policy: { code: JOB_ASPIRANT_POLICY_CODE } } } },
        ],
      },
      select: memberPoolSelect,
    });

    const { model, name } = this.aiProvider.getEmbeddingModel();
    const pool: PoolEntry[] = [];
    const stale: Array<{ member: PoolMember; text: string; contentHash: string }> = [];
    for (const member of members) {
      if (!hasMatchableProfile(member)) continue;
      const text = buildMemberMatchText(member);
      const contentHash = hashMatchText(text);
      const stored = member.matchEmbedding;
      if (stored && stored.model === name && stored.contentHash === contentHash && stored.vector.length > 0) {
        pool.push({ member, text, vector: stored.vector });
      } else {
        stale.push({ member, text, contentHash });
      }
    }

    for (let start = 0; start < stale.length; start += EMBEDDING_BATCH_SIZE) {
      const batch = stale.slice(start, start + EMBEDDING_BATCH_SIZE);
      const { embeddings } = await embedMany({ model, values: batch.map((item) => item.text) });
      await this.prisma.$transaction(
        batch.map((item, index) =>
          this.prisma.memberMatchEmbedding.upsert({
            where: { memberUid: item.member.uid },
            create: {
              memberUid: item.member.uid,
              model: name,
              contentHash: item.contentHash,
              vector: embeddings[index],
            },
            update: { model: name, contentHash: item.contentHash, vector: embeddings[index] },
          })
        )
      );
      batch.forEach((item, index) => pool.push({ member: item.member, text: item.text, vector: embeddings[index] }));
    }

    return { pool, embedded: stale.length };
  }

  private async generateCriteria(roleText: string): Promise<string[]> {
    const { object } = await generateObject({
      model: this.aiProvider.getResponsesModel(undefined, { useSearchGrounding: false }),
      schema: CriteriaSchema,
      system: CRITERIA_SYSTEM_PROMPT,
      prompt: roleText,
    });
    return object.criteria.map((criterion) => criterion.trim()).filter(Boolean);
  }

  private async checkCriteria(
    roleText: string,
    criteria: string[],
    shortlist: Array<{ entry: PoolEntry; similarity: number }>
  ): Promise<CheckedCandidate[]> {
    if (shortlist.length === 0 || criteria.length === 0) return [];
    const prompt = [
      `Job:\n${roleText}`,
      `Criteria (in order):\n${criteria.map((criterion, index) => `${index + 1}. ${criterion}`).join('\n')}`,
      `Members:\n${shortlist.map(({ entry }) => `memberUid: ${entry.member.uid}\n${entry.text}`).join('\n\n---\n\n')}`,
    ].join('\n\n');

    const { object } = await generateObject({
      model: this.aiProvider.getResponsesModel(undefined, { useSearchGrounding: false }),
      schema: CriteriaCheckSchema,
      system: CRITERIA_CHECK_SYSTEM_PROMPT,
      prompt,
    });

    const answers = new Map(object.candidates.map((candidate) => [candidate.memberUid, candidate.matched]));
    // A member the model skipped, or answered with the wrong number of marks,
    // is left out rather than guessed.
    return shortlist.flatMap(({ entry, similarity }) => {
      const matched = answers.get(entry.member.uid);
      if (!matched || matched.length !== criteria.length) return [];
      return [
        {
          memberUid: entry.member.uid,
          similarity,
          criteria: criteria.map((criterion, index) => ({ criterion, matched: matched[index] === true })),
        },
      ];
    });
  }

  private async clearNonLiveRoles(): Promise<number> {
    const nonLive: Prisma.JobOpeningWhereInput = {
      OR: [{ status: { in: HIDDEN_JOB_OPENING_STATUSES } }, { teamUid: null }],
    };
    const [, sets] = await this.prisma.$transaction([
      this.prisma.jobOpeningSuggestedCandidate.deleteMany({ where: { jobOpening: nonLive } }),
      this.prisma.jobOpeningCandidateSuggestionSet.deleteMany({ where: { jobOpening: nonLive } }),
    ]);
    return sets.count;
  }
}

/** No suggestions yet, role text changed since, or older than a day. */
export function isDue(
  role: { candidateSuggestionSet: { sourceHash: string; computedAt: Date } | null } & Parameters<
    typeof buildRoleMatchText
  >[0],
  now: Date
): boolean {
  const set = role.candidateSuggestionSet;
  if (!set) return true;
  if (set.sourceHash !== hashMatchText(buildRoleMatchText(role))) return true;
  return now.getTime() - set.computedAt.getTime() >= SUGGESTED_CANDIDATES_MAX_AGE_MS;
}
