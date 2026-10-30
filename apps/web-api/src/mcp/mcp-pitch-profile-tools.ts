import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { DemoDayFundraisingProfilesService } from '../demo-days/demo-day-fundraising-profiles.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamPitchProfilesService } from '../team-pitches/team-pitch-profiles.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

const NAME_MAX = 150;
const SHORT_DESCRIPTION_MAX = 2000;
const DESCRIPTION_MAX = 20000;
const TAGS_MAX = 20;
const TEAM_FIELDS = ['name', 'shortDescription', 'website', 'industryTags', 'fundingStage'] as const;

function viewerEmail(ctx: McpActorContext): string {
  if (!ctx.email) throw new UnauthorizedException('Your LabOS account has no email');
  return ctx.email;
}

function text(field: string, value: unknown, max: number): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be text`);
  const trimmed = value.trim();
  if (!trimmed) throw new BadRequestException(`${field} can't be empty`);
  if (trimmed.length > max) throw new BadRequestException(`${field} is too long (max ${max})`);
  return trimmed;
}

/**
 * The team fields both profile pages edit, checked and resolved before any write. The services take industry tag and
 * funding stage uids; agents name them, so titles are looked up (case-insensitively) and unknown ones refused.
 */
async function teamFields(prisma: PrismaService, args: Record<string, unknown>) {
  const data: {
    name?: string;
    shortDescription?: string;
    website?: string;
    industryTags?: string[];
    fundingStage?: string;
  } = {};
  if ('name' in args) data.name = text('name', args.name, NAME_MAX);
  if ('shortDescription' in args)
    data.shortDescription = text('shortDescription', args.shortDescription, SHORT_DESCRIPTION_MAX);
  if ('website' in args) {
    const website = text('website', args.website, 500);
    if (!/^https?:\/\/\S+$/i.test(website)) throw new BadRequestException('website must be an http(s) link');
    data.website = website;
  }
  if ('industryTags' in args) {
    const titles = Array.isArray(args.industryTags)
      ? args.industryTags.map((t) => String(t).trim()).filter(Boolean)
      : null;
    if (!titles || titles.length === 0 || titles.length > TAGS_MAX) {
      throw new BadRequestException(`industryTags must be a list of 1 to ${TAGS_MAX} LabOS industry tags`);
    }
    const found = await prisma.industryTag.findMany({
      where: { OR: titles.map((title) => ({ title: { equals: title, mode: 'insensitive' as const } })) },
      select: { uid: true, title: true },
    });
    const missing = titles.filter((t) => !found.some((f) => f.title.toLowerCase() === t.toLowerCase()));
    if (missing.length) throw new BadRequestException(`Unknown industry tags: ${missing.join(', ')}`);
    data.industryTags = found.map((f) => f.uid);
  }
  if ('fundingStage' in args) {
    const title = text('fundingStage', args.fundingStage, 100);
    const stage = await prisma.fundingStage.findFirst({
      where: { title: { equals: title, mode: 'insensitive' } },
      select: { uid: true },
    });
    if (!stage) {
      const stages = await prisma.fundingStage.findMany({ select: { title: true } });
      throw new BadRequestException(
        `Unknown funding stage: ${title}. Use one of: ${stages.map((s) => s.title).join(', ')}`
      );
    }
    data.fundingStage = stage.uid;
  }
  return data;
}

const teamInputSchema = {
  name: z.string().optional().describe('Team name'),
  shortDescription: z.string().optional(),
  website: z.string().optional().describe('https:// link'),
  industryTags: z.array(z.string()).optional().describe('LabOS industry tag titles; replaces the list'),
  fundingStage: z.string().optional().describe('LabOS funding stage title, e.g. "Seed"'),
};

/**
 * `update_fundraising_profile` and `update_team_pitch_profile` in the `directory` scope (LAB-3064): the founder edits
 * on a Demo Day fundraising profile and on a team pitch, through the same services as those pages, which check access
 * themselves (a Demo Day FOUNDER of that team or an admin; a pitch participant with EDIT access or an admin). The team
 * fields change the team's public record. Logo, one-pager and video stay in LabOS.
 */
export function pitchProfileTools(
  fundraising: DemoDayFundraisingProfilesService,
  pitches: TeamPitchProfilesService,
  prisma: PrismaService
): McpToolDef[] {
  return [
    {
      name: 'update_fundraising_profile',
      description:
        "Edit your team's Demo Day fundraising profile, as a founder of that team in that Demo Day: the description " +
        `and the team's ${TEAM_FIELDS.join(', ')}. Send only what to change. Investors see the published profile.`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        demoDay: z.string().describe('Demo Day slug or uid'),
        teamUid: z.string().describe('Your team in that Demo Day'),
        description: z.string().optional().describe('The profile description'),
        ...teamInputSchema,
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['demoDay', 'teamUid', 'description', ...TEAM_FIELDS]);
        const demoDay = requiredUid(args, 'demoDay');
        const teamUid = requiredUid(args, 'teamUid');
        const description = 'description' in args ? text('description', args.description, DESCRIPTION_MAX) : undefined;
        const team = await teamFields(prisma, args);
        if (description === undefined && Object.keys(team).length === 0)
          throw new BadRequestException('Nothing to update');
        const email = viewerEmail(ctx);
        if (Object.keys(team).length) await fundraising.updateFundraisingTeam(email, teamUid, team, demoDay);
        if (description !== undefined)
          await fundraising.updateFundraisingDescription(email, teamUid, description, demoDay);
        // The services return the whole profile card, founders' emails included; the agent gets what changed.
        return {
          updated: [...(description !== undefined ? ['description'] : []), ...Object.keys(team)],
          demoDay,
          teamUid,
        };
      },
    },
    {
      name: 'update_team_pitch_profile',
      description:
        "Edit a LabOS team pitch you can edit: the description (empty string clears it) and the team's " +
        `${TEAM_FIELDS.join(', ')}. Send only what to change.`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        pitch: z.string().describe('Team pitch slug or uid, as in its LabOS link'),
        description: z.string().optional(),
        ...teamInputSchema,
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['pitch', 'description', ...TEAM_FIELDS]);
        const pitch = requiredUid(args, 'pitch');
        let description: string | null | undefined;
        if ('description' in args) {
          if (typeof args.description !== 'string') throw new BadRequestException('description must be text');
          if (args.description.length > DESCRIPTION_MAX) throw new BadRequestException('description is too long');
          description = args.description.trim() || null;
        }
        const team = await teamFields(prisma, args);
        if (description === undefined && Object.keys(team).length === 0)
          throw new BadRequestException('Nothing to update');
        const email = viewerEmail(ctx);
        if (Object.keys(team).length) await pitches.updateTeam(email, pitch, team);
        if (description !== undefined) await pitches.updateProfileDescription(email, pitch, description);
        return { updated: [...(description !== undefined ? ['description'] : []), ...Object.keys(team)], pitch };
      },
    },
  ];
}
