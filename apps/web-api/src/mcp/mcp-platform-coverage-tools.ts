import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import {
  ADMIN_PERMISSIONS,
  AI_APPS_PERMISSIONS,
  ROADMAP_PERMISSIONS,
} from '../access-control-v2/access-control-v2.constants';
import { AiAppsAccessService } from '../ai-apps/ai-apps-access.service';
import { AiAppsService } from '../ai-apps/ai-apps.service';
import { FounderSourcingReviewService } from '../founder-sourcing/founder-sourcing-review.service';
import { InvestorListsService } from '../investor-lists/investor-lists.service';
import { INVESTOR_DB_EDIT_PERMISSION } from './mcp.constants';
import { PathfinderService } from '../pathfinder/pathfinder.service';
import { CORRECTION_SUBJECT_TYPES } from '../pathfinder/dto/correction.dto';
import { RBAC_PERMISSION_CODES } from '../rbac/rbac.constants';
import { RoadmapPinsService } from '../roadmap/roadmap-pins.service';
import { RoadmapService } from '../roadmap/roadmap.service';
import {
  CreateRoadmapItemSchema,
  PinRoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from 'libs/contracts/src/schema/roadmap';
import { WarmIntrosV2RegenerateService } from '../warm-intros-v2/warm-intros-v2-regenerate.service';
import { WarmIntrosV2Service } from '../warm-intros-v2/warm-intros-v2.service';
import { McpActorContext, McpToolDef } from './mcp-tools';
import { refuseUnknown, requiredUid } from './mcp-write-tools';

function forbid(ctx: McpActorContext, allowed: string[], message: string) {
  if (!allowed.some((code) => ctx.permissions.has(code)) && !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)) {
    throw new ForbiddenException(message);
  }
}

function zodFail(error: z.ZodError): never {
  throw new BadRequestException(error.issues.map((issue) => issue.message).join('; '));
}

