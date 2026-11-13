import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateText } from 'ai';
import type { TeamNewsDefaultTagsResponse } from 'libs/contracts/src/schema/team-news';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { excludedMemberWhere } from '../member-signals/member-exclusion';
import { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { NewsTagVocabulary, NewsTagVocabularyService } from './news-tag-vocabulary.service';
import { stripHtmlToPlainText } from './team-news-body-html.util';
import { isNewsProfileStartingTagsEnabled, readChosenNewsTags } from './utils/news-tags';

const PROVIDER_ENV_VAR = 'NEWS_DEFAULT_TAGS_AI_PROVIDER';
const MODEL_TIMEOUT_MS = 20_000;
// Room for a thinking model's reasoning tokens; the reply itself is one short JSON object.
const MODEL_MAX_TOKENS = 2000;
const BIO_MAX_CHARS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;
const GENERATION_DISTINCT_ID = 'system:news-default-tags';

/** How many tags the model is asked for, and how many valid ones a generation keeps. */
export const AI_TAGS_ASKED = 5;
export const AI_TAGS_MIN = 3;
export const AI_TAGS_MAX = 6;

/** One job run looks at this many members and makes at most this many model calls. */
export const GENERATION_CANDIDATES_PER_RUN = 200;
export const GENERATION_CALLS_PER_RUN = 50;
const GENERATION_CONCURRENCY = 5;

/** A member is looked at again after this many days; a failed generation is retried sooner. */
export const RECHECK_AFTER_DAYS = 7;
export const FAILED_RETRY_AFTER_DAYS = 1;
export const MAX_FAILED_ATTEMPTS = 3;

/** Whether the hourly AI news tags job runs in this environment. Anything but "true" is off. */
export function isNewsDefaultTagsJobEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NEWS_DEFAULT_TAGS_JOB_ENABLED ?? '').trim().toLowerCase() === 'true';
}

export type TagInputMember = {
  bio: string | null;
  ohInterest: string[];
  ohHelpWith: string[];
  skills: { title: string }[];
  teamMemberRoles: {
    role: string | null;
    team: {
      name: string;
      shortDescription: string | null;
      teamFocusAreas: { focusArea: { title: string } }[];
    };
  }[];
  projectContributions: { project: { name: string; tagline: string | null } | null }[];
};

type StoredRow = {
  inputHash: string | null;
  generatedAt: Date | null;
  failedAttempts: number;
  lastAttemptAt: Date | null;
};

export type GenerationPlan =
  | 'generate'
  | 'skip-member-set'
  | 'skip-interest-profile'
  | 'skip-no-input'
  | 'skip-unchanged'
  | 'skip-gave-up';

export type GenerationRunResult = {
  candidates: number;
  generated: number;
  failed: number;
  skipped: number;
};

/**
 * The news tags in a model reply, in the order given: the reply's JSON object
 * (bare or inside a code fence) with a `tags` list. Slugs that are not news
 * tags and repeats are dropped. A reply that is not such an object gives `[]`.
 */
export function parseSuggestedTags(reply: string, vocabulary: NewsTagVocabulary, limit: number): string[] {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  const tags = (parsed as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(tags)) return [];
  const valid = tags.filter((tag): tag is string => typeof tag === 'string' && vocabulary.has(tag));
  return [...new Set(valid)].slice(0, limit);
}

/**
 * What the model reads about a member: bio, skills, office hours topics, teams
 * (role, description, focus areas) and projects. No email, handle or phone.
 * `null` when the member has none of them.
 */
export function buildTagInput(member: TagInputMember): string | null {
  const clean = (values: (string | null | undefined)[]) => values.map((v) => (v ?? '').trim()).filter(Boolean);
  const bio = stripHtmlToPlainText(member.bio).slice(0, BIO_MAX_CHARS);
  const skills = clean(member.skills.map((skill) => skill.title));
  const interests = clean(member.ohInterest);
  const helpWith = clean(member.ohHelpWith);
  const teams = member.teamMemberRoles
    .filter((role) => role.team.name.trim())
    .map((role) => {
      const name = role.team.name.trim();
      const title = role.role?.trim() ? `${role.role.trim()} at ${name}` : name;
      const about = stripHtmlToPlainText(role.team.shortDescription);
      const areas = clean(role.team.teamFocusAreas.map((tfa) => tfa.focusArea.title));
      return [title, about, areas.length > 0 ? `focus areas: ${areas.join(', ')}` : ''].filter(Boolean).join(' - ');
    });
  const projects = member.projectContributions
    .filter((contribution) => contribution.project?.name.trim())
    .map((contribution) => clean([contribution.project?.name, contribution.project?.tagline]).join(' - '));
  const lines = [
    bio && `Bio: ${bio}`,
    skills.length > 0 && `Skills: ${skills.join(', ')}`,
    interests.length > 0 && `Wants to talk about: ${interests.join(', ')}`,
    helpWith.length > 0 && `Can help with: ${helpWith.join(', ')}`,
    teams.length > 0 && `Teams: ${teams.join('; ')}`,
    projects.length > 0 && `Projects: ${projects.join('; ')}`,
  ].filter((line): line is string => Boolean(line));
  return lines.length > 0 ? lines.join('\n') : null;
}

