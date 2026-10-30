import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import type { AiAppsService } from '../ai-apps/ai-apps.service';
import { FEEDBACK_COMMENT_MAX_LENGTH } from '../ai-apps/dto/feedback-comment.dto';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { McpActorContext, McpToolDef } from './mcp-tools';

const FEEDBACK_LIMIT_MAX = 50;
const FEEDBACK_LIMIT_DEFAULT = 20;
const FEEDBACK_LIST_STATUSES = ['NEW', 'VIEWED', 'IMPLEMENTED'] as const;
const FEEDBACK_UPDATE_STATUSES = ['VIEWED', 'IMPLEMENTED'] as const;

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function clampLimit(value: unknown): number {
  const num = Number(value ?? FEEDBACK_LIMIT_DEFAULT);
  if (!Number.isFinite(num)) return FEEDBACK_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(num), 1), FEEDBACK_LIMIT_MAX);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A bare `YYYY-MM-DD` is a whole UTC day: `from` starts at its first millisecond, `to` ends at its last. */
function dateArg(value: unknown, name: 'from' | 'to'): Date | undefined {
  const raw = stringArg(value);
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${name} must be an ISO 8601 date or date-time`);
  }
  if (name === 'to' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(date.getTime() + DAY_MS - 1);
  }
  return date;
}

/** Hosted image URLs in the feedback text plus each pin's crop: what the LabOS review shows as screenshots. */
export function feedbackScreenshotUrls(item: { text?: unknown; pins?: Array<{ cropUrl?: string | null }> }): string[] {
  const urls: string[] = [];
  const text = typeof item.text === 'string' ? item.text : '';
  for (const match of text.matchAll(/<img\b[^>]*\bsrc=["'](https?:\/\/[^"']+)["']/gi)) {
    urls.push(match[1]);
  }
  for (const pin of item.pins ?? []) {
    if (pin.cropUrl) urls.push(pin.cropUrl);
  }
  return Array.from(new Set(urls));
}

export function aiAppFeedbackTools(aiApps: AiAppsService): McpToolDef[] {
  return [
    {
      name: 'list_my_ai_apps',
      description:
        'List the AI Apps you created (uid, appId, name, status, feedbackEnabled). Then call list_ai_app_feedback with an app uid.',
      visibility: 'always',
      execute: async (ctx) => ({ apps: await aiApps.listOwnAppsForMcp(ctx.memberUid) }),
    },
    {
      name: 'list_ai_app_feedback',
      description:
        'List feedback on one AI App you created, newest first. Each item has the full text (HTML), screenshotUrls, the annotation pins and the conversation. Filter by status and by a createdAt date range. Page with limit (max 50) and offset; nextOffset is null on the last page.',
      visibility: 'always',
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        status: z
          .enum(FEEDBACK_LIST_STATUSES)
          .optional()
          .describe('Only items with this status: NEW, VIEWED or IMPLEMENTED'),
        from: z.string().optional().describe('Only items created at or after this ISO 8601 date or date-time'),
        to: z
          .string()
          .optional()
          .describe('Only items created at or before this ISO 8601 date-time, or during this date (UTC)'),
        limit: z.number().int().min(1).max(FEEDBACK_LIMIT_MAX).optional().describe('Max items (default 20, max 50)'),
        offset: z.number().int().min(0).optional().describe('Pagination offset (use nextOffset from the last page)'),
      },
      execute: async (ctx, args = {}) => {
        const limit = clampLimit(args.limit);
        const offset = Math.max(Math.trunc(Number(args.offset ?? 0)) || 0, 0);
        const status = FEEDBACK_LIST_STATUSES.find((value) => value === args.status);
        const { items, total } = await aiApps.listFeedbackForMcp(ctx.memberUid, stringArg(args.appUid) ?? '', {
          status,
          from: dateArg(args.from, 'from'),
          to: dateArg(args.to, 'to'),
          limit,
          offset,
        });
        return {
          items: items.map((item) => ({ ...item, screenshotUrls: feedbackScreenshotUrls(item) })),
          total,
          limit,
          offset,
          nextOffset: offset + items.length < total ? offset + items.length : null,
        };
      },
    },
    {
      name: 'update_ai_app_feedback_status',
      description:
        'Mark one feedback item on an AI App you created as VIEWED or IMPLEMENTED. With IMPLEMENTED you may add a short closing note on what changed; it is added to the conversation and the member who left the feedback is told.',
      visibility: 'always',
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        feedbackUid: z.string().min(1).describe('Feedback item uid from list_ai_app_feedback'),
        status: z.enum(FEEDBACK_UPDATE_STATUSES).describe('VIEWED or IMPLEMENTED'),
        note: z
          .string()
          .max(FEEDBACK_COMMENT_MAX_LENGTH)
          .optional()
          .describe(`Closing note, only with IMPLEMENTED (max ${FEEDBACK_COMMENT_MAX_LENGTH})`),
      },
      execute: async (ctx, args = {}) => {
        const status = FEEDBACK_UPDATE_STATUSES.find((value) => value === args.status);
        if (!status) {
          throw new BadRequestException('status must be VIEWED or IMPLEMENTED');
        }
        const note = stringArg(args.note);
        if (note && status !== 'IMPLEMENTED') {
          throw new BadRequestException('A closing note is only accepted with status IMPLEMENTED');
        }
        const updated = await aiApps.updateFeedbackStatusForMcp(
          ctx.memberUid,
          stringArg(args.appUid) ?? '',
          stringArg(args.feedbackUid) ?? '',
          status,
          note
        );
        return { uid: updated.uid, appUid: updated.appUid, status: updated.status, hasNote: Boolean(note) };
      },
    },
  ];
}

/** Name and description rules of the LabOS app edit form (`UpdateAppMetadataSchema`). */
const APP_NAME_MAX = 200;
const APP_DESCRIPTION_MAX = 4000;

function appRow(app: { uid: string; appId: string; name: string; description?: string | null; status: string }) {
  return { uid: app.uid, appId: app.appId, name: app.name, description: app.description ?? null, status: app.status };
}

function onlyArgs(args: Record<string, unknown>, allowed: string[]) {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new BadRequestException(`An agent can't send these: ${unknown.join(', ')}`);
  }
  const appUid = stringArg(args.appUid);
  if (!appUid) throw new BadRequestException('appUid is required');
  return appUid;
}

