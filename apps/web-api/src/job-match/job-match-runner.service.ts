import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateText } from 'ai';
import { HIDDEN_JOB_OPENING_STATUSES } from '../job-openings/job-openings-query.service';
import { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import {
  CLAUDE_MODEL,
  JEV_CONCURRENCY,
  JEV_MODEL,
  JEV_URL,
  TEAM_CONCURRENCY,
  asStringList,
  blurbPrompt,
  companyKey,
  criteriaPrompt,
  fitsFromAnswers,
  formatRunDate,
  hasSignal,
  jevQuestions,
  jobMatchBlocker,
  type JobMatchBlockerOptions,
  lockUntil,
  mapPool,
  parseCandidateNotes,
  parseCriteria,
  pickInterestNote,
  planTeamWork,
  profileText,
  profileTextHash,
  reusableFits,
  rolePosting,
  roleTextHash,
  scorePayload,
  selectTop,
  utcRunDate,
  withRetry,
  type MatchExperience,
  type MatchJob,
  type MatchMember,
} from './job-match.logic';

const BLANK = '';

function matchKey(
  kind: 'TEAM' | 'ROLE' | 'SCORE' | 'CRITERIA' | 'SUGGESTION',
  ids: { runUid?: string; teamUid?: string; roleUid?: string; memberUid?: string; roleTextHash?: string }
) {
  return {
    kind_runUid_teamUid_roleUid_memberUid_roleTextHash: {
      kind,
      runUid: ids.runUid ?? BLANK,
      teamUid: ids.teamUid ?? BLANK,
      roleUid: ids.roleUid ?? BLANK,
      memberUid: ids.memberUid ?? BLANK,
      roleTextHash: ids.roleTextHash ?? BLANK,
    },
  };
}

export type JobMatchStartResult = {
  status: 'started' | 'already-running' | 'already-completed';
  runUid: string | null;
  runDate: string;
  teamUids?: string[];
};

type TeamRow = { uid: string; name: string };

@Injectable()
export class JobMatchRunner {
  private readonly logger = new Logger(JobMatchRunner.name);
  private inflight: Promise<void> | null = null;
  private heldRunUid: string | null = null;
  private heldRunDate: string | null = null;

  constructor(private readonly prisma: PrismaService, private readonly ai: AiProviderService) {}

  async start(teamUids?: string[], blockerOptions?: JobMatchBlockerOptions): Promise<JobMatchStartResult> {
    const blocker = jobMatchBlocker(blockerOptions);
    if (blocker) {
      throw new Error(blocker.message);
    }
    if (this.inflight) {
      return {
        status: 'already-running',
        runUid: this.heldRunUid,
        runDate: this.heldRunDate ?? formatRunDate(utcRunDate()),
      };
    }

    const claimed = await this.claimRun();
    if (claimed.action === 'done') return claimed.result;

    const scope = teamUids?.length ? teamUids : undefined;
    this.heldRunUid = claimed.runUid;
    this.heldRunDate = claimed.runDate;
    this.inflight = this.execute(claimed.runUid, scope)
      .catch(async (error) => {
        const message = errorText(error);
        this.logger.error(`job match run ${claimed.runUid} failed: ${message}`);
        await this.prisma.jobMatchRun
          .update({
            where: { uid: claimed.runUid },
            data: { status: 'FAILED', lockedUntil: null, error: message },
          })
          .catch(() => undefined);
      })
      .finally(() => {
        this.inflight = null;
        this.heldRunUid = null;
        this.heldRunDate = null;
      });
    return { status: 'started', runUid: claimed.runUid, runDate: claimed.runDate, teamUids: scope };
  }

  private async claimRun(): Promise<
    { action: 'done'; result: JobMatchStartResult } | { action: 'run'; runUid: string; runDate: string }
  > {
    const runDate = utcRunDate();
    const label = formatRunDate(runDate);
    const existing = await this.prisma.jobMatchRun.findUnique({ where: { runDate } });
    if (existing?.status === 'COMPLETED') {
      return { action: 'done', result: { status: 'already-completed', runUid: existing.uid, runDate: label } };
    }
    if (existing?.lockedUntil && existing.lockedUntil.getTime() > Date.now()) {
      return { action: 'done', result: { status: 'already-running', runUid: existing.uid, runDate: label } };
    }
    if (!existing) {
      try {
        const created = await this.prisma.jobMatchRun.create({
          data: { runDate, status: 'RUNNING', lockedUntil: lockUntil() },
        });
        return { action: 'run', runUid: created.uid, runDate: label };
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }
    }

    const row = existing ?? (await this.prisma.jobMatchRun.findUnique({ where: { runDate } }));
    if (!row) throw new Error('job match run disappeared during claim');
    if (row.status === 'COMPLETED') {
      return { action: 'done', result: { status: 'already-completed', runUid: row.uid, runDate: label } };
    }
    const claimed = await this.prisma.jobMatchRun.updateMany({
      where: {
        uid: row.uid,
        status: { in: ['RUNNING', 'FAILED'] },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }],
      },
      data: { status: 'RUNNING', lockedUntil: lockUntil(), error: null },
    });
    if (claimed.count === 0) {
      return { action: 'done', result: { status: 'already-running', runUid: row.uid, runDate: label } };
    }
    return { action: 'run', runUid: row.uid, runDate: label };
  }

  private async execute(runUid: string, teamUids?: string[]): Promise<void> {
    const teams = await this.loadTeams(teamUids);
    const scope = teamUids?.length ? `${teams.length} of ${teamUids.length} requested` : `${teams.length}`;
    this.logger.log(`job match run ${runUid}: ${scope} teams`);
    const failures: string[] = [];
    await mapPool(teams, TEAM_CONCURRENCY, async (team) => {
      try {
        await this.refreshLock(runUid);
        await this.processTeam(runUid, team);
      } catch (error) {
        const message = errorText(error);
        failures.push(`${team.uid}: ${message}`);
        this.logger.error(`job match team ${team.uid} failed: ${message}`);
      }
    });
    if (failures.length) {
      await this.prisma.jobMatchRun.update({
        where: { uid: runUid },
        data: { status: 'FAILED', lockedUntil: null, error: failures.join('; ').slice(0, 500) },
      });
      return;
    }
    if (teamUids?.length) {
      await this.prisma.jobMatchRun.update({
        where: { uid: runUid },
        data: { lockedUntil: null, error: null },
      });
      this.logger.log(`job match run ${runUid} finished ${teams.length} requested teams`);
      return;
    }
    await this.prisma.jobMatchRun.update({
      where: { uid: runUid },
      data: { status: 'COMPLETED', lockedUntil: null, finishedAt: new Date(), error: null },
    });
    this.logger.log(`job match run ${runUid} completed`);
  }

  async processTeam(runUid: string, team: TeamRow): Promise<void> {
    const finishedTeam = await this.prisma.jobMatchRow.findUnique({
      where: matchKey('TEAM', { runUid, teamUid: team.uid }),
      select: { uid: true },
    });
    if (finishedTeam) {
      this.logger.log(`job match team ${team.uid} already complete`);
      return;
    }

    const jobs = await this.loadJobs(team.uid);
    const finishedRoles = await this.prisma.jobMatchRow.findMany({
      where: { runUid, teamUid: team.uid, kind: 'ROLE' },
      select: { roleUid: true },
    });
    const finishedRoleUids = finishedRoles.map((row) => row.roleUid);
    if (!jobs.length || jobs.every((job) => finishedRoleUids.includes(job.uid))) {
      await this.markTeamComplete(runUid, team.uid);
      return;
    }

    const members = (await this.loadMembers(team.uid, team.name)).filter(hasSignal);
    const roleHashes = new Map(jobs.map((job) => [job.uid, roleTextHash(rolePosting(job))]));
    const storedScores = await this.prisma.jobMatchRow.findMany({
      where: { teamUid: team.uid, kind: 'SCORE' },
      select: { memberUid: true, payload: true },
      orderBy: { createdAt: 'desc' },
    });
    const latestScore = new Map<string, unknown>();
    for (const row of storedScores) {
      if (!latestScore.has(row.memberUid)) latestScore.set(row.memberUid, row.payload);
    }
    const scoresByMember = new Map<string, Record<string, number>>();
    for (const member of members) {
      const payload = latestScore.get(member.uid);
      if (payload === undefined) continue;
      const fits = reusableFits(payload, profileTextHash(profileText(member)), roleHashes);
      if (Object.keys(fits).length) scoresByMember.set(member.uid, fits);
    }
    const plan = planTeamWork({
      teamFinished: false,
      roleUids: jobs.map((job) => job.uid),
      finishedRoleUids,
      memberUids: members.map((member) => member.uid),
      scoresByMember,
    });
    if (!plan.rolesToFinish.length) {
      await this.markTeamComplete(runUid, team.uid);
      return;
    }

    const toScore = new Set(plan.membersToScore);
    const jobsForCriteria = toScore.size ? jobs : jobs.filter((job) => plan.rolesToFinish.includes(job.uid));
    const criteriaByUid = new Map<string, string[]>();
    for (const job of jobsForCriteria) {
      criteriaByUid.set(job.uid, await this.criteriaFor(runUid, job));
    }

    const pending = members.filter((member) => toScore.has(member.uid));
    const failed: string[] = [];
    let scored = 0;
    await mapPool(pending, JEV_CONCURRENCY, async (member) => {
      try {
        const text = profileText(member);
        const have = scoresByMember.get(member.uid) ?? {};
        const missing = jobs.filter((job) => !Object.prototype.hasOwnProperty.call(have, job.uid));
        const answers = await withRetry(member.uid, () => this.jev(text, jevQuestions(missing, criteriaByUid)));
        const scores = {
          ...have,
          ...fitsFromAnswers(
            missing.map((job) => job.uid),
            answers
          ),
        };
        scoresByMember.set(member.uid, scores);
        const payload = scorePayload(profileTextHash(text), scores, roleHashes);
        await this.prisma.jobMatchRow.upsert({
          where: matchKey('SCORE', { runUid, teamUid: team.uid, memberUid: member.uid }),
          create: { kind: 'SCORE', runUid, teamUid: team.uid, memberUid: member.uid, payload },
          update: { payload },
        });
        scored += 1;
        if (scored % 20 === 0) await this.refreshLock(runUid);
      } catch (error) {
        failed.push(member.uid);
        this.logger.error(`job match score ${member.uid} failed: ${errorText(error)}`);
      }
    });
    if (failed.length) {
      throw new Error(`Jev failed for ${failed.length} members`);
    }

    const jobsToFinish = jobs.filter((job) => plan.rolesToFinish.includes(job.uid));
    const interestByRole = await this.loadInterest(
      team.uid,
      jobsToFinish.map((job) => job.uid)
    );
    for (const job of jobsToFinish) {
      await this.finishRole(
        runUid,
        team.uid,
        job,
        criteriaByUid.get(job.uid) ?? [],
        members,
        scoresByMember,
        interestByRole.get(job.uid) ?? new Map()
      );
    }
    await this.markTeamComplete(runUid, team.uid);
  }

  private async criteriaFor(runUid: string, job: MatchJob): Promise<string[]> {
    const posting = rolePosting(job);
    const hash = roleTextHash(posting);
    const cached = await this.prisma.jobMatchRow.findFirst({
      where: { kind: 'CRITERIA', roleUid: job.uid, roleTextHash: hash },
      select: { payload: true },
    });
    const cachedCriteria = asStringList(cached?.payload);
    if (cachedCriteria.length >= 4) return cachedCriteria.slice(0, 6);

    const text = await withRetry(job.roleTitle, () => this.claude(criteriaPrompt(posting), 400));
    const criteria = parseCriteria(text);
    try {
      await this.prisma.jobMatchRow.create({
        data: { kind: 'CRITERIA', runUid, roleUid: job.uid, roleTextHash: hash, payload: criteria },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
    return criteria;
  }

  private async finishRole(
    runUid: string,
    teamUid: string,
    job: MatchJob,
    criteria: string[],
    members: MatchMember[],
    scoresByMember: Map<string, Record<string, number>>,
    interest: ReadonlyMap<string, string | null>
  ): Promise<void> {
    const ranked = selectTop(
      members.map((member) => member.uid),
      scoresByMember,
      job.uid,
      new Set(interest.keys())
    );
    const byUid = new Map(members.map((member) => [member.uid, member]));
    let notes = new Map<string, { blurb: string; matched: boolean[] }>();
    if (ranked.length) {
      const people = ranked.flatMap((row) => {
        const member = byUid.get(row.memberUid);
        return member ? [{ member, fit: row.fit }] : [];
      });
      const text = await withRetry(job.roleTitle, () => this.claude(blurbPrompt(job, criteria, people), 2000));
      notes = parseCandidateNotes(
        text,
        people.map((row) => ({ memberUid: row.member.uid, criteriaCount: criteria.length }))
      );
    }

    const suggestions = ranked.map((row, index) => {
      const note = notes.get(row.memberUid);
      return {
        kind: 'SUGGESTION' as const,
        runUid,
        teamUid,
        roleUid: job.uid,
        memberUid: row.memberUid,
        rank: index + 1,
        fit: row.fit,
        label: row.label,
        interested: row.interested,
        interestNote: row.interested ? interest.get(row.memberUid) ?? null : null,
        blurb: note?.blurb ?? null,
        payload: criteria.map((text, criterionIndex) => ({
          text,
          matched: note?.matched[criterionIndex] === true,
        })),
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.jobMatchRow.deleteMany({ where: { kind: 'SUGGESTION', runUid, roleUid: job.uid } });
      if (suggestions.length) {
        await tx.jobMatchRow.createMany({ data: suggestions });
      }
      await tx.jobMatchRow.create({ data: { kind: 'ROLE', runUid, teamUid, roleUid: job.uid } });
    });
  }

  /**
   * Members who said they are interested, per role: interest in the role itself or in the role's team
   * (LAB-2788). It only marks and orders members already in the eligible pool; it never adds one.
   * Each member maps to the note of their interest: the role note wins over the team note (LAB-2802).
   */
  private async loadInterest(teamUid: string, roleUids: string[]): Promise<Map<string, Map<string, string | null>>> {
    const byRole = new Map<string, Map<string, string | null>>();
    if (!roleUids.length) return byRole;
    const [roleInterest, teamInterest] = await Promise.all([
      this.prisma.jobOpeningInterest.findMany({
        where: { jobOpeningUid: { in: roleUids } },
        select: { jobOpeningUid: true, memberUid: true, note: true },
      }),
      this.prisma.teamInterest.findMany({ where: { teamUid }, select: { memberUid: true, message: true } }),
    ]);
    const teamNotes = new Map(teamInterest.map((row) => [row.memberUid, row.message]));
    for (const roleUid of roleUids) {
      byRole.set(roleUid, new Map(teamInterest.map((row) => [row.memberUid, pickInterestNote(null, row.message)])));
    }
    for (const row of roleInterest) {
      byRole.get(row.jobOpeningUid)?.set(row.memberUid, pickInterestNote(row.note, teamNotes.get(row.memberUid)));
    }
    return byRole;
  }

  private async markTeamComplete(runUid: string, teamUid: string): Promise<void> {
    await this.prisma.jobMatchRow.upsert({
      where: matchKey('TEAM', { runUid, teamUid }),
      create: { kind: 'TEAM', runUid, teamUid },
      update: { teamUid },
    });
  }

  private async refreshLock(runUid: string): Promise<void> {
    await this.prisma.jobMatchRun.update({
      where: { uid: runUid },
      data: { lockedUntil: lockUntil() },
    });
  }

  private async loadTeams(teamUids?: string[]): Promise<TeamRow[]> {
    const hidden = Prisma.join(HIDDEN_JOB_OPENING_STATUSES);
    if (teamUids?.length) {
      const ids = Prisma.join(teamUids);
      return this.prisma.$queryRaw<TeamRow[]>`
        SELECT t.uid, t.name
        FROM "Team" t
        WHERE t.uid IN (${ids})
          AND EXISTS (
            SELECT 1 FROM "JobOpening" j
            WHERE j."teamUid" = t.uid
              AND j."publishedAt" IS NOT NULL
              AND j.status::text NOT IN (${hidden})
          )
        ORDER BY t.uid
      `;
    }
    return this.prisma.$queryRaw<TeamRow[]>`
      SELECT t.uid, t.name
      FROM "Team" t
      WHERE EXISTS (
        SELECT 1 FROM "JobOpening" j
        WHERE j."teamUid" = t.uid
          AND j."publishedAt" IS NOT NULL
          AND j.status::text NOT IN (${hidden})
      )
      ORDER BY t.uid
    `;
  }

  private async loadJobs(teamUid: string): Promise<MatchJob[]> {
    const hidden = Prisma.join(HIDDEN_JOB_OPENING_STATUSES);
    const rows = await this.prisma.$queryRaw<MatchJob[]>`
      SELECT uid, "roleTitle", "companyName", "roleCategory", seniority, summary,
             "descriptionHtml", location, "workMode"
      FROM "JobOpening"
      WHERE "teamUid" = ${teamUid}
        AND "publishedAt" IS NOT NULL
        AND status::text NOT IN (${hidden})
      ORDER BY "roleTitle"
    `;
    return rows.map((row) => ({
      ...row,
      location: row.location ?? [],
    }));
  }

  private async loadMembers(teamUid: string, teamName: string): Promise<MatchMember[]> {
    const normalizedTeam = companyKey(teamName);
    const rows = await this.prisma.$queryRaw<MemberSqlRow[]>`
      SELECT
        m.uid,
        m.name,
        m.role,
        m."currentCompany",
        m.bio,
        m."aboutYou",
        m."customSkills",
        loc.city,
        loc.country,
        COALESCE((
          SELECT array_agg(s.title ORDER BY s.title)
          FROM "_MemberToSkill" ms
          JOIN "Skill" s ON s.id = ms."B"
          WHERE ms."A" = m.id
        ), '{}') AS skills,
        COALESCE((
          SELECT json_agg(json_build_object(
            'title', e.title,
            'company', e.company,
            'current', e."isCurrent",
            'description', e.description
          ) ORDER BY e."isCurrent" DESC, e."startDate" DESC)
          FROM (
            SELECT title, company, "isCurrent", "startDate",
                   LEFT(COALESCE(description, ''), 200) AS description
            FROM "MemberExperience"
            WHERE "memberUid" = m.uid
            ORDER BY "isCurrent" DESC, "startDate" DESC
            LIMIT 6
          ) e
        ), '[]'::json) AS experiences,
        COALESCE((
          SELECT json_agg(json_build_object('role', tmr.role, 'team', t.name) ORDER BY tmr."mainTeam" DESC)
          FROM "TeamMemberRole" tmr
          JOIN "Team" t ON t.uid = tmr."teamUid"
          WHERE tmr."memberUid" = m.uid
        ), '[]'::json) AS teams
      FROM "Member" m
      LEFT JOIN "Location" loc ON loc.uid = m."locationUid"
      WHERE m."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM "TeamMemberRole" tmr
          WHERE tmr."memberUid" = m.uid AND tmr."teamUid" = ${teamUid}
        )
        AND (
          ${normalizedTeam} = ''
          OR NOT EXISTS (
            SELECT 1 FROM "MemberExperience" e
            WHERE e."memberUid" = m.uid
              AND lower(regexp_replace(btrim(e.company), '[[:space:]]+', ' ', 'g')) = ${normalizedTeam}
          )
        )
        AND (
          EXISTS (
            SELECT 1 FROM "MemberApproval" a
            WHERE a."memberUid" = m.uid AND a.state IN ('APPROVED', 'VERIFIED')
          )
          OR EXISTS (
            SELECT 1 FROM "PolicyAssignment" pa
            JOIN "Policy" p ON p.uid = pa."policyUid"
            WHERE pa."memberUid" = m.uid AND p.code = 'job_aspirant'
          )
        )
      ORDER BY m.uid
    `;
    return rows.map(toMember);
  }

  private async claude(prompt: string, maxTokens: number): Promise<string> {
    const modelName = process.env.JOB_MATCH_CLAUDE_MODEL || CLAUDE_MODEL;
    const { text } = await generateText({
      model: this.ai.getResponsesModel(undefined, {
        providerOverride: 'anthropic',
        modelOverride: modelName,
        useSearchGrounding: false,
      }),
      prompt,
      maxTokens,
    });
    return text.trim();
  }

  private async jev(
    state: string,
    questions: ReturnType<typeof jevQuestions>
  ): Promise<Record<string, { probability?: number }>> {
    const key = process.env.VERCEL_AI_KEY;
    if (!key) throw new Error('VERCEL_AI_KEY missing');
    const response = await fetch(JEV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: JEV_MODEL,
        state,
        questions,
        providerOptions: { gateway: { zeroDataRetention: true } },
      }),
    });
    const body = (await response.json()) as { answers?: Record<string, { probability?: number }> };
    if (!response.ok || !body.answers) {
      throw new Error(JSON.stringify(body).slice(0, 300));
    }
    return body.answers;
  }
}