/** AI apps, investor DB, and roadmap writes. */
export function platformCoverageTools(deps: {
  aiApps: AiAppsService;
  aiAccess: AiAppsAccessService;
  regenerate: WarmIntrosV2RegenerateService;
  warmIntros: WarmIntrosV2Service;
  lists: InvestorListsService;
  pathfinder: PathfinderService;
  founders: FounderSourcingReviewService;
  roadmap: RoadmapService;
  pins: RoadmapPinsService;
}): McpToolDef[] {
  const d = deps;
  const canEditInvestors = (ctx: McpActorContext) =>
    forbid(ctx, [INVESTOR_DB_EDIT_PERMISSION], "Your LabOS account can't edit investor records.");
  const canWriteApps = (ctx: McpActorContext) => {
    if (!ctx.permissions.has(AI_APPS_PERMISSIONS.WRITE) && !ctx.permissions.has(ADMIN_PERMISSIONS.DIRECTORY_FULL)) {
      throw new ForbiddenException("Your LabOS account can't edit AI Apps.");
    }
  };

  return [
    {
      name: 'delete_ai_app',
      description: 'Delete one of your AI Apps. Only the creator or a directory admin can.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { appUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['appUid']);
        canWriteApps(ctx);
        const appUid = requiredUid(args, 'appUid');
        await d.aiApps.deleteApp(ctx.memberUid, appUid);
        return { appUid, deleted: true };
      },
    },
    {
      name: 'delete_ai_app_deployment',
      description: 'Remove a prod or preview deployment of one of your AI Apps. Does not delete stored secrets.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { appUid: z.string(), environment: z.enum(['prod', 'preview']) },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['appUid', 'environment']);
        canWriteApps(ctx);
        if (args.environment !== 'prod' && args.environment !== 'preview') {
          throw new BadRequestException('environment must be prod or preview');
        }
        await d.aiApps.deleteTarget(ctx.memberUid, requiredUid(args, 'appUid'), args.environment);
        return { appUid: args.appUid, environment: args.environment, deleted: true };
      },
    },
    {
      name: 'update_ai_app_access',
      description: 'Set an AI App to OPEN or PRIVATE and replace its member whitelist.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        appUid: z.string(),
        access: z.enum(['OPEN', 'PRIVATE']),
        memberUids: z.array(z.string()).optional(),
        environment: z.enum(['prod', 'preview']).optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['appUid', 'access', 'memberUids', 'environment']);
        canWriteApps(ctx);
        if (args.access !== 'OPEN' && args.access !== 'PRIVATE') {
          throw new BadRequestException('access must be OPEN or PRIVATE');
        }
        await d.aiAccess.updateAccess(ctx.memberUid, requiredUid(args, 'appUid'), {
          access: args.access,
          memberUids: Array.isArray(args.memberUids) ? args.memberUids.map(String) : [],
          environment: args.environment === 'preview' ? 'preview' : 'prod',
        } as never);
        return { appUid: args.appUid, access: args.access };
      },
    },
    {
      name: 'update_ai_app_public_paths',
      description: 'Replace the public path patterns on one of your AI Apps.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { appUid: z.string(), publicPaths: z.array(z.string()) },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['appUid', 'publicPaths']);
        canWriteApps(ctx);
        if (!Array.isArray(args.publicPaths)) throw new BadRequestException('publicPaths must be a list');
        await d.aiAccess.updatePublicPaths(ctx.memberUid, requiredUid(args, 'appUid'), {
          publicPaths: args.publicPaths.map(String),
        } as never);
        return { appUid: args.appUid };
      },
    },
    {
      name: 'submit_ai_app_feedback',
      description: 'Send feedback on an AI App you can open.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { appUid: z.string(), text: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['appUid', 'text']);
        const saved = await d.aiApps.submitFeedback(
          ctx.memberUid,
          requiredUid(args, 'appUid'),
          requiredUid(args, 'text')
        );
        return { feedbackUid: saved?.uid ?? null };
      },
    },
    {
      name: 'regenerate_warm_intro',
      description: 'Regenerate warm-intro paths for one investor master profile. Needs investor edit access.',
      visibility: 'investor_db_edit',
      keepUnknownArgs: true,
      inputSchema: { profileUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['profileUid']);
        canEditInvestors(ctx);
        return d.regenerate.regenerate(requiredUid(args, 'profileUid'));
      },
    },
    {
      name: 'add_investor_to_list',
      description: 'Add an investor to an investor list. Needs investor edit access.',
      visibility: 'investor_db_edit',
      keepUnknownArgs: true,
      inputSchema: { listId: z.number().int(), investorId: z.string(), note: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['listId', 'investorId', 'note']);
        canEditInvestors(ctx);
        if (typeof args.listId !== 'number') throw new BadRequestException('listId must be a number');
        return d.lists.addMember(
          args.listId,
          { investorId: requiredUid(args, 'investorId'), note: typeof args.note === 'string' ? args.note : undefined },
          { uid: ctx.memberUid, email: ctx.email }
        );
      },
    },
    {
      name: 'remove_investor_from_list',
      description: 'Remove an investor from an investor list. Needs investor edit access.',
      visibility: 'investor_db_edit',
      keepUnknownArgs: true,
      inputSchema: { listId: z.number().int(), investorId: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['listId', 'investorId']);
        canEditInvestors(ctx);
        if (typeof args.listId !== 'number') throw new BadRequestException('listId must be a number');
        return d.lists.removeMember(args.listId, requiredUid(args, 'investorId'));
      },
    },
    {
      name: 'submit_pathfinder_correction',
      description: 'Submit a Pathfinder correction. Needs investor edit access.',
      visibility: 'investor_db_edit',
      keepUnknownArgs: true,
      inputSchema: {
        subject_type: z.enum(CORRECTION_SUBJECT_TYPES),
        subject_id: z.string(),
        field: z.string(),
        old_value: z.unknown().optional(),
        new_value: z.unknown().optional(),
        note: z.string().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['subject_type', 'subject_id', 'field', 'old_value', 'new_value', 'note']);
        canEditInvestors(ctx);
        return d.pathfinder.createCorrection(
          {
            subject_type: requiredUid(args, 'subject_type'),
            subject_id: requiredUid(args, 'subject_id'),
            field: requiredUid(args, 'field'),
            old_value: args.old_value,
            new_value: args.new_value,
            note: typeof args.note === 'string' ? args.note : undefined,
          },
          { uid: ctx.memberUid, email: ctx.email }
        );
      },
    },
    {
      name: 'resolve_pathfinder_crosswalk',
      description: 'Confirm or reject a Pathfinder crosswalk link. Needs investor edit access.',
      visibility: 'investor_db_edit',
      keepUnknownArgs: true,
      inputSchema: { crosswalkId: z.number().int(), confirmed: z.boolean(), note: z.string().optional() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['crosswalkId', 'confirmed', 'note']);
        canEditInvestors(ctx);
        if (typeof args.crosswalkId !== 'number') throw new BadRequestException('crosswalkId must be a number');
        if (typeof args.confirmed !== 'boolean') throw new BadRequestException('confirmed must be true or false');
        return d.pathfinder.resolveCrosswalk(
          args.crosswalkId,
          { confirmed: args.confirmed, note: typeof args.note === 'string' ? args.note : undefined },
          { uid: ctx.memberUid, email: ctx.email }
        );
      },
    },
    {
      name: 'clear_warm_path_refer',
      description: 'Clear your refer feedback on a warm path.',
      visibility: 'investor_db',
      keepUnknownArgs: true,
      inputSchema: { warmPathUid: z.string(), connectorProfileUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['warmPathUid', 'connectorProfileUid']);
        return d.warmIntros.clearPathRefer(
          requiredUid(args, 'warmPathUid'),
          { connectorProfileUid: requiredUid(args, 'connectorProfileUid') } as never,
          { uid: ctx.memberUid, email: ctx.email }
        );
      },
    },
    {
      name: 'review_sourced_founder',
      description: 'Set review status, channel, or a note on a sourced founder. Needs founder database edit access.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        founderId: z.string(),
        status: z.string().optional(),
        channel: z.string().optional(),
        note: z.string().optional(),
        feedback: z.string().nullable().optional(),
      },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['founderId', 'status', 'channel', 'note', 'feedback']);
        forbid(ctx, [RBAC_PERMISSION_CODES.FOUNDER_DB_EDIT], "Your LabOS account can't review sourced founders.");
        return d.founders.updateReview(
          requiredUid(args, 'founderId'),
          {
            status: args.status,
            channel: args.channel,
            note: args.note,
            feedback: args.feedback,
          } as never,
          ctx.memberUid
        );
      },
    },
    {
      name: 'create_roadmap_item',
      description: 'Create a roadmap idea. Your account must be allowed to create roadmap ideas.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        title: z.string(),
        description: z.string(),
        acceptanceCriteria: z.string().nullable().optional(),
        focusArea: z.string().nullable().optional(),
        type: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        forbid(
          ctx,
          [ROADMAP_PERMISSIONS.IDEA_CREATE, ROADMAP_PERMISSIONS.ADMIN],
          "Your LabOS account can't create roadmap ideas."
        );
        const parsed = CreateRoadmapItemSchema.safeParse(args);
        if (!parsed.success) zodFail(parsed.error);
        const created = await d.roadmap.createItem(parsed.data, ctx.memberUid);
        return { itemUid: (created as { uid?: string })?.uid ?? null };
      },
    },
    {
      name: 'update_roadmap_item',
      description: 'Edit a roadmap item you are allowed to edit.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        itemUid: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        acceptanceCriteria: z.string().nullable().optional(),
        focusArea: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      },
      execute: async (ctx, args = {}) => {
        forbid(
          ctx,
          [ROADMAP_PERMISSIONS.VIEW, ROADMAP_PERMISSIONS.ADMIN],
          "Your LabOS account can't open the roadmap."
        );
        const itemUid = requiredUid(args, 'itemUid');
        const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'itemUid'));
        const parsed = UpdateRoadmapItemSchema.safeParse(rest);
        if (!parsed.success) zodFail(parsed.error);
        await d.roadmap.updateItem(itemUid, parsed.data, ctx.memberUid);
        return { itemUid };
      },
    },
    {
      name: 'pin_roadmap_item',
      description: 'Pin a roadmap item. Your account must be allowed to upvote roadmap items.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        itemUid: z.string(),
        note: z.string().nullable().optional(),
        impact: z.string().nullable().optional(),
        swapItemUid: z.string().nullable().optional(),
      },
      execute: async (ctx, args = {}) => {
        forbid(
          ctx,
          [ROADMAP_PERMISSIONS.ITEM_UPVOTE, ROADMAP_PERMISSIONS.ADMIN],
          "Your LabOS account can't pin roadmap items."
        );
        const itemUid = requiredUid(args, 'itemUid');
        const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'itemUid'));
        const parsed = PinRoadmapItemSchema.safeParse(rest);
        if (!parsed.success) zodFail(parsed.error);
        await d.pins.pinItem(itemUid, parsed.data, ctx.memberUid);
        return { itemUid, pinned: true };
      },
    },
    {
      name: 'unpin_roadmap_item',
      description: 'Remove your pin from a roadmap item.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { itemUid: z.string() },
      execute: async (ctx, args = {}) => {
        refuseUnknown(args, ['itemUid']);
        forbid(
          ctx,
          [ROADMAP_PERMISSIONS.ITEM_UPVOTE, ROADMAP_PERMISSIONS.ADMIN],
          "Your LabOS account can't pin roadmap items."
        );
        const itemUid = requiredUid(args, 'itemUid');
        await d.pins.unpinItem(itemUid, ctx.memberUid);
        return { itemUid, pinned: false };
      },
    },
  ];
}