/**
 * `redeploy_ai_app`, `rename_ai_app` and `update_ai_app_description` in the `ai_apps` scope (LAB-3061): the same
 * service calls as the LabOS app page (`POST /v1/ai-apps/:uid/deploy`, `PATCH /v1/ai-apps/:uid`), so only the app's
 * creator or a directory admin can use them, and the member needs `ai_apps.write` like those routes. Redeploy takes
 * no bundle and no secret values: it deploys the stored bundle with the stored secrets.
 */
export function aiAppWriteTools(aiApps: AiAppsService): McpToolDef[] {
  const assertCanWrite = (ctx: McpActorContext) => {
    if (!ctx.permissions.has(AI_APPS_PERMISSIONS.WRITE)) {
      throw new ForbiddenException("Your LabOS account can't deploy or edit AI Apps.");
    }
  };

  return [
    {
      name: 'redeploy_ai_app',
      description:
        'Redeploy one of your AI Apps from its last uploaded bundle, with the secrets already stored in LabOS (the ' +
        "app page's Deploy). Only the app's creator or a directory admin can. Returns the deploy status; check it " +
        'again with list_my_ai_apps. A deploy that is still running must finish first.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: { appUid: z.string().min(1).describe('App uid from list_my_ai_apps') },
      execute: async (ctx, args = {}) => {
        const appUid = onlyArgs(args, ['appUid']);
        assertCanWrite(ctx);
        const result = await aiApps.deployDraft(ctx.memberUid, appUid, undefined, 'prod');
        // The status endpoint needs the app's deploy token, which an agent doesn't hold, so it is not returned.
        return {
          app: appRow(result),
          deploymentId: (result as { deploymentId?: string | null }).deploymentId ?? null,
          pollIntervalSec: result.pollIntervalSec,
          checkStatusWith: 'list_my_ai_apps',
        };
      },
    },
    {
      name: 'rename_ai_app',
      description: `Rename one of your AI Apps in LabOS (up to ${APP_NAME_MAX} characters). It does not redeploy the app.`,
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        name: z.string().describe('New name'),
      },
      execute: async (ctx, args = {}) => {
        const appUid = onlyArgs(args, ['appUid', 'name']);
        const name = typeof args.name === 'string' ? args.name.trim() : '';
        if (!name) throw new BadRequestException("name can't be empty");
        if (name.length > APP_NAME_MAX) throw new BadRequestException(`name is too long (max ${APP_NAME_MAX})`);
        assertCanWrite(ctx);
        return { app: appRow(await aiApps.updateMetadata(ctx.memberUid, appUid, { name })) };
      },
    },
    {
      name: 'update_ai_app_description',
      description:
        `Change the description of one of your AI Apps in LabOS (up to ${APP_DESCRIPTION_MAX} characters; an empty ` +
        'string clears it). It does not redeploy the app.',
      visibility: 'always',
      keepUnknownArgs: true,
      inputSchema: {
        appUid: z.string().min(1).describe('App uid from list_my_ai_apps'),
        description: z.string().describe('New description; empty clears it'),
      },
      execute: async (ctx, args = {}) => {
        const appUid = onlyArgs(args, ['appUid', 'description']);
        if (typeof args.description !== 'string') throw new BadRequestException('description must be text');
        if (args.description.length > APP_DESCRIPTION_MAX) {
          throw new BadRequestException(`description is too long (max ${APP_DESCRIPTION_MAX})`);
        }
        assertCanWrite(ctx);
        return {
          app: appRow(await aiApps.updateMetadata(ctx.memberUid, appUid, { description: args.description })),
        };
      },
    },
  ];
}
