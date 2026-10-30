import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { InvestorProfileType } from '@prisma/client';
import { z } from 'zod';
import { InvestorProfileService } from '../members/investor-profile.service';
import { MembersService } from '../members/members.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

const INVESTOR_TYPES = ['ANGEL', 'FUND', 'ANGEL_AND_FUND'] as const;
const PRIVACY_FIELDS = [
  'showEmail',
  'showDiscord',
  'showTwitter',
  'showLinkedin',
  'showTelegram',
  'showGithub',
  'showGithubHandle',
  'showGithubProjects',
  'isSubscribedToNewsletter',
] as const;

const NOTIFICATION_FIELDS = [
  'subscribed',
  'showInvitationDialog',
  'emailFrequency',
  'byFocusArea',
  'byRole',
  'byFundingStage',
  'byIndustryTag',
  'byTechnology',
  'byKeyword',
  'focusAreaList',
  'roleList',
  'fundingStageList',
  'industryTagList',
  'technologyList',
  'keywordList',
] as const;

function boolField(field: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw new BadRequestException(`${field} must be true or false`);
  return value;
}

/** Profile writes that are not on update_my_profile (LAB-3065 and the rest of the member profile). */
export function profileCoverageTools(deps: {
  members: MembersService;
  investorProfiles: InvestorProfileService;
  notificationSettings: NotificationSettingsService;
}): McpToolDef[] {
  const { members, investorProfiles, notificationSettings } = deps;
  return [
    {
      name: 'update_my_investor_profile',
      description:
        'Update your own investor profile: investment focus, startup stages, fund types, typical check size, ' +
        'investor type (ANGEL, FUND, or ANGEL_AND_FUND), SEC rules acceptance, fund team, and whether you invest ' +
        'via a fund. Setting type also marks you as an investor. Send only the fields to change.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        investmentFocus: z.array(z.string()).optional(),
        typicalCheckSize: z.number().nullable().optional(),
        investInStartupStages: z.array(z.string()).optional(),
        investInFundTypes: z.array(z.string()).optional(),
        type: z.enum(INVESTOR_TYPES).nullable().optional(),
        secRulesAccepted: z.boolean().optional(),
        teamUid: z.string().nullable().optional(),
        isInvestViaFund: z.boolean().optional(),
      },
      execute: async (ctx, args = {}) => {
        const fields = [
          'investmentFocus',
          'typicalCheckSize',
          'investInStartupStages',
          'investInFundTypes',
          'type',
          'secRulesAccepted',
          'teamUid',
          'isInvestViaFund',
        ];
        refuseUnknown(args, fields);
        if (fields.every((field) => !(field in args))) throw new BadRequestException('Nothing to update');
        const current = await investorProfiles.getInvestorProfile(ctx.memberUid);
        const lists = (field: string, fallback: string[] | null | undefined) =>
          field in args ? (args[field] as string[]) : fallback ?? [];
        const saved = await investorProfiles.createOrUpdateInvestorProfile(ctx.memberUid, {
          investmentFocus: lists('investmentFocus', current?.investmentFocus),
          typicalCheckSize:
            'typicalCheckSize' in args
              ? (args.typicalCheckSize as number | null | undefined) ?? undefined
              : current?.typicalCheckSize ?? undefined,
          investInStartupStages: lists('investInStartupStages', current?.investInStartupStages),
          investInFundTypes: lists('investInFundTypes', current?.investInFundTypes),
          type: (('type' in args ? args.type : current?.type) || undefined) as InvestorProfileType | undefined,
          secRulesAccepted:
            'secRulesAccepted' in args
              ? boolField('secRulesAccepted', args.secRulesAccepted)
              : current?.secRulesAccepted,
          teamUid: ('teamUid' in args ? args.teamUid : current?.teamUid) as string | undefined,
          isInvestViaFund:
            'isInvestViaFund' in args
              ? boolField('isInvestViaFund', args.isInvestViaFund)
              : current?.isInvestViaFund ?? undefined,
        });
        return {
          updated: fields.filter((field) => field in args),
          investorProfile: {
            uid: saved.uid,
            type: saved.type,
            investmentFocus: saved.investmentFocus,
            investInStartupStages: saved.investInStartupStages,
            investInFundTypes: saved.investInFundTypes,
            typicalCheckSize: saved.typicalCheckSize,
            secRulesAccepted: saved.secRulesAccepted,
            teamUid: saved.teamUid,
            isInvestViaFund: saved.isInvestViaFund,
          },
        };
      },
    },
    {
      name: 'update_my_privacy',
      description:
        'Change who can see your email and social links, GitHub projects, and whether you get the newsletter. ' +
        `Fields: ${PRIVACY_FIELDS.join(', ')}. Send only what to change.`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: Object.fromEntries(PRIVACY_FIELDS.map((field) => [field, z.boolean().optional()])),
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, PRIVACY_FIELDS);
        const sent = PRIVACY_FIELDS.filter((field) => field in args);
        if (sent.length === 0) throw new BadRequestException('Nothing to update');
        const patch: Record<string, boolean> = {};
        for (const field of sent) patch[field] = boolField(field, args[field]);
        if ('isSubscribedToNewsletter' in patch) {
          await members.updateMemberByUid(ctx.memberUid, { isSubscribedToNewsletter: patch.isSubscribedToNewsletter });
          delete patch.isSubscribedToNewsletter;
        }
        if (Object.keys(patch).length > 0) await members.updatePreference(ctx.memberUid, patch);
        return { updated: sent };
      },
    },
    {
      name: 'update_my_self_role',
      description: 'Set the role label on your LabOS profile, the same control as Settings.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { role: z.string().describe('Your role label, for example Engineer') },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['role']);
        const role = requiredUid(args, 'role');
        await members.setMemberRole(ctx.memberUid, role);
        return { role };
      },
    },
    {
      name: 'delete_my_image',
      description: 'Remove your profile photo. Uploading a new photo stays in LabOS.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {},
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, []);
        await members.deleteMemberImage(ctx.memberUid);
        return { deleted: true };
      },
    },
    {
      name: 'update_notification_settings',
      description:
        'Change recommendation email settings that are not on update_email_preferences: subscribed, frequency, ' +
        'and the focus, role, stage, industry, technology and keyword filters.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        subscribed: z.boolean().optional(),
        showInvitationDialog: z.boolean().optional(),
        emailFrequency: z.number().int().min(1).optional(),
        byFocusArea: z.boolean().optional(),
        byRole: z.boolean().optional(),
        byFundingStage: z.boolean().optional(),
        byIndustryTag: z.boolean().optional(),
        byTechnology: z.boolean().optional(),
        byKeyword: z.boolean().optional(),
        focusAreaList: z.array(z.string()).optional(),
        roleList: z.array(z.string()).optional(),
        fundingStageList: z.array(z.string()).optional(),
        industryTagList: z.array(z.string()).optional(),
        technologyList: z.array(z.string()).optional(),
        keywordList: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, NOTIFICATION_FIELDS);
        const sent = NOTIFICATION_FIELDS.filter((field) => field in args);
        if (sent.length === 0) throw new BadRequestException('Nothing to update');
        const data: Record<string, unknown> = {};
        for (const field of sent) {
          if (field.endsWith('List')) {
            if (!Array.isArray(args[field])) throw new BadRequestException(`${field} must be a list`);
            data[field] = args[field];
          } else if (field === 'emailFrequency') {
            if (typeof args[field] !== 'number') throw new BadRequestException('emailFrequency must be a number');
            data[field] = args[field];
          } else {
            data[field] = boolField(field, args[field]);
          }
        }
        await notificationSettings.updateOrCreateByMemberUid(ctx.memberUid, data as never);
        return { updated: sent };
      },
    },
  ];
}

export function assertOwnEmail(ctx: McpActorContext): string {
  if (!ctx.email) throw new ForbiddenException('Your LabOS account has no email on file.');
  return ctx.email;
}