export function hashTagInput(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * What the job does with one member it looks at. AI tags are made for a member
 * with no saved tags and no usable profile topic who has data to read; they
 * are made again only when that data changed. The same data is tried at most
 * MAX_FAILED_ATTEMPTS times.
 */
export function planGeneration(input: {
  hasChosenTags: boolean;
  hasProfileTopics: boolean;
  inputHash: string | null;
  row: Pick<StoredRow, 'inputHash' | 'generatedAt' | 'failedAttempts'> | null;
}): GenerationPlan {
  if (input.hasChosenTags) return 'skip-member-set';
  if (input.hasProfileTopics) return 'skip-interest-profile';
  if (!input.inputHash) return 'skip-no-input';
  if (input.row?.inputHash === input.inputHash) {
    if (input.row.failedAttempts >= MAX_FAILED_ATTEMPTS) return 'skip-gave-up';
    if (input.row.generatedAt && input.row.failedAttempts === 0) return 'skip-unchanged';
  }
  return 'generate';
}

const TAG_INPUT_SELECT = {
  bio: true,
  ohInterest: true,
  ohHelpWith: true,
  skills: { select: { title: true } },
  teamMemberRoles: {
    select: {
      role: true,
      team: {
        select: {
          name: true,
          shortDescription: true,
          teamFocusAreas: { select: { focusArea: { select: { title: true } } } },
        },
      },
    },
  },
  projectContributions: { select: { project: { select: { name: true, tagline: true } } } },
};

/**
 * Default news tags (LAB-3249): the tags the system uses for a member, shown
 * on the Home tag card, and the member's answer to that card.
 *
 * - Read: the saved list, else the starting tags (interest profile, stored AI
 *   tags, team focus areas) with their source. Never calls the model.
 * - Answer: approving records that the member saw the tags and changes nothing
 *   else; the tags stay in use either way.
 * - Generation: the hourly job makes AI tags for members with no saved tags
 *   and no usable profile topic, and makes them again when the member data
 *   changed. `lastAttemptAt` is the claim that keeps two API instances off the
 *   same member.
 */
@Injectable()
export class NewsDefaultTagsService {
  private readonly logger = new Logger(NewsDefaultTagsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiProvider: AiProviderService,
    private readonly tagVocabulary: NewsTagVocabularyService,
    private readonly analytics: AnalyticsService
  ) {}

  async getDefaultTags(memberUid: string): Promise<TeamNewsDefaultTagsResponse> {
    const [vocabulary, member] = await Promise.all([
      this.tagVocabulary.getVocabulary(),
      this.prisma.member.findUnique({
        where: { uid: memberUid },
        select: { preferences: true, newsTagSuggestion: { select: { approvedAt: true, generatedAt: true } } },
      }),
    ]);
    const row = member?.newsTagSuggestion ?? null;
    const approvedAt = row?.approvedAt?.toISOString() ?? null;
    const withTitles = (slugs: string[]) => slugs.map((slug) => ({ slug, title: vocabulary.get(slug)?.title ?? slug }));

    const chosen = readChosenNewsTags(member?.preferences);
    if (chosen) {
      return { tags: withTitles(chosen), source: 'member-set', approved: true, approvedAt, generatedAt: null };
    }
    const starting = (await this.tagVocabulary.startingTagsForMembers([memberUid])).get(memberUid);
    const source = starting?.source ?? 'team';
    return {
      tags: withTitles(starting?.tags ?? []),
      source,
      approved: approvedAt !== null,
      approvedAt,
      generatedAt: source === 'ai' ? row?.generatedAt?.toISOString() ?? null : null,
    };
  }

  /**
   * The member's answer to the tag card. Without `tags` it approves the tags as
   * shown; with `tags` it first saves them as the member's own through
   * `saveTags` (the preferences save, which rejects an unknown slug). The first
   * answer sets `approvedAt`; later ones keep it.
   */
  async answer(
    memberUid: string,
    tags: string[] | undefined,
    saveTags: (tags: string[]) => Promise<unknown>,
    now: Date = new Date()
  ): Promise<TeamNewsDefaultTagsResponse> {
    const before = await this.getDefaultTags(memberUid);
    if (tags) await saveTags(tags);
    if (!before.approvedAt) {
      await this.prisma.memberNewsTagSuggestion.upsert({
        where: { memberUid },
        create: { memberUid, approvedAt: now },
        update: { approvedAt: now },
      });
    }
    void this.analytics.trackEvent({
      name: tags ? ANALYTICS_EVENTS.TEAM_NEWS.DEFAULT_TAGS_REPLACED : ANALYTICS_EVENTS.TEAM_NEWS.DEFAULT_TAGS_APPROVED,
      distinctId: memberUid,
      properties: {
        memberUid,
        sourceBefore: before.source,
        shownCount: before.tags.length,
        savedCount: tags?.length ?? before.tags.length,
        firstAnswer: !before.approvedAt,
      },
    });
    return this.getDefaultTags(memberUid);
  }

  /** One job run: look at the members that are due and make AI tags where the plan says so. */
  async runGeneration(now: Date = new Date()): Promise<GenerationRunResult> {
    const recheckBefore = new Date(now.getTime() - RECHECK_AFTER_DAYS * DAY_MS);
    const retryBefore = new Date(now.getTime() - FAILED_RETRY_AFTER_DAYS * DAY_MS);
    const [vocabulary, candidates] = await Promise.all([
      this.tagVocabulary.getVocabulary(),
      this.prisma.member.findMany({
        where: {
          deletedAt: null,
          NOT: excludedMemberWhere(),
          OR: [
            { newsTagSuggestion: { is: null } },
            {
              newsTagSuggestion: {
                is: {
                  OR: [
                    { lastAttemptAt: null },
                    { lastAttemptAt: { lt: recheckBefore } },
                    { failedAttempts: { gte: 1, lt: MAX_FAILED_ATTEMPTS }, lastAttemptAt: { lt: retryBefore } },
                  ],
                },
              },
            },
          ],
        },
        select: {
          uid: true,
          preferences: true,
          ...TAG_INPUT_SELECT,
          newsTagSuggestion: {
            select: { inputHash: true, generatedAt: true, failedAttempts: true, lastAttemptAt: true },
          },
        },
        orderBy: { id: 'asc' },
        take: GENERATION_CANDIDATES_PER_RUN,
      }),
    ]);
    const withProfileTopics = await this.membersWithProfileTopics(
      candidates.map((c) => c.uid),
      vocabulary
    );

    const result: GenerationRunResult = { candidates: candidates.length, generated: 0, failed: 0, skipped: 0 };
    const toGenerate: { uid: string; input: string; inputHash: string; row: StoredRow | null }[] = [];
    for (const candidate of candidates) {
      const input = buildTagInput(candidate);
      const inputHash = input ? hashTagInput(input) : null;
      const row = candidate.newsTagSuggestion;
      const plan = planGeneration({
        hasChosenTags: Boolean(readChosenNewsTags(candidate.preferences)),
        hasProfileTopics: withProfileTopics.has(candidate.uid),
        inputHash,
        row,
      });
      // Members past the call budget are left unclaimed, so the next run takes them.
      if (plan === 'generate' && toGenerate.length >= GENERATION_CALLS_PER_RUN) continue;
      if (!(await this.claim(candidate.uid, row, now))) continue;
      if (plan === 'generate' && input && inputHash) {
        toGenerate.push({ uid: candidate.uid, input, inputHash, row });
      } else {
        result.skipped += 1;
      }
    }

    for (let i = 0; i < toGenerate.length; i += GENERATION_CONCURRENCY) {
      const outcomes = await Promise.all(
        toGenerate.slice(i, i + GENERATION_CONCURRENCY).map((item) => this.generateFor(item, vocabulary, now))
      );
      for (const ok of outcomes) result[ok ? 'generated' : 'failed'] += 1;
    }
    this.logger.log(
      `AI news tags: ${result.generated} generated, ${result.failed} failed, ${result.skipped} skipped of ${result.candidates} members`
    );
    return result;
  }

  /** The candidates with a usable interest-profile topic. Empty, with no query, while profile starting tags are off. */
  private async membersWithProfileTopics(memberUids: string[], vocabulary: NewsTagVocabulary): Promise<Set<string>> {
    if (!isNewsProfileStartingTagsEnabled() || memberUids.length === 0) return new Set();
    const topics = await this.prisma.memberInterestProfileEntry.findMany({
      where: { memberUid: { in: memberUids }, kind: 'TOPIC', score: { gt: 0 } },
      select: { memberUid: true, key: true },
    });
    return new Set(topics.filter((topic) => vocabulary.has(topic.key)).map((topic) => topic.memberUid));
  }

  /**
   * Take one member for this run by moving `lastAttemptAt` from the value this
   * run read to now. False when another instance took the member first.
   */
  private async claim(memberUid: string, row: StoredRow | null, now: Date): Promise<boolean> {
    if (!row) {
      try {
        await this.prisma.memberNewsTagSuggestion.create({ data: { memberUid, lastAttemptAt: now } });
        return true;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
        throw error;
      }
    }
    const claimed = await this.prisma.memberNewsTagSuggestion.updateMany({
      where: { memberUid, lastAttemptAt: row.lastAttemptAt },
      data: { lastAttemptAt: now },
    });
    return claimed.count === 1;
  }

  /** Ask the model for one member and store the outcome. True when tags were stored. */
  private async generateFor(
    item: { uid: string; input: string; inputHash: string; row: StoredRow | null },
    vocabulary: NewsTagVocabulary,
    now: Date
  ): Promise<boolean> {
    const startedAt = Date.now();
    const model = this.aiProvider.getModelName(PROVIDER_ENV_VAR);
    const { tags, error } = await this.pickTags(item.input, vocabulary);
    const durationMs = Date.now() - startedAt;

    if (tags.length >= AI_TAGS_MIN) {
      await this.prisma.memberNewsTagSuggestion.update({
        where: { memberUid: item.uid },
        data: { tags, inputHash: item.inputHash, model, generatedAt: now, failedAttempts: 0 },
      });
      void this.analytics.trackEvent({
        name: ANALYTICS_EVENTS.TEAM_NEWS.DEFAULT_TAGS_GENERATED,
        distinctId: GENERATION_DISTINCT_ID,
        properties: {
          memberUid: item.uid,
          tagsCount: tags.length,
          model,
          durationMs,
          trigger: item.row?.generatedAt ? 'refreshed' : 'created',
        },
      });
      return true;
    }

    const failedAttempts = item.row?.inputHash === item.inputHash ? item.row.failedAttempts + 1 : 1;
    await this.prisma.memberNewsTagSuggestion.update({
      where: { memberUid: item.uid },
      data: { inputHash: item.inputHash, failedAttempts },
    });
    void this.analytics.trackEvent({
      name: ANALYTICS_EVENTS.TEAM_NEWS.DEFAULT_TAGS_GENERATION_FAILED,
      distinctId: GENERATION_DISTINCT_ID,
      properties: {
        memberUid: item.uid,
        reason: error ? 'model-error' : 'too-few-tags',
        validTagsCount: tags.length,
        failedAttempts,
        model,
        durationMs,
      },
    });
    return false;
  }

  private async pickTags(input: string, vocabulary: NewsTagVocabulary): Promise<{ tags: string[]; error: boolean }> {
    const tagList = [...vocabulary.values()].map((tag) => `${tag.slug}: ${tag.title}`).join('\n');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
    try {
      const { text } = await generateText({
        model: this.aiProvider.getResponsesModel(PROVIDER_ENV_VAR, { useSearchGrounding: false }),
        system: `You pick news topics for a member of a professional network. Choose only from the given topic list, by slug. Use only what the member data says. Respond only with one JSON object: {"tags": ["slug", ...]}.`,
        prompt: `Topics (slug: title):\n${tagList}\n\nMember:\n${input}\n\nPick the ${AI_TAGS_ASKED} topics this member most likely wants news about, best match first.`,
        temperature: 0.1,
        maxTokens: MODEL_MAX_TOKENS,
        abortSignal: controller.signal,
      });
      return { tags: parseSuggestedTags(text, vocabulary, AI_TAGS_MAX), error: false };
    } catch (error) {
      this.logger.warn(`AI news tags call failed: ${(error as Error).message}`);
      return { tags: [], error: true };
    } finally {
      clearTimeout(timer);
    }
  }
}