type MemberSqlRow = {
  uid: string;
  name: string;
  role: string | null;
  currentCompany: string | null;
  bio: string | null;
  aboutYou: string | null;
  customSkills: string[] | null;
  city: string | null;
  country: string | null;
  skills: string[] | null;
  experiences: unknown;
  teams: unknown;
};

function toMember(row: MemberSqlRow): MatchMember {
  return {
    uid: row.uid,
    name: row.name,
    role: row.role,
    currentCompany: row.currentCompany,
    bio: row.bio,
    aboutYou: row.aboutYou,
    customSkills: row.customSkills ?? [],
    city: row.city,
    country: row.country,
    skills: row.skills ?? [],
    experiences: asExperiences(row.experiences),
    teams: asTeams(row.teams),
  };
}

function asExperiences(value: unknown): MatchExperience[] {
  const rows = asJsonArray(value);
  return rows.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.title !== 'string' || typeof record.company !== 'string') return [];
    return [
      {
        title: record.title,
        company: record.company,
        current: record.current === true,
        description: typeof record.description === 'string' ? record.description : null,
      },
    ];
  });
}

function asTeams(value: unknown): { role: string | null; team: string }[] {
  return asJsonArray(value).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.team !== 'string') return [];
    return [{ role: typeof record.role === 'string' ? record.role : null, team: record.team }];
  });
}

function asJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}
